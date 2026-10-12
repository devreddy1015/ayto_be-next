"""Shuttle/ball speed estimation.

Two paths:

* **Live preview** (:class:`SpeedCalculator`): frame-to-frame displacement
  times a pixels-per-metre scale, EMA-smoothed. It's cheap, but by
  construction it misses motion towards or away from the camera, and at
  30-60 fps it can't catch the true peak.
* **Per-flight analysis** (:func:`fit_launch_speed`, :func:`speed_at_net`):
  works on metric 3D positions from :mod:`court` motion-plane lifting.
  Launch speed comes from fitting a quadratic-drag model over the first
  frames after the hit, using all of them instead of one noisy difference.
  The net-crossing speed is reported alongside it because it is the
  radar-comparable figure: a published 30 fps phone system was ~10 km/h MAE
  from radar at the net but ~66 km/h at the "peak" (arXiv 2509.05334).

References: BWF Laws (court); Cohen et al. 2015 (shuttle terminal velocity);
Phomsoupha & Lam 2015 (stroke speed ranges); Guinness 2023 (565 km/h smash).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

try:
    from .sports import get_sport
except ImportError:  # imported as a top-level module (src/ on sys.path)
    from sports import get_sport

# ---------------------------------------------------------------------------
# Badminton constants (other sports: see sports.SPORTS)
# ---------------------------------------------------------------------------

# Fastest recorded smash: 565 km/h (Satwiksairaj Rankireddy, Guinness 2023,
# controlled test). Typical pro smash: 300-400 km/h; amateur: 180-280 km/h.
MAX_SHUTTLE_SPEED_KMH: float = get_sport("badminton").max_speed_kmh

# Below this threshold the shuttle is effectively stationary or the
# measurement is pure noise.
MIN_MEANINGFUL_SPEED_KMH: float = 5.0

# Quadratic-drag constant k = g / v_t^2 for a shuttle (v_t ~ 6.7 m/s).
SHUTTLE_DRAG_K: float = get_sport("badminton").drag_k

KMH_PER_MS = 3.6


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
        """Rough fallback: assume the court length spans the frame diagonal
        minus 10% margins. Only for uncalibrated previews; use
        :class:`court.CourtCamera` for real measurements.

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
    """Live speed preview from consecutive positions, EMA-smoothed.

    Positions are pixels converted with ``calibration.pixels_per_meter``, or
    metres already (see :meth:`metric`) when the pipeline lifts detections
    to 3D. The EMA (alpha 0.45) follows the spike at impact while damping
    tracking jitter.
    """

    def __init__(
        self,
        fps: float = 60.0,
        calibration: CourtCalibration | None = None,
        smooth_alpha: float = 0.45,
        max_speed_kmh: float = MAX_SHUTTLE_SPEED_KMH,
    ) -> None:
        """Initialize the speed calculator.

        Args:
            fps: Video frame rate in frames per second.
            calibration: Pixel-to-metre scale.
            smooth_alpha: EMA smoothing factor in (0, 1].
            max_speed_kmh: Physical ceiling for the sport; faster readings are clamped.
        """
        self.fps = fps
        self.calibration = calibration or CourtCalibration()
        self.smooth_alpha = smooth_alpha
        self.max_speed_kmh = max_speed_kmh
        self._prev_pos: tuple[float, ...] | None = None
        self._speeds: list[float] = []
        self._smoothed_speed: float = 0.0

    @classmethod
    def metric(cls, fps: float = 60.0, **kwargs: float) -> SpeedCalculator:
        """A calculator whose input positions are already in metres (2D or 3D)."""
        return cls(fps=fps, calibration=CourtCalibration(pixels_per_meter=1.0), **kwargs)

    def calibrate_from_court_width(
        self,
        pixel_width: float,
        real_width_meters: float = 6.10,
    ) -> None:
        """Calibrate the pixel scale from the court width in pixels."""
        self.calibration.calibrate_from_court_width(pixel_width, real_width_meters)

    def break_track(self) -> None:
        """Forget the previous position, so the next one only seeds the track.

        Call this whenever the tracked object is lost or re-acquired. Without
        it the jump from the old track to the new one is scored as a single
        frame of motion and clamped to ``max_speed_kmh``.
        """
        self._prev_pos = None
        self._smoothed_speed = 0.0

    def compute_speed(self, pos: tuple[float, ...], frames: int = 1) -> float | None:
        """Add a position and return the smoothed speed in km/h.

        Raw speeds are clamped to ``max_speed_kmh``; anything below
        MIN_MEANINGFUL_SPEED_KMH counts as stationary.

        Args:
            pos: The new position, in the same units as the last one.
            frames: How many frames have passed since the previous position.
                Live capture drops frames when the pipeline falls behind, and
                scoring that displacement as one frame's motion would inflate
                the speed in proportion to the number of frames dropped.

        Returns:
            Smoothed speed, or None if uncalibrated or this is the first position.
        """
        if self.calibration.pixels_per_meter <= 0:
            return None
        if self._prev_pos is None:
            self._prev_pos = tuple(pos)
            return None

        dist = math.dist(pos, self._prev_pos) / self.calibration.pixels_per_meter
        speed_kmh = min(dist * self.fps / max(1, frames) * KMH_PER_MS, self.max_speed_kmh)
        if speed_kmh < MIN_MEANINGFUL_SPEED_KMH:
            speed_kmh = 0.0

        self._smoothed_speed = (
            self.smooth_alpha * speed_kmh + (1 - self.smooth_alpha) * self._smoothed_speed
        )
        self._prev_pos = tuple(pos)
        self._speeds.append(self._smoothed_speed)
        return self._smoothed_speed

    def get_average_speed(self) -> float:
        """Mean of all smoothed speeds so far (0.0 if none)."""
        return sum(self._speeds) / len(self._speeds) if self._speeds else 0.0

    def get_max_speed(self) -> float:
        """Maximum smoothed speed so far (0.0 if none)."""
        return max(self._speeds) if self._speeds else 0.0

    def get_speed_history(self) -> list[float]:
        """Copy of all smoothed speeds, in order."""
        return list(self._speeds)

    def reset(self) -> None:
        """Clear all history and state."""
        self._prev_pos = None
        self._speeds.clear()
        self._smoothed_speed = 0.0


# ---------------------------------------------------------------------------
# Per-flight analysis on metric 3D positions
# ---------------------------------------------------------------------------
@dataclass
class LaunchFit:
    """Quadratic-drag fit of the start of one flight.

    Attributes:
        speed_ms: Speed at the first fitted sample (or at the hit time, when
            ``hit_time_s`` was given), in m/s.
        rms_m: RMS residual of the fit along the flight direction.
        n_points: Samples used.
    """

    speed_ms: float
    rms_m: float
    n_points: int

    @property
    def speed_kmh(self) -> float:
        return self.speed_ms * KMH_PER_MS


def _drag_distance(t: np.ndarray, v0: float, k: float) -> np.ndarray:
    # Distance travelled under dv/dt = -k v^2 from speed v0 at t = 0.
    return np.log1p(k * v0 * t) / k


def fit_launch_speed(
    times_s: np.ndarray,
    positions_m: np.ndarray,
    drag_k: float = SHUTTLE_DRAG_K,
    max_speed_kmh: float = MAX_SHUTTLE_SPEED_KMH,
    hit_time_s: float | None = None,
    window_s: float = 0.15,
) -> LaunchFit | None:
    """Fit ``s(t) = s0 + ln(1 + k v0 t) / k`` to the start of a flight.

    Over the first ~0.15 s after a hit, drag dominates gravity for any
    meaningful stroke, and the path is close to a straight line. So the
    positions are projected onto their principal direction and v0 is
    fitted by a bounded 1-D search, with the offset s0 solved in closed
    form. Using every frame in the window, rather than one frame difference,
    is what recovers speed at 30-60 fps, where a shuttle halves its speed in
    a few frames.

    Args:
        times_s: (N,) sample times; samples with NaN positions are ignored.
        positions_m: (N, D) metric positions, D = 2 or 3.
        drag_k: Quadratic-drag constant (1/m) of the projectile.
        max_speed_kmh: Upper bound of the search.
        hit_time_s: If given, the returned speed is the speed at this time
            rather than at the first usable sample.
        window_s: Length of flight to use after the first sample.

    Returns:
        A :class:`LaunchFit`, or None with fewer than 3 usable samples.
    """
    t = np.asarray(times_s, dtype=float)
    p = np.asarray(positions_m, dtype=float)
    ok = np.isfinite(p).all(axis=1) & np.isfinite(t)
    t, p = t[ok], p[ok]
    if len(t) < 3:
        return None
    t_first = float(t[0])
    keep = t <= t_first + window_s
    t, p = t[keep] - t_first, p[keep]
    if len(t) < 3:
        return None

    centered = p - p.mean(axis=0)
    direction = np.linalg.svd(centered, full_matrices=False)[2][0]
    if (p[-1] - p[0]) @ direction < 0:
        direction = -direction
    s = (p - p[0]) @ direction

    # Fit the speed at the hit directly by shifting the model's clock back to
    # it, rather than fitting at the first sample and extrapolating. The
    # closed-form extrapolation v0 / (1 - k v0 tau) blows up as k v0 tau -> 1,
    # so it had to be switched off above 0.9, which made the reported speed
    # jump by ~10x across that threshold and then fall back.
    tau = max(0.0, t_first - hit_time_s) if hit_time_s is not None else 0.0

    def sse(v0: float) -> float:
        model = _drag_distance(t + tau, v0, drag_k) - _drag_distance(tau, v0, drag_k)
        s0 = float(np.mean(s - model))
        return float(np.sum((s - s0 - model) ** 2))

    lo, hi = 0.5, max_speed_kmh / KMH_PER_MS
    grid = np.geomspace(lo, hi, 64)
    best = int(np.argmin([sse(v) for v in grid]))
    a, b = grid[max(best - 1, 0)], grid[min(best + 1, len(grid) - 1)]
    golden = (math.sqrt(5) - 1) / 2
    for _ in range(40):  # golden-section refinement inside the bracketing cell
        c, d = b - golden * (b - a), a + golden * (b - a)
        if sse(c) < sse(d):
            b = d
        else:
            a = c
    v0 = (a + b) / 2
    rms = math.sqrt(sse(v0) / len(t))
    return LaunchFit(speed_ms=float(min(v0, hi)), rms_m=rms, n_points=len(t))


def speed_at_net(
    times_s: np.ndarray,
    positions_m: np.ndarray,
    net_y_m: float,
    half_window: int = 2,
) -> float | None:
    """Speed (m/s) where the flight crosses the net plane ``y = net_y_m``.

    A local linear fit over ``half_window`` samples either side of the
    crossing averages out per-frame noise.

    Returns:
        Speed in m/s, or None if the flight never crosses the net.
    """
    t = np.asarray(times_s, dtype=float)
    p = np.asarray(positions_m, dtype=float)
    ok = np.isfinite(p).all(axis=1)
    t, p = t[ok], p[ok]
    if len(t) < 2:
        return None
    side = np.sign(p[:, 1] - net_y_m)
    crossings = np.nonzero(side[:-1] * side[1:] < 0)[0]
    if len(crossings) == 0:
        return None
    i = int(crossings[0])
    lo, hi = max(0, i - half_window + 1), min(len(t), i + half_window + 1)
    if hi - lo < 2:
        return None
    vel = np.polyfit(t[lo:hi] - t[i], p[lo:hi], 1)[0]
    return float(np.linalg.norm(vel))


@dataclass
class PhysicsFit:
    """3D flight reconstructed by fitting gravity + quadratic drag to pixels.

    Attributes:
        position_m: Object position at the hit time (court metres).
        velocity_ms: Velocity at the hit time (m/s).
        drag_k: Per-shot drag constant (1/m), fitted within 0.5-2x the prior.
        reprojection_rms_px: RMS pixel error of the fitted flight.
        positions_m: (N, 3) fitted positions at the observation times.
    """

    position_m: np.ndarray
    velocity_ms: np.ndarray
    drag_k: float
    reprojection_rms_px: float
    positions_m: np.ndarray

    @property
    def speed_kmh(self) -> float:
        return float(np.linalg.norm(self.velocity_ms)) * KMH_PER_MS


def simulate_flight(
    position: np.ndarray, velocity: np.ndarray, drag_k: float, times: np.ndarray,
    max_step: float = 1 / 120,
) -> np.ndarray:
    """Integrate ``a = -k|v|v - g z`` (RK4) from t = 0 and sample at ``times`` (sorted, >= 0)."""
    x, y, z = (float(c) for c in position)
    vx, vy, vz = (float(c) for c in velocity)
    k, g = drag_k, 9.81
    out = np.empty((len(times), 3))
    t = 0.0

    def acc(ux: float, uy: float, uz: float) -> tuple[float, float, float]:
        s = -k * math.sqrt(ux * ux + uy * uy + uz * uz)
        return s * ux, s * uy, s * uz - g

    for i, target in enumerate(times):
        while target - t > 1e-12:
            h = min(target - t, max_step)
            a1 = acc(vx, vy, vz)
            v2 = (vx + 0.5 * h * a1[0], vy + 0.5 * h * a1[1], vz + 0.5 * h * a1[2])
            a2 = acc(*v2)
            v3 = (vx + 0.5 * h * a2[0], vy + 0.5 * h * a2[1], vz + 0.5 * h * a2[2])
            a3 = acc(*v3)
            v4 = (vx + h * a3[0], vy + h * a3[1], vz + h * a3[2])
            a4 = acc(*v4)
            x += h / 6 * (vx + 2 * v2[0] + 2 * v3[0] + v4[0])
            y += h / 6 * (vy + 2 * v2[1] + 2 * v3[1] + v4[1])
            z += h / 6 * (vz + 2 * v2[2] + 2 * v3[2] + v4[2])
            vx += h / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0])
            vy += h / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1])
            vz += h / 6 * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2])
            t += h
        out[i] = (x, y, z)
    return out


def first_bounce_index(
    points_m: np.ndarray,
    floor_z_m: float = 0.0,
    max_height_m: float = 0.5,
    min_rise_m: float = 0.05,
) -> int | None:
    """Index of the first bounce in a lifted 3D flight, or None.

    A bounce is the first low point where the object stops falling and
    starts rising again. A single gravity + drag arc cannot span it, so a
    ball-sport flight must be fitted only up to this index.

    Note this finds floor bounces, not wall rebounds (squash, padel), where
    the vertical velocity does not flip.

    Args:
        points_m: (N, 3) metric positions, oldest first.
        floor_z_m: Height of the floor in the court frame.
        max_height_m: Only look for a bounce below this height above the floor.
        min_rise_m: How far the object must come back up to count as a bounce.
    """
    pts = np.asarray(points_m, dtype=float)
    if pts.ndim != 2 or pts.shape[1] < 3 or len(pts) < 5:
        return None
    z = pts[:, 2]
    for i in range(2, len(z) - 2):
        if not np.isfinite(z[i - 1:i + 3]).all():
            continue
        falling = z[i - 1] > z[i] and z[i - 2] > z[i - 1]
        low = z[i] < floor_z_m + max_height_m
        rising = np.nanmax(z[i + 1:i + 5]) - z[i] >= min_rise_m
        if falling and low and rising:
            return i
    return None


def fit_flight_physics(
    projection: np.ndarray,
    times_s: np.ndarray,
    pixels: np.ndarray,
    initial_guesses: list[tuple[np.ndarray, np.ndarray]],
    drag_k: float = SHUTTLE_DRAG_K,
    hit_time_s: float = 0.0,
    max_duration_s: float = 0.6,
) -> PhysicsFit | None:
    """MonoTrack-style monocular 3D flight fit.

    The flight's state at the hit (position, velocity) and a per-shot drag
    constant are fitted so that the simulated flight, projected through
    ``projection``, matches the 2D track. A robust (soft-L1, 3 px) loss
    shrugs off leftover outliers. Gravity and drag together make depth
    observable from one camera, so no motion plane is needed; plane lifts
    only seed the initial guesses (several seeds guard against local minima).

    Args:
        projection: 3x4 camera matrix (court metres -> pixels).
        times_s: (N,) observation times.
        pixels: (N, 2) observations; NaN rows are ignored.
        initial_guesses: (position, velocity) seeds at the hit time.
        drag_k: Prior drag constant; the fit may scale it by 0.5-2x.
        hit_time_s: Time of the hit (state reference time).
        max_duration_s: Only the first part of the flight is fitted.

    Returns:
        The best :class:`PhysicsFit`, or None if scipy is missing or there
        are fewer than 5 observations.
    """
    try:
        from scipy.optimize import least_squares
    except ImportError:
        return None
    t = np.asarray(times_s, dtype=float) - hit_time_s
    px = np.asarray(pixels, dtype=float)
    ok = np.isfinite(px).all(axis=1) & (t >= 0) & (t <= max_duration_s)
    t, px = t[ok], px[ok]
    if len(t) < 5:
        return None

    def project(points: np.ndarray) -> np.ndarray:
        hom = np.hstack([points, np.ones((len(points), 1))]) @ projection.T
        return hom[:, :2] / hom[:, 2:3]

    def residuals(params: np.ndarray) -> np.ndarray:
        sim = simulate_flight(params[:3], params[3:6], drag_k * math.exp(params[6]), t)
        return (project(sim) - px).ravel()

    lower = [-np.inf] * 6 + [math.log(0.5)]
    upper = [np.inf] * 6 + [math.log(2.0)]
    best = None
    for pos0, vel0 in initial_guesses:
        if not (np.all(np.isfinite(pos0)) and np.all(np.isfinite(vel0))):
            continue
        start = np.concatenate([pos0, vel0, [0.0]])
        result = least_squares(residuals, start, loss="soft_l1", f_scale=3.0,
                               bounds=(lower, upper), x_scale="jac", max_nfev=200)
        if best is None or result.cost < best.cost:
            best = result
    if best is None:
        return None
    k = drag_k * math.exp(best.x[6])
    sim = simulate_flight(best.x[:3], best.x[3:6], k, t)
    rms = float(np.sqrt(np.mean(np.sum((project(sim) - px) ** 2, axis=1))))
    all_t = np.asarray(times_s, dtype=float) - hit_time_s
    positions = np.full((len(all_t), 3), np.nan)
    forward = all_t >= 0
    positions[forward] = simulate_flight(best.x[:3], best.x[3:6], k, all_t[forward])
    return PhysicsFit(best.x[:3], best.x[3:6], k, rms, positions)
