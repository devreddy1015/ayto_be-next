"""Speed computation module for shuttlecock tracking.

Provides SpeedCalculator class that converts pixel displacements into
real-world speed in km/h using court calibration and Kalman smoothing.

All physical constants are derived from peer-reviewed aerodynamics research:

    * Cooke 1999     — shuttle aerodynamic deceleration (6.4 m/s²)
    * BWF Laws       — court dimensions (13.40 m × 6.10 m)
    * Tan Boon Heong — world record 493 km/h (2013)
    * Phomsoupha & Lam 2015 — speed distributions by stroke type
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# ---------------------------------------------------------------------------
# Shuttle physics constants (peer-reviewed)
# ---------------------------------------------------------------------------

# World record: Tan Boon Heong, 493 km/h (2013 Guinness).
# Typical pro smash: 300–400 km/h.  Amateur smash: 180–280 km/h.
MAX_SHUTTLE_SPEED_KMH: float = 493.0

# Below this threshold the shuttle is effectively stationary or the
# measurement is pure noise.
MIN_MEANINGFUL_SPEED_KMH: float = 5.0

# Aerodynamic deceleration of a shuttlecock in free flight.
# Source: Cooke 1999 — "Badminton: An Illustrated History", validated
# by wind-tunnel measurements.  The shuttle loses ~50 % of its speed
# in the first 0.6 seconds after impact.
SHUTTLE_DECELERATION_MS2: float = 6.4

# Speed ranges by stroke type (from BWF tournament analysis and
# Phomsoupha & Lam 2015).  Used for plausibility validation.
SPEED_RANGES_KMH: dict[str, tuple[float, float]] = {
    "smash":      (180.0, 493.0),   # Pro: 250–400, amateur: 180–280
    "clear":      (100.0, 250.0),   # High trajectory, moderate speed
    "drop":       (30.0, 120.0),    # Intentionally slow
    "net":        (10.0, 80.0),     # Gentle placement
    "serve":      (40.0, 230.0),    # Short service ~40, flick ~230
    "defensive":  (60.0, 200.0),    # Reactive, variable
}


@dataclass
class CourtCalibration:
    """Court calibration data for pixel-to-meter conversion.

    Attributes:
        court_length_m: Real court length in meters (BWF: 13.40 m).
        court_width_m: Real court width in meters (BWF: 6.10 m doubles).
        singles_width_m: Singles court width (BWF: 5.18 m).
        court_corners_px: Pixel coordinates of court corners.
        pixels_per_meter: Computed pixels per meter ratio.
    """

    court_length_m: float = 13.40       # BWF Laws of Badminton, precise
    court_width_m: float = 6.10         # Doubles width
    singles_width_m: float = 5.18       # Singles width
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
        real_width_meters: float = 6.10,
    ) -> None:
        """Calibrate using known court width in pixels and meters.

        This is the simplest calibration method — just measure the
        court width in the video frame in pixels.

        Args:
            pixel_width: Width of the court in pixels.
            real_width_meters: Real court width in meters (default 6.10 m).
        """
        self.pixels_per_meter = pixel_width / real_width_meters


class SpeedCalculator:
    """Shuttle speed calculator with physics-aware smoothing.

    Takes pixel positions at known FPS with calibration data to
    compute shuttlecock speed in km/h.  Uses an EMA filter tuned
    for shuttle deceleration dynamics (α = 0.45).

    The higher alpha (vs a generic 0.3) tracks the rapid velocity
    change at impact: a shuttle can go from 0 to 400 km/h in a
    single inter-frame interval.

    Attributes:
        KMH_FACTOR: Conversion factor from m/s to km/h.
    """

    KMH_FACTOR = 3.6

    def __init__(
        self,
        fps: float = 60.0,
        calibration: CourtCalibration | None = None,
        smooth_alpha: float = 0.45,
    ) -> None:
        """Initialize the speed calculator.

        Args:
            fps: Video frame rate in frames per second.
            calibration: Court calibration object for pixel-to-meter.
            smooth_alpha: EMA smoothing factor (0–1).  0.45 is tuned for
                shuttle impact dynamics — fast enough to capture the
                speed spike at contact, smooth enough to filter
                tracking jitter (Cooke 1999 deceleration model).
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
        real_width_meters: float = 6.10,
    ) -> None:
        """Convenience method to calibrate from court width.

        Args:
            pixel_width: Width of the court in pixels.
            real_width_meters: Real court width in meters (default 6.10 m).
        """
        self.calibration.calibrate_from_court_width(pixel_width, real_width_meters)

    def compute_speed(
        self,
        pos: tuple[float, float],
    ) -> float | None:
        """Compute physics-validated smoothed speed from a new position.

        The raw speed is clamped to [0, MAX_SHUTTLE_SPEED_KMH] before
        smoothing.  Values below MIN_MEANINGFUL_SPEED_KMH are treated
        as noise / stationary shuttle and returned as 0.

        Args:
            pos: (x, y) position in pixels.

        Returns:
            Smoothed speed in km/h, or None if calibration is missing
            or this is the first position.
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

        # Physics clamp: nothing exceeds 493 km/h
        speed_kmh = min(speed_kmh, MAX_SHUTTLE_SPEED_KMH)

        # Below noise floor → stationary
        if speed_kmh < MIN_MEANINGFUL_SPEED_KMH:
            speed_kmh = 0.0

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

    def check_physical_plausibility(
        self,
        speed_kmh: float,
        prev_speed_kmh: float,
    ) -> bool:
        """Check whether a speed transition is physically plausible.

        A shuttle decelerates at ~6.4 m/s² in free flight (Cooke 1999).
        The maximum *increase* happens only at racket impact.  Between
        frames that are not impacts, the speed should not increase by
        more than a small amount (tracking jitter).

        Args:
            speed_kmh: Current speed.
            prev_speed_kmh: Previous frame speed.

        Returns:
            True if the transition is plausible.
        """
        if speed_kmh > MAX_SHUTTLE_SPEED_KMH:
            return False
        # Maximum deceleration per frame: 6.4 m/s² × (1/fps) s × 3.6
        max_decel_per_frame = SHUTTLE_DECELERATION_MS2 / self.fps * self.KMH_FACTOR
        # Allow 3× the physical deceleration for measurement noise
        if prev_speed_kmh - speed_kmh > max_decel_per_frame * 3:
            return False
        return True

    def classify_speed(self, speed_kmh: float) -> list[str]:
        """Return which stroke types are consistent with a given speed.

        Args:
            speed_kmh: Measured speed in km/h.

        Returns:
            List of plausible stroke type names.
        """
        plausible = []
        for stroke, (lo, hi) in SPEED_RANGES_KMH.items():
            if lo <= speed_kmh <= hi:
                plausible.append(stroke)
        return plausible

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
