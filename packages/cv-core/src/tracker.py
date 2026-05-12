"""Kalman filter-based shuttle tracking module.

Provides ShuttleTracker class that uses a Kalman filter to maintain
smooth tracking of shuttlecock positions across frames, handling
occlusion for up to 5 frames and keeping a 30-position track history.
"""
from __future__ import annotations

from collections import deque

import numpy as np

try:
    from filterpy.kalman import KalmanFilter
except ImportError:
    KalmanFilter = None


class ShuttleTracker:
    """Kalman filter tracker for shuttlecock positions.

    Maintains a 4-state Kalman filter (x, y, vx, vy) that predicts
    and updates shuttle positions frame-by-frame. Handles occlusion
    by continuing to predict for up to MAX_OCCLUSION_FRAMES without
    measurement updates.

    Attributes:
        MAX_HISTORY: Maximum number of positions to keep in track history.
        MAX_OCCLUSION_FRAMES: Maximum frames to predict through without detection.
        MIN_HITS: Minimum detections before track is considered valid.
    """

    MAX_HISTORY = 30
    MAX_OCCLUSION_FRAMES = 5
    MIN_HITS = 3

    def __init__(self, dt: float = 1 / 60) -> None:
        """Initialize the tracker with a Kalman filter.

        Args:
            dt: Time step between frames in seconds (default 1/60 for 60fps).

        Raises:
            ImportError: If filterpy is not installed.
        """
        if KalmanFilter is None:
            raise ImportError("filterpy is required — pip install filterpy")
        self.dt = dt
        self.kf = self._init_kalman(dt)
        self.age = 0
        self.hits = 0
        self.consecutive_misses = 0
        self.history: deque[tuple[float, float]] = deque(maxlen=self.MAX_HISTORY)
        self._initialized = False

    @staticmethod
    def _init_kalman(dt: float) -> "KalmanFilter":
        """Create and configure a 4-state Kalman filter.

        State vector: [x, y, vx, vy]
        Measurement vector: [x, y]

        Args:
            dt: Time step between frames in seconds.

        Returns:
            Configured KalmanFilter instance.
        """
        kf = KalmanFilter(dim_x=4, dim_z=2)
        kf.F = np.array([
            [1, 0, dt, 0],
            [0, 1, 0, dt],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ])
        kf.H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
        ])
        kf.R *= 5.0
        kf.P *= 100.0
        kf.Q = np.eye(4) * 0.1
        return kf

    def predict(self) -> tuple[float, float] | None:
        """Predict the next position without a measurement update.

        Returns:
            Predicted (x, y) position, or None if tracker not initialized.
        """
        if not self._initialized:
            return None
        self.kf.predict()
        pos = (float(self.kf.x[0, 0]), float(self.kf.x[1, 0]))
        return pos

    def update(self, detection: tuple[float, float] | None) -> tuple[float, float] | None:
        """Update the tracker with a new detection (or None for occlusion).

        When a detection is provided, the Kalman filter is updated with
        the measurement. When None is provided (occlusion), the filter
        continues to predict for up to MAX_OCCLUSION_FRAMES frames.

        Args:
            detection: (x, y) pixel coordinates of the detection, or
                None if the shuttle was not detected in this frame.

        Returns:
            Filtered (x, y) position estimate, or None if the tracker
            is not yet initialized or has lost the track.
        """
        if detection is not None:
            z = np.array([[detection[0]], [detection[1]]])
            if not self._initialized:
                self.kf.x[:2] = z
                self._initialized = True
            else:
                self.kf.update(z)
            self.hits += 1
            self.age = 0
            self.consecutive_misses = 0
        else:
            self.age += 1
            self.consecutive_misses += 1

        # If too many consecutive misses, track is lost
        if self.consecutive_misses > self.MAX_OCCLUSION_FRAMES:
            return None

        if self._initialized:
            self.kf.predict()
            pos = (float(self.kf.x[0, 0]), float(self.kf.x[1, 0]))
            self.history.append(pos)
            return pos

        return None

    def get_velocity(self) -> tuple[float, float] | None:
        """Get the current estimated velocity from the Kalman state.

        Returns:
            (vx, vy) velocity in pixels per time step, or None if
            the tracker has not been initialized.
        """
        if not self._initialized:
            return None
        vx = float(self.kf.x[2, 0])
        vy = float(self.kf.x[3, 0])
        return (vx, vy)

    def get_track_history(self) -> list[tuple[float, float]]:
        """Return the last 30 tracked positions.

        Returns:
            List of (x, y) position tuples, most recent last.
        """
        return list(self.history)

    def is_valid(self) -> bool:
        """Check if the track has enough hits and is not too old.

        Returns:
            True if the track is considered valid and active.
        """
        return (
            self.hits >= self.MIN_HITS
            and self.consecutive_misses <= self.MAX_OCCLUSION_FRAMES
        )

    def reset(self) -> None:
        """Reset the tracker to its initial state."""
        self.kf = self._init_kalman(self.dt)
        self.age = 0
        self.hits = 0
        self.consecutive_misses = 0
        self.history.clear()
        self._initialized = False


if __name__ == "__main__":
    print("ShuttleTracker Demo")
    print("=" * 40)

    tracker = ShuttleTracker(dt=1 / 60)

    # Simulate a shuttle moving diagonally
    positions = [(100 + i * 5, 200 + i * 3) for i in range(20)]

    # Feed detections
    for i, pos in enumerate(positions):
        tracked = tracker.update(pos)
        if tracked:
            print(f"Frame {i:3d}: detected={pos}, tracked=({tracked[0]:.1f}, {tracked[1]:.1f})")

    # Simulate 5 frames of occlusion
    print("\n--- Occlusion (5 frames) ---")
    for i in range(5):
        tracked = tracker.update(None)
        if tracked:
            print(f"Occluded {i+1}: predicted=({tracked[0]:.1f}, {tracked[1]:.1f})")
        else:
            print(f"Occluded {i+1}: track lost")

    # Try 6th frame of occlusion (should lose track)
    tracked = tracker.update(None)
    print(f"\nOccluded 6: {'track lost' if tracked is None else f'({tracked[0]:.1f}, {tracked[1]:.1f})'}")

    print(f"\nTrack history length: {len(tracker.get_track_history())} (max {tracker.MAX_HISTORY})")
    print(f"Track valid: {tracker.is_valid()}")
    velocity = tracker.get_velocity()
    if velocity:
        print(f"Velocity: ({velocity[0]:.2f}, {velocity[1]:.2f}) px/frame")
