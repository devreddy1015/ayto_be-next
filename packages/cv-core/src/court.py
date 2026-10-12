"""Court-keypoint camera calibration and monocular 3D lifting.

Replaces the old pixels-per-metre scale, which can't measure motion towards
or away from the camera, with a real camera model:

* **Projection from 6+ keypoints** (normalised DLT): the four court corners
  plus the two net-post tops. This is the calibration FreeTrack (Machine
  Vision and Applications 37:167, 2026) uses.
* **Projection from the 4 court corners only**: a ground homography, with the
  focal length recovered by Zhang's single-homography constraints (square
  pixels, principal point at the image centre), as in PnLCalib.
* **Motion-plane lifting**: each flight between two hits is assumed to stay in
  one vertical plane through the hitter's ground anchor. A shuttle detection
  is lifted to 3D by intersecting its camera ray with that plane. This is
  FreeTrack's physics-free 3D step, costing ~0.7 ms/frame in the paper.

``detect_court_corners`` is a heuristic line-based assist for a camera behind
the near baseline. It returns ``None`` when it isn't confident, and the app
then asks the user to tap the corners.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import ClassVar

import cv2
import numpy as np

try:
    from .sports import SportProfile, get_sport
except ImportError:  # imported as a top-level module (src/ on sys.path)
    from sports import SportProfile, get_sport


# ---------------------------------------------------------------------------
# Normalised DLT helpers
# ---------------------------------------------------------------------------
def _normalisation(points: np.ndarray) -> np.ndarray:
    """Similarity transform moving points to zero mean, mean norm sqrt(dim)."""
    dim = points.shape[1]
    centroid = points.mean(axis=0)
    mean_dist = np.linalg.norm(points - centroid, axis=1).mean()
    scale = math.sqrt(dim) / max(mean_dist, 1e-12)
    t = np.eye(dim + 1)
    t[:dim, :dim] *= scale
    t[:dim, dim] = -scale * centroid
    return t


def _to_h(points: np.ndarray) -> np.ndarray:
    return np.hstack([points, np.ones((len(points), 1))])


def fit_homography(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Normalised DLT homography mapping ``src`` (N,2) to ``dst`` (N,2), N >= 4."""
    src = np.asarray(src, dtype=float)
    dst = np.asarray(dst, dtype=float)
    if len(src) < 4 or len(src) != len(dst):
        raise ValueError("Need >= 4 matching point pairs for a homography")
    ts, td = _normalisation(src), _normalisation(dst)
    s = (ts @ _to_h(src).T).T
    d = (td @ _to_h(dst).T).T
    rows = []
    for (x, y, _), (u, v, _) in zip(s, d):
        rows.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        rows.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, vt = np.linalg.svd(np.asarray(rows))
    h = vt[-1].reshape(3, 3)
    h = np.linalg.inv(td) @ h @ ts
    return h / h[2, 2]


def fit_projection(
    world: np.ndarray, image: np.ndarray, return_conditioning: bool = False,
) -> np.ndarray | tuple[np.ndarray, float]:
    """Normalised DLT camera matrix P (3x4) from >= 6 world/image pairs.

    The world points must not all lie on one plane.

    Args:
        world: (N, 3) court points.
        image: (N, 2) pixels.
        return_conditioning: Also return sigma_min / sigma_max of the
            normalised design matrix, in [0, 1]. The DLT degenerates as this
            approaches 0 — notably when the camera lies near the line through
            the two off-plane points (a side-on view at net height), where
            tap noise of a pixel or two wrecks the vertical axis while
            ``reprojection_error_px`` stays near zero.
    """
    world = np.asarray(world, dtype=float)
    image = np.asarray(image, dtype=float)
    if len(world) < 6 or len(world) != len(image):
        raise ValueError("Need >= 6 matching 3D/2D pairs for a projection matrix")
    if np.linalg.matrix_rank(world - world.mean(axis=0), tol=1e-6) < 3:
        raise ValueError("World points are coplanar; use fit_homography instead")
    tw, ti = _normalisation(world), _normalisation(image)
    w = (tw @ _to_h(world).T).T
    m = (ti @ _to_h(image).T).T
    rows = []
    for xw, (u, v, _) in zip(w, m):
        rows.append(np.concatenate([np.zeros(4), -xw, v * xw]))
        rows.append(np.concatenate([xw, np.zeros(4), -u * xw]))
    _, sv, vt = np.linalg.svd(np.asarray(rows))
    p = vt[-1].reshape(3, 4)
    p = np.linalg.inv(ti) @ p @ tw
    p = p / np.linalg.norm(p[2, :3])
    if return_conditioning:
        cond = float(sv[-2] / sv[0]) if sv[0] > 0 else 0.0
        return p, cond
    return p


def focal_from_homography(h: np.ndarray, image_size: tuple[int, int]) -> float | None:
    """Recover focal length (px) from a plane homography.

    Assumes square pixels and the principal point at the image centre, which
    leaves one unknown that both of Zhang's orthogonality constraints
    determine. Returns ``None`` when the plane is too close to fronto-parallel
    for the estimate to be stable.
    """
    w, hgt = image_size
    t = np.array([[1, 0, -w / 2.0], [0, 1, -hgt / 2.0], [0, 0, 1]])
    hc = t @ h
    hc = hc / np.linalg.norm(hc)
    h1, h2 = hc[:, 0], hc[:, 1]
    # Both constraints are linear in x = 1/f^2: a_i * x + b_i = 0. Solving them
    # jointly by least squares down-weights whichever one is degenerate for
    # this view (e.g. r1.r2 = 0 carries no information when the camera sits on
    # the court's centre line).
    a = np.array([h1[0] * h2[0] + h1[1] * h2[1],
                  h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2])
    b = np.array([h1[2] * h2[2], h1[2] ** 2 - h2[2] ** 2])
    denom = float(a @ a)
    if denom < 1e-18:
        return None
    x = -float(a @ b) / denom
    if x <= 0:
        return None
    f = 1.0 / math.sqrt(x)
    return f if 0.2 * w < f < 10 * w else None


def projection_from_homography(
    h: np.ndarray, image_size: tuple[int, int], focal_px: float | None = None,
) -> np.ndarray:
    """Build P = K [R | t] from a ground-plane homography (world z = 0).

    If ``focal_px`` is None it is recovered from ``h``. Failing that, it falls
    back to 0.72 x image width, about a 70° horizontal FOV (typical phone
    main camera in 16:9 video).
    """
    w, hgt = image_size
    f = focal_px or focal_from_homography(h, image_size) or 0.72 * w
    k = np.array([[f, 0, w / 2.0], [0, f, hgt / 2.0], [0, 0, 1]])
    b = np.linalg.inv(k) @ h
    lam = 2.0 / (np.linalg.norm(b[:, 0]) + np.linalg.norm(b[:, 1]))
    if b[2, 2] * lam < 0:  # court must be in front of the camera
        lam = -lam
    r1, r2 = lam * b[:, 0], lam * b[:, 1]
    r = np.column_stack([r1, r2, np.cross(r1, r2)])
    u, _, vt = np.linalg.svd(r)
    r3 = (u @ vt)[:, 2]
    # Keep the measured homography columns exactly, so ground points map back
    # to where the user tapped, and take only the vertical axis from the
    # orthonormalised rotation.
    return np.column_stack([h[:, 0], h[:, 1], (k @ r3) / lam, h[:, 2]])


# ---------------------------------------------------------------------------
# Camera model
# ---------------------------------------------------------------------------
@dataclass
class CourtCamera:
    """Calibrated camera relative to a court.

    Attributes:
        projection: 3x4 camera matrix mapping court metres to pixels.
        sport: Sport profile whose court frame the matrix refers to.
        reprojection_error_px: RMS error of the calibration keypoints. Note
            this stays near zero for a 6-point DLT even when the geometry is
            degenerate, so it is not a calibration-quality check on its own.
        calibration_path: ``"dlt6"`` or ``"homography"`` — which fit was used.
    """

    projection: np.ndarray
    sport: SportProfile
    reprojection_error_px: float = 0.0
    calibration_path: str = "dlt6"

    #: Below this sigma_min/sigma_max the 6-point DLT is too ill-conditioned
    #: to trust and the 4-corner homography path is used instead. Measured
    #: with 2 px of tap noise on a badminton court: ordinary placements score
    #: 4-5e-2 and both paths recover the camera centre to within 0.2 m, while
    #: a side-on camera at net height (on the line through the post tops)
    #: scores 1.3e-3 and the DLT's centre error is 0.95 m against the
    #: homography's 0.21 m.
    MIN_DLT_CONDITIONING: ClassVar[float] = 5e-3

    # -- construction ------------------------------------------------------
    @classmethod
    def from_keypoints(
        cls,
        image_points: dict[str, tuple[float, float]],
        image_size: tuple[int, int],
        sport: str | SportProfile = "badminton",
    ) -> CourtCamera:
        """Calibrate from named keypoints (see ``SportProfile.calibration_keypoints``).

        With both net-post tops visible, a full 6-point DLT is used; with only
        the four ground corners, the homography + recovered focal path.
        """
        profile = get_sport(sport) if isinstance(sport, str) else sport
        world_lookup = profile.calibration_keypoints()
        names = [n for n in image_points if n in world_lookup]
        if len(names) < 4:
            raise ValueError(f"Need >= 4 known keypoints, got {names}")
        world = np.array([world_lookup[n] for n in names])
        image = np.array([image_points[n] for n in names], dtype=float)

        off_plane = np.abs(world[:, 2]) > 1e-9
        ground = ~off_plane
        p, source = None, "homography"
        if len(names) >= 6 and off_plane.any():
            candidate, cond = fit_projection(world, image, return_conditioning=True)
            if cond >= cls.MIN_DLT_CONDITIONING or ground.sum() < 4:
                p, source = candidate, "dlt6"
                if p[2] @ np.append(world.mean(axis=0), 1.0) < 0:
                    p = -p
        if p is None:
            hmat = fit_homography(world[ground, :2], image[ground])
            p = projection_from_homography(hmat, image_size)
        cam = cls(projection=p, sport=profile)
        cam.calibration_path = source
        cam.reprojection_error_px = float(
            np.sqrt(np.mean(np.sum((cam.project(world) - image) ** 2, axis=1)))
        )
        return cam

    @classmethod
    def from_corners(
        cls,
        corners_px: list[tuple[float, float]],
        image_size: tuple[int, int],
        sport: str | SportProfile = "badminton",
    ) -> CourtCamera:
        """Calibrate from the 4 court corners: near-left, near-right, far-right, far-left."""
        if len(corners_px) != 4:
            raise ValueError("Expected exactly 4 corners")
        names = ["near_left", "near_right", "far_right", "far_left"]
        return cls.from_keypoints(dict(zip(names, corners_px)), image_size, sport)

    # -- geometry ----------------------------------------------------------
    @property
    def ground_homography(self) -> np.ndarray:
        """Homography mapping court ground (x, y, 1) to pixels."""
        return self.projection[:, [0, 1, 3]]

    @property
    def camera_center(self) -> np.ndarray:
        m, p4 = self.projection[:, :3], self.projection[:, 3]
        return -np.linalg.solve(m, p4)

    def project(self, world: np.ndarray) -> np.ndarray:
        """Project (N,3) court points to (N,2) pixels."""
        pts = _to_h(np.atleast_2d(np.asarray(world, dtype=float))) @ self.projection.T
        return pts[:, :2] / pts[:, 2:3]

    def image_to_ground(self, pixels: np.ndarray) -> np.ndarray:
        """Map (N,2) pixels on the court plane (z=0) to (N,2) court metres.

        For table tennis z=0 is the table top, not the floor the players
        stand on, so use :meth:`image_to_plane` with the sport's
        ``floor_z_m`` for anything standing on the floor (e.g. feet).
        """
        pts = _to_h(np.atleast_2d(np.asarray(pixels, dtype=float)))
        g = np.linalg.solve(self.ground_homography, pts.T).T
        return g[:, :2] / g[:, 2:3]

    def image_to_plane(self, pixels: np.ndarray, z: float = 0.0) -> np.ndarray:
        """Map (N,2) pixels to (N,2) court metres on the horizontal plane at ``z``."""
        if z == 0.0:
            return self.image_to_ground(pixels)
        lifted = self.lift_to_plane(pixels, np.array([0.0, 0.0, 1.0]), float(z))
        return np.asarray(lifted)[:, :2]

    def rays(self, pixels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Camera centre and unit ray directions (N,3) for (N,2) pixels."""
        m = self.projection[:, :3]
        d = np.linalg.solve(m, _to_h(np.atleast_2d(np.asarray(pixels, dtype=float))).T).T
        return self.camera_center, d / np.linalg.norm(d, axis=1, keepdims=True)

    def lift_to_plane(
        self,
        pixels: np.ndarray,
        normal: np.ndarray,
        offset: float,
        min_angle_deg: float = 2.0,
    ) -> np.ndarray:
        """Intersect pixel rays with the plane ``normal . X = offset``.

        Rays within ``min_angle_deg`` of the plane give NaN rows. That
        includes every ray when the camera itself lies in the plane, e.g. a
        camera on the court's centre line watching a shot straight down the
        middle. The geometry can't resolve depth there, so place the camera
        off the centre line (behind a corner, or side-on).
        """
        c, d = self.rays(pixels)
        denom = d @ normal
        with np.errstate(divide="ignore", invalid="ignore"):
            s = (offset - normal @ c) / denom
        grazing = np.abs(denom) < math.sin(math.radians(min_angle_deg))
        s = np.where(grazing | (s <= 0), np.nan, s)
        return c + s[:, None] * d


def motion_plane(
    anchor: np.ndarray, toward: np.ndarray | None = None,
) -> tuple[np.ndarray, float]:
    """Vertical plane through a ground anchor (FreeTrack's motion plane).

    Args:
        anchor: Hitter's ground point (x, y) in court metres, e.g. the midpoint
            of the ankles at the hit frame.
        toward: Optional second ground point (the receiver, or the landing
            point) fixing the plane's direction. Without it the plane runs
            straight down the court (+y).

    Returns:
        ``(normal, offset)`` with the plane being ``normal . X = offset``.
    """
    a = np.asarray(anchor, dtype=float)[:2]
    direction = np.array([0.0, 1.0])
    if toward is not None:
        delta = np.asarray(toward, dtype=float)[:2] - a
        if np.linalg.norm(delta) > 1e-6:
            direction = delta / np.linalg.norm(delta)
    normal = np.array([direction[1], -direction[0], 0.0])
    return normal, float(normal[:2] @ a)


# ---------------------------------------------------------------------------
# Automatic court-corner detection (assist, not ground truth)
# ---------------------------------------------------------------------------
def _intersect(l1: np.ndarray, l2: np.ndarray) -> np.ndarray | None:
    p = np.cross(np.append(l1[:2], 1), np.append(l1[2:], 1))
    q = np.cross(np.append(l2[:2], 1), np.append(l2[2:], 1))
    x = np.cross(p, q)
    if abs(x[2]) < 1e-9:
        return None
    return x[:2] / x[2]


def detect_court_corners(frame: np.ndarray) -> list[tuple[float, float]] | None:
    """Estimate the 4 outer court corners for a camera behind the near baseline.

    White line pixels are found (bright, low saturation), segments extracted
    with a probabilistic Hough transform, then the outermost near-horizontal
    segments are taken as the baselines and the outermost slanted segments as
    the sidelines. The quadrilateral is accepted only if it is convex, covers
    a reasonable part of the frame and narrows with distance.

    Returns:
        Corners as near-left, near-right, far-right, far-left in pixels, or
        ``None`` when the layout isn't recognised.
    """
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (0, 0, 170), (180, 70, 255))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    segs = cv2.HoughLinesP(
        mask, rho=1, theta=np.pi / 180, threshold=80,
        minLineLength=int(0.12 * min(h, w)), maxLineGap=int(0.02 * w) + 5,
    )
    if segs is None:
        return None
    segs = segs.reshape(-1, 4).astype(float)  # (N,1,4) in OpenCV 4, (N,4) in 5
    angles = np.degrees(np.arctan2(segs[:, 3] - segs[:, 1], segs[:, 2] - segs[:, 0])) % 180
    horiz = segs[(angles < 15) | (angles > 165)]
    slanted = segs[(angles > 25) & (angles < 155)]
    if len(horiz) < 2 or len(slanted) < 2:
        return None

    mid_y = (horiz[:, 1] + horiz[:, 3]) / 2
    far_base, near_base = horiz[np.argmin(mid_y)], horiz[np.argmax(mid_y)]
    probe_y = (mid_y.min() + mid_y.max()) / 2

    def x_at(seg: np.ndarray, y: float) -> float:
        x1, y1, x2, y2 = seg
        return x1 if abs(y2 - y1) < 1e-9 else x1 + (y - y1) * (x2 - x1) / (y2 - y1)

    xs = np.array([x_at(s, probe_y) for s in slanted])
    left_side, right_side = slanted[np.argmin(xs)], slanted[np.argmax(xs)]

    # Refit each chosen line to every white pixel near it (robust Huber
    # fit): Hough segments snap to one edge of a thick painted line.
    ys_px, xs_px = np.nonzero(mask)
    white = np.column_stack([xs_px, ys_px]).astype(np.float32)

    def refine(seg: np.ndarray) -> np.ndarray:
        p0, d = seg[:2], seg[2:] - seg[:2]
        d = d / max(np.linalg.norm(d), 1e-9)
        dist = np.abs((white[:, 0] - p0[0]) * d[1] - (white[:, 1] - p0[1]) * d[0])
        near = white[dist < 8]
        if len(near) < 20:
            return seg
        vx, vy, x0, y0 = cv2.fitLine(near, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
        return np.array([x0, y0, x0 + 100 * vx, y0 + 100 * vy])

    near_base, far_base = refine(near_base), refine(far_base)
    left_side, right_side = refine(left_side), refine(right_side)

    corners = [
        _intersect(near_base, left_side), _intersect(near_base, right_side),
        _intersect(far_base, right_side), _intersect(far_base, left_side),
    ]
    if any(c is None for c in corners):
        return None
    quad = np.array(corners)
    area = cv2.contourArea(quad.astype(np.float32))
    near_len = np.linalg.norm(quad[1] - quad[0])
    far_len = np.linalg.norm(quad[2] - quad[3])
    margin = 0.25
    in_frame = np.all((quad[:, 0] > -margin * w) & (quad[:, 0] < (1 + margin) * w)
                      & (quad[:, 1] > -margin * h) & (quad[:, 1] < (1 + margin) * h))
    if not (in_frame and area > 0.08 * w * h and far_len < near_len
            and cv2.isContourConvex(quad.astype(np.float32))):
        return None
    return [(float(x), float(y)) for x, y in quad]
