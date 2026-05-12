"""Speed computation module for shuttlecock tracking.

Provides SpeedCalculator class that converts pixel displacements into
real-world speed in km/h using court calibration and Kalman smoothing.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np


@dataclass
class CourtCalibration:
    """Court calibration data for pixel-to-meter conversion.

    Attributes:
        court_length_m: Real court length in meters (default 13.4m).
        court_width_m: Real court width in meters (default 6.1m).
        court_corners_px: Pixel coordinates of court corners.
        pixels_per_meter: Computed pixels per meter ratio.
    """

    court_length_m: float = 13.4
    court_width_m: float = 6.1
    court_corners_px: list[tuple[float, float]] = field(default_factory=list)
    pixels_per_meter: float = 0.0

    def calibrate(self, corners_px: list[tuple[float, float]]) -> None:
        """Calibrate using two corner points and the court length.

        Args:
            corners_px: At least 2 pixel coordinate pairs for court corners.

        Raises:
            ValueError: If fewer than 2 corner points are provided.
        """
        if len(corners_px) < 2:
            raise ValueError("Need at least 2 corner points for calibration")
        self.court_corners_px = corners_px
        p1, p2 = np.array(corners_px[0]), np.array(corners_px[1])
        pixel_dist = float(np.linalg.norm(p2 - p1))
        self.pixels_per_meter = pixel_dist / self.court_length_m

    def calibrate_auto(self, frame_width: int, frame_height: int) -> None:
        """Auto-calibrate using frame dimensions with 10% margins.

        Args:
            frame_width: Frame width in pixels.
            frame_height: Frame height in pixels.
        """
        margin_x = frame_width * 0.1
        margin_y = frame_height * 0.1
        corners = [
            (margin_x, margin_y),
            (frame_width - margin_x, frame_height - margin_y),
        ]
        self.calibrate(corners)

    def calibrate_from_court_width(
        self,
        pixel_width: float,
        real_width_meters: float = 6.1,
    ) -> None:
        """Calibrate using known court width in pixels and meters.

        This is the simplest calibration method — just measure the
        court width in the video frame in pixels.

        Args:
            pixel_width: Width of the court in pixels.
            real_width_meters: Real court width in meters (default 6.1m).
        """
        self.pixels_per_meter = pixel_width / real_width_meters


class SpeedCalculator:
    """Shuttle speed calculator with Kalman-smoothed output.

    Takes pixel positions at known FPS with calibration data to
    compute shuttlecock speed in km/h. Uses a simple 1D Kalman
    filter on the speed signal to reduce noise.

    Attributes:
        KMH_FACTOR: Conversion factor from m/s to km/h.
    """

    KMH_FACTOR = 3.6

    def __init__(
        self,
        fps: float = 60.0,
        calibration: CourtCalibration | None = None,
        smooth_alpha: float = 0.3,
    ) -> None:
        """Initialize the speed calculator.

        Args:
            fps: Video frame rate in frames per second.
            calibration: Court calibration object for pixel-to-meter conversion.
            smooth_alpha: Kalman-style exponential smoothing factor (0-1).
                Lower values = smoother output, higher = more responsive.
        """
        self.fps = fps
        self.calibration = calibration or CourtCalibration()
        self.smooth_alpha = smooth_alpha
        self._prev_pos: tuple[float, float] | None = None
        self._speeds: list[float] = []
        self._smoothed_speed: float = 0.0

    def calibrate_from_court_width(
        self,
        pixel_width: float,
        real_width_meters: float = 6.1,
    ) -> None:
        """Convenience method to calibrate from court width.

        Args:
            pixel_width: Width of the court in pixels.
            real_width_meters: Real court width in meters (default 6.1m).
        """
        self.calibration.calibrate_from_court_width(pixel_width, real_width_meters)

    def compute_speed(
        self,
        pos: tuple[float, float],
    ) -> float | None:
        """Compute Kalman-smoothed speed from a new position.

        Args:
            pos: (x, y) position in pixels.

        Returns:
            Smoothed speed in km/h, or None if calibration is missing
            or this is the first position (no displacement to compute).
        """
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

        self._smoothed_speed = (
            self.smooth_alpha * speed_kmh
            + (1 - self.smooth_alpha) * self._smoothed_speed
        )

        self._prev_pos = pos
        self._speeds.append(self._smoothed_speed)
        return self._smoothed_speed

    def get_raw_speed(self, pos: tuple[float, float]) -> float | None:
        """Compute raw (unsmoothed) speed from position delta.

        Does not update internal state. Useful for one-off calculations.

        Args:
            pos: (x, y) position in pixels.

        Returns:
            Raw speed in km/h, or None if no previous position.
        """
        if self._prev_pos is None or self.calibration.pixels_per_meter <= 0:
            return None
        dx = pos[0] - self._prev_pos[0]
        dy = pos[1] - self._prev_pos[1]
        pixel_dist = math.sqrt(dx * dx + dy * dy)
        meters = pixel_dist / self.calibration.pixels_per_meter
        return (meters / (1.0 / self.fps)) * self.KMH_FACTOR

    def get_average_speed(self) -> float:
        """Return the mean of all computed speeds.

        Returns:
            Average speed in km/h, or 0.0 if no speeds computed.
        """
        if not self._speeds:
            return 0.0
        return sum(self._speeds) / len(self._speeds)

    def get_max_speed(self) -> float:
        """Return the maximum computed speed.

        Returns:
            Maximum speed in km/h, or 0.0 if no speeds computed.
        """
        return max(self._speeds) if self._speeds else 0.0

    def get_speed_history(self) -> list[float]:
        """Return a copy of all computed speeds.

        Returns:
            List of speed values in km/h, in order of computation.
        """
        return list(self._speeds)

    def reset(self) -> None:
        """Reset the calculator, clearing all history and state."""
        self._prev_pos = None
        self._speeds.clear()
        self._smoothed_speed = 0.0
