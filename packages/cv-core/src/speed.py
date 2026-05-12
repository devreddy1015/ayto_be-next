from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np


@dataclass
class CourtCalibration:
    court_length_m: float = 13.4
    court_width_m: float = 6.1
    court_corners_px: list[tuple[float, float]] = field(default_factory=list)
    pixels_per_meter: float = 0.0

    def calibrate(self, corners_px: list[tuple[float, float]]) -> None:
        if len(corners_px) < 2:
            raise ValueError("Need at least 2 corner points for calibration")
        self.court_corners_px = corners_px
        p1, p2 = np.array(corners_px[0]), np.array(corners_px[1])
        pixel_dist = float(np.linalg.norm(p2 - p1))
        self.pixels_per_meter = pixel_dist / self.court_length_m

    def calibrate_auto(self, frame_width: int, frame_height: int) -> None:
        margin_x = frame_width * 0.1
        margin_y = frame_height * 0.1
        corners = [
            (margin_x, margin_y),
            (frame_width - margin_x, frame_height - margin_y),
        ]
        self.calibrate(corners)


class SpeedCalculator:
    KMH_FACTOR = 3.6

    def __init__(self, fps: float = 60.0, calibration: CourtCalibration | None = None) -> None:
        self.fps = fps
        self.calibration = calibration or CourtCalibration()
        self._prev_pos: tuple[float, float] | None = None
        self._speeds: list[float] = []

    def compute_speed(
        self,
        pos: tuple[float, float],
    ) -> float | None:
        if self.calibration.pixels_per_meter <= 0:
            return None

        if self._prev_pos is None:
            self._prev_pos = pos
            return None

        dx = pos[0] - self._prev_pos[0]
        dy = pos[1] - self._prev_pos[1]
        pixel_dist = math.sqrt(dx * dx + dy * dy)

        meters = pixel_dist / self.calibration.pixels_per_meter
        seconds = 1.0 / self.fps
        speed_ms = meters / seconds
        speed_kmh = speed_ms * self.KMH_FACTOR

        self._prev_pos = pos
        self._speeds.append(speed_kmh)
        return speed_kmh

    def get_average_speed(self) -> float:
        if not self._speeds:
            return 0.0
        return sum(self._speeds) / len(self._speeds)

    def get_max_speed(self) -> float:
        return max(self._speeds) if self._speeds else 0.0

    def get_speed_history(self) -> list[float]:
        return list(self._speeds)

    def reset(self) -> None:
        self._prev_pos = None
        self._speeds.clear()
