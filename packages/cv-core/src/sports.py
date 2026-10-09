"""Per-sport court geometry and projectile physics.

Everything sport-specific that the CV stack needs lives here: the playing-area
dimensions used for camera calibration, the 3D court keypoints the user taps
(or the line detector finds), and the projectile's quadratic-drag constant
used by the launch-speed fit in :mod:`speed`.

Coordinates are metres in a court frame with the origin at the near-left
corner of the play area, +x across the width, +y along the length (away from
the camera behind the near baseline) and +z up.

Drag model: ``dv/dt = -k v^2`` with ``k = rho * Cd * A / (2 m)`` [1/m]. For the
shuttlecock ``k = g / v_t^2`` from its measured terminal velocity instead,
because a shuttle's drag coefficient isn't a single sphere-like constant.
The ball values are first-order estimates from regulation mass/diameter and
typical sphere drag coefficients; refine them with on-court fits.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

AIR_DENSITY = 1.21  # kg/m^3 at ~20 °C, sea level
GRAVITY = 9.81      # m/s^2


def drag_constant(mass_kg: float, diameter_m: float, drag_coefficient: float) -> float:
    """Quadratic-drag constant ``k = rho * Cd * A / (2 m)`` in 1/m."""
    area = math.pi * (diameter_m / 2.0) ** 2
    return AIR_DENSITY * drag_coefficient * area / (2.0 * mass_kg)


@dataclass(frozen=True)
class SportProfile:
    """Geometry and physics for one sport.

    Attributes:
        name: Registry key, e.g. ``"badminton"``.
        court_length_m: Length of the play area along +y.
        court_width_m: Width of the play area along +x (doubles where relevant).
        net_height_m: Net height at the posts (0 for wall sports).
        object_name: What is tracked: ``"shuttle"`` or ``"ball"``.
        max_speed_kmh: Physical ceiling used to reject impossible detections.
        drag_k: Quadratic-drag constant in 1/m.
        has_net: Whether there is a net plane at mid-court.
    """

    name: str
    court_length_m: float
    court_width_m: float
    net_height_m: float
    object_name: str
    max_speed_kmh: float
    drag_k: float
    has_net: bool = True
    extra_keypoints: dict[str, tuple[float, float, float]] = field(default_factory=dict)

    @property
    def net_y_m(self) -> float:
        """Distance of the net plane from the near baseline."""
        return self.court_length_m / 2.0

    def ground_corners(self) -> np.ndarray:
        """Court corners on the ground plane, ordered near-left, near-right,
        far-right, far-left (clockwise seen from above the camera)."""
        w, length = self.court_width_m, self.court_length_m
        return np.array([[0.0, 0.0], [w, 0.0], [w, length], [0.0, length]])

    def calibration_keypoints(self) -> dict[str, tuple[float, float, float]]:
        """3D keypoints usable for DLT calibration.

        The four ground corners plus, for net sports, the two net-post tops.
        Six points (four coplanar, two off-plane) are the minimum FreeTrack
        uses for a full 3x4 projection matrix.
        """
        w, length = self.court_width_m, self.court_length_m
        points = {
            "near_left": (0.0, 0.0, 0.0),
            "near_right": (w, 0.0, 0.0),
            "far_right": (w, length, 0.0),
            "far_left": (0.0, length, 0.0),
        }
        if self.has_net and self.net_height_m > 0:
            points["net_post_left"] = (0.0, self.net_y_m, self.net_height_m)
            points["net_post_right"] = (w, self.net_y_m, self.net_height_m)
        points.update(self.extra_keypoints)
        return points


SPORTS: dict[str, SportProfile] = {
    # BWF Laws: 13.40 x 6.10 m, net 1.55 m at the posts. Shuttle terminal
    # velocity ~6.7 m/s (Cohen et al., New J. Phys. 2015). Fastest recorded
    # smash: 565 km/h (Rankireddy, 2023 Guinness, controlled test).
    "badminton": SportProfile(
        name="badminton", court_length_m=13.40, court_width_m=6.10,
        net_height_m=1.55, object_name="shuttle", max_speed_kmh=565.0,
        drag_k=GRAVITY / 6.7 ** 2,
    ),
    # ITF: 23.77 x 10.97 m, net 1.07 m at the posts. Ball 57.7 g, 67 mm, Cd ~0.55.
    "tennis": SportProfile(
        name="tennis", court_length_m=23.77, court_width_m=10.97,
        net_height_m=1.07, object_name="ball", max_speed_kmh=270.0,
        drag_k=drag_constant(0.0577, 0.067, 0.55),
    ),
    # ITTF table: 2.74 x 1.525 m, net 15.25 cm. Ball 2.7 g, 40 mm, Cd ~0.5.
    "table_tennis": SportProfile(
        name="table_tennis", court_length_m=2.74, court_width_m=1.525,
        net_height_m=0.1525, object_name="ball", max_speed_kmh=130.0,
        drag_k=drag_constant(0.0027, 0.040, 0.5),
    ),
    # USA Pickleball: 44 x 20 ft (13.41 x 6.10 m), net 36 in at the posts.
    # Perforated ball ~26 g, 74 mm, Cd ~0.45.
    "pickleball": SportProfile(
        name="pickleball", court_length_m=13.41, court_width_m=6.10,
        net_height_m=0.914, object_name="ball", max_speed_kmh=140.0,
        drag_k=drag_constant(0.026, 0.074, 0.45),
    ),
    # FIP: 20 x 10 m, net 0.92 m at the posts. Ball ~57 g, 65 mm, Cd ~0.55.
    "padel": SportProfile(
        name="padel", court_length_m=20.0, court_width_m=10.0,
        net_height_m=0.92, object_name="ball", max_speed_kmh=220.0,
        drag_k=drag_constant(0.057, 0.065, 0.55),
    ),
    # WSF singles court: 9.75 x 6.40 m, no net. Ball 24 g, 40 mm, Cd ~0.5.
    "squash": SportProfile(
        name="squash", court_length_m=9.75, court_width_m=6.40,
        net_height_m=0.0, object_name="ball", max_speed_kmh=290.0,
        drag_k=drag_constant(0.024, 0.040, 0.5), has_net=False,
    ),
}


def get_sport(name: str) -> SportProfile:
    """Look up a sport profile by name (case/space/hyphen-insensitive)."""
    key = name.strip().lower().replace(" ", "_").replace("-", "_")
    try:
        return SPORTS[key]
    except KeyError:
        raise ValueError(f"Unknown sport {name!r}; known: {sorted(SPORTS)}") from None
