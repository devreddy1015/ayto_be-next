from __future__ import annotations

import numpy as np

try:
    from filterpy.kalman import KalmanFilter
except ImportError:
    KalmanFilter = None


class ShuttleTracker:
    MAX_AGE = 10
    MIN_HITS = 3

    def __init__(self, dt: float = 1 / 60) -> None:
        if KalmanFilter is None:
            raise ImportError("filterpy is required — pip install filterpy")
        self.dt = dt
        self.kf = self._init_kalman(dt)
        self.age = 0
        self.hits = 0
        self.history: list[np.ndarray] = []
        self._initialized = False

    @staticmethod
    def _init_kalman(dt: float) -> "KalmanFilter":
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

    def update(self, detection: tuple[float, float] | None) -> tuple[float, float] | None:
        if detection is not None:
            z = np.array([[detection[0]], [detection[1]]])
            if not self._initialized:
                self.kf.x[:2] = z
                self._initialized = True
            else:
                self.kf.update(z)
            self.hits += 1
            self.age = 0
        else:
            self.age += 1

        if self._initialized:
            self.kf.predict()
            pos = (float(self.kf.x[0, 0]), float(self.kf.x[1, 0]))
            self.history.append(np.array(pos))
            return pos

        return None

    def get_velocity(self) -> tuple[float, float] | None:
        if not self._initialized:
            return None
        vx = float(self.kf.x[2, 0])
        vy = float(self.kf.x[3, 0])
        return (vx, vy)

    def is_valid(self) -> bool:
        return self.hits >= self.MIN_HITS and self.age <= self.MAX_AGE

    def reset(self) -> None:
        self.kf = self._init_kalman(self.dt)
        self.age = 0
        self.hits = 0
        self.history.clear()
        self._initialized = False
