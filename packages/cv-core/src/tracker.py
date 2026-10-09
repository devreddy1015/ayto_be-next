"""Online shuttle tracking with a constant-acceleration Kalman filter.

The previous tracker used a constant-velocity model and returned the one-step
*prediction* after each update, so its output lagged the detection. This
version:

* models constant acceleration, which in image space approximates gravity
  plus drag over a few frames;
* returns the filtered (posterior) estimate when a detection arrives;
* gates measurements by Mahalanobis distance, so clutter far from the
  predicted path is ignored (WASB found this kind of candidate filtering,
  not heavier filtering, is what matters);
* re-acquires immediately after a hit: two consecutive gated-out detections
  that agree with each other restart the track there, instead of coasting
  on the pre-hit motion.

Pure numpy; no filterpy dependency.
"""
from __future__ import annotations

from collections import deque

import numpy as np

# chi-square 99% quantile for 2 degrees of freedom
_GATE_CHI2 = 9.21


class ShuttleTracker:
    """Constant-acceleration Kalman tracker for one small fast object.

    Attributes:
        MAX_HISTORY: Positions kept in the track history.
        MAX_OCCLUSION_FRAMES: Frames to coast through without a detection.
        MIN_HITS: Detections before the track counts as valid.
        REACQUIRE_PX: Two consecutive gated-out detections closer than this
            (scaled by the frame gap) restart the track.
    """

    MAX_HISTORY = 30
    MAX_OCCLUSION_FRAMES = 5
    MIN_HITS = 3
    REACQUIRE_PX = 60.0

    def __init__(
        self,
        dt: float = 1 / 60,
        measurement_noise_px: float = 2.0,
        process_noise: float = 3e9,
    ) -> None:
        """Initialise the tracker.

        Args:
            dt: Seconds between frames.
            measurement_noise_px: Detector localisation noise (1 sigma, px).
            process_noise: Jerk spectral density (px^2/s^5). Tuned on simulated
                quadratic-drag flights at 60 fps with 2 px detector noise: no
                true detection is gated out, while clutter more than ~20 px
                off the path is rejected.
        """
        self.dt = dt
        self._r = np.eye(2) * measurement_noise_px ** 2
        self._q_scale = process_noise
        self._f, self._q = self._model(dt)
        self._h = np.zeros((2, 6))
        self._h[0, 0] = self._h[1, 1] = 1.0
        self.history: deque[tuple[float, float]] = deque(maxlen=self.MAX_HISTORY)
        self.reset()

    def _model(self, dt: float) -> tuple[np.ndarray, np.ndarray]:
        f1 = np.array([[1, dt, dt * dt / 2], [0, 1, dt], [0, 0, 1]])
        q1 = self._q_scale * np.array([
            [dt ** 5 / 20, dt ** 4 / 8, dt ** 3 / 6],
            [dt ** 4 / 8, dt ** 3 / 3, dt ** 2 / 2],
            [dt ** 3 / 6, dt ** 2 / 2, dt],
        ])
        # State order: x, y, vx, vy, ax, ay
        order = [0, 2, 4, 1, 3, 5]
        f = np.zeros((6, 6))
        q = np.zeros((6, 6))
        for axis in range(2):
            idx = order[axis * 3:(axis + 1) * 3]
            f[np.ix_(idx, idx)] = f1
            q[np.ix_(idx, idx)] = q1
        return f, q

    # ------------------------------------------------------------------
    def _init_at(self, z: np.ndarray) -> None:
        self.x = np.zeros(6)
        self.x[:2] = z
        self.p = np.diag([self._r[0, 0], self._r[1, 1], 1e6, 1e6, 1e8, 1e8])
        self._initialized = True

    def _predict(self) -> None:
        self.x = self._f @ self.x
        self.p = self._f @ self.p @ self._f.T + self._q

    def _innovation(self, z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        y = z - self._h @ self.x
        s = self._h @ self.p @ self._h.T + self._r
        return y, s

    def _correct(self, y: np.ndarray, s: np.ndarray) -> None:
        k = self.p @ self._h.T @ np.linalg.inv(s)
        self.x = self.x + k @ y
        self.p = (np.eye(6) - k @ self._h) @ self.p

    # ------------------------------------------------------------------
    def predict(self) -> tuple[float, float] | None:
        """Advance one frame without a measurement; return the predicted position."""
        if not self._initialized:
            return None
        self._predict()
        return float(self.x[0]), float(self.x[1])

    def update(self, detection: tuple[float, float] | None) -> tuple[float, float] | None:
        """Advance one frame and fuse a detection, if any.

        Args:
            detection: (x, y) pixels, or None when nothing was detected.

        Returns:
            The filtered position, or None if there is no live track.
        """
        if not self._initialized:
            if detection is None:
                return None
            self._init_at(np.asarray(detection, dtype=float))
            self.hits = 1
            return self._emit()

        self._predict()
        if detection is not None:
            z = np.asarray(detection, dtype=float)
            y, s = self._innovation(z)
            if float(y @ np.linalg.solve(s, y)) <= _GATE_CHI2 or self.hits < self.MIN_HITS:
                self._correct(y, s)
                self.hits += 1
                self.consecutive_misses = 0
                self._rejected = None
                return self._emit()
            # Gated out: maybe clutter, maybe the object just got hit.
            if self._rejected is not None and (
                np.linalg.norm(z - self._rejected)
                <= self.REACQUIRE_PX * (self.consecutive_misses + 1)
            ):
                prev = self._rejected
                self._init_at(z)
                self.x[2:4] = (z - prev) / self.dt
                self.hits = 2
                self.consecutive_misses = 0
                self._rejected = None
                return self._emit()
            self._rejected = z

        self.consecutive_misses += 1
        if self.consecutive_misses > self.MAX_OCCLUSION_FRAMES:
            self._initialized = False
            self.hits = 0
            return None
        return self._emit()

    def _emit(self) -> tuple[float, float]:
        pos = (float(self.x[0]), float(self.x[1]))
        self.history.append(pos)
        return pos

    def get_velocity(self) -> tuple[float, float] | None:
        """Estimated (vx, vy) in pixels per second."""
        if not self._initialized:
            return None
        return float(self.x[2]), float(self.x[3])

    def get_track_history(self) -> list[tuple[float, float]]:
        """Recent tracked positions, oldest first."""
        return list(self.history)

    def is_valid(self) -> bool:
        """True once the track has enough hits and isn't lost."""
        return (
            self._initialized
            and self.hits >= self.MIN_HITS
            and self.consecutive_misses <= self.MAX_OCCLUSION_FRAMES
        )

    def reset(self) -> None:
        """Forget the current track."""
        self.x = np.zeros(6)
        self.p = np.eye(6)
        self.hits = 0
        self.consecutive_misses = 0
        self._rejected: np.ndarray | None = None
        self._initialized = False
        self.history.clear()
