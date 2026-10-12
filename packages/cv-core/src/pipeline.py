"""Shuttle/ball analysis pipeline: detect -> track -> rectify -> calibrate -> speed.

Live (``process_frame``): detector -> constant-acceleration Kalman tracker ->
EMA speed preview, plus a 3-frame-delayed trajectory-turn hit cue.

Offline (``process_video``):

1. Detect in every frame. TrackNet is used when trained weights exist; YOLO
   is only a fallback, since generic box detectors miss most shuttle frames.
2. Find hits: frames passed in by the caller (fused with pose), else
   trajectory turns.
3. Rectify each flight: outlier rejection + gap inpainting.
4. Calibrate: given court keypoints, else auto-detected court lines, else a
   rough frame-size scale (flagged in the summary).
5. With a calibrated camera, lift each flight onto its motion plane and fit
   the launch speed with the quadratic-drag model; also report the
   net-crossing speed.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pandas as pd

try:
    from .court import CourtCamera, detect_court_corners, motion_plane
    from .speed import (
        KMH_PER_MS,
        CourtCalibration,
        SpeedCalculator,
        first_bounce_index,
        fit_flight_physics,
        fit_launch_speed,
        speed_at_net,
    )
    from .sports import get_sport
    from .tracker import ShuttleTracker
    from .trajectory import OBSERVED, find_trajectory_turns, rectify_trajectory
except ImportError:  # imported as a top-level module (src/ on sys.path)
    from court import CourtCamera, detect_court_corners, motion_plane
    from speed import (
        KMH_PER_MS,
        CourtCalibration,
        SpeedCalculator,
        first_bounce_index,
        fit_flight_physics,
        fit_launch_speed,
        speed_at_net,
    )
    from sports import get_sport
    from tracker import ShuttleTracker
    from trajectory import OBSERVED, find_trajectory_turns, rectify_trajectory


@dataclass
class FrameResult:
    """Per-frame output.

    Attributes:
        frame: Frame index (0-based).
        shuttle_x: Object x in pixels (NaN if unknown).
        shuttle_y: Object y in pixels (NaN if unknown).
        speed_kmh: Speed in km/h (NaN if unknown).
        stroke_detected: Whether a hit happened at this frame.
        confidence: Detector confidence (0.0 when not detected).
    """

    frame: int
    shuttle_x: float
    shuttle_y: float
    speed_kmh: float
    stroke_detected: bool
    confidence: float


@dataclass
class FlightResult:
    """One flight between consecutive hits (offline, calibrated only).

    ``method`` says how the 3D flight was obtained:

    * ``"physics"``: gravity + drag fit to the pixels (MonoTrack-style),
      seeded from motion-plane lifts. Most accurate.
    * ``"plane-anchored"``: FreeTrack motion plane from the hitter to the
      next anchor, with the drag fit on the lifted points.
    * ``"plane-estimated"``: as above, but with the plane azimuth searched
      from the track. Least reliable; show its speeds as approximate.
    """

    start_frame: int
    end_frame: int
    launch_speed_kmh: float | None
    net_speed_kmh: float | None
    method: str
    reprojection_rms_px: float | None = None


class CVPipeline:
    """End-to-end object analysis for one camera.

    Usage::

        pipe = CVPipeline(sport="badminton")
        df = pipe.process_video("rally.mp4", corners_px=[...])  # 4 taps
        pipe.get_summary()["max_launch_speed_kmh"]
    """

    TURN_ANGLE_DEG = 100.0
    MIN_HIT_GAP_S = 0.4  # fastest rally tempo (~400 ms between strokes)
    MAX_REPROJ_PX = 12.0  # physics fits worse than this fall back to plane lifting

    def __init__(
        self,
        model_path: str | Path = "yolov8n.pt",
        conf_threshold: float = 0.35,
        tracknet_path: str | Path = "models/tracknet.pt",
        sport: str = "badminton",
        camera: CourtCamera | None = None,
        device: str = "cpu",
    ) -> None:
        self.sport = get_sport(sport)
        self.camera = camera
        self.calibration_source = "keypoints" if camera else "none"
        self.detector = self._load_detector(model_path, conf_threshold, tracknet_path, device)
        self.fps = 60.0
        self.results: list[FrameResult] = []
        self.flights: list[FlightResult] = []
        self.frame_size: tuple[int, int] | None = None
        self._raw: np.ndarray | None = None
        self._confs: list[float] = []
        self._reset_live(self.fps)

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------
    @staticmethod
    def _load_detector(
        model_path: str | Path, conf: float, tracknet_path: str | Path, device: str,
    ) -> Any:
        try:
            try:
                from .tracknet_detector import TrackNetDetector
            except ImportError:
                from tracknet_detector import TrackNetDetector
            tracknet = TrackNetDetector(tracknet_path, device=device)
            if tracknet.is_trained():
                return tracknet
        except ImportError:  # torch not installed
            pass
        try:
            try:
                from .detector import ShuttleDetector
            except ImportError:
                from detector import ShuttleDetector
            return ShuttleDetector(model_path=model_path, conf_threshold=conf)
        except ImportError:  # ultralytics not installed
            return None

    def _reset_live(self, fps: float) -> None:
        self.fps = fps
        self.tracker = ShuttleTracker(dt=1.0 / fps)
        if self.camera is not None:
            self.speed_calc = SpeedCalculator.metric(
                fps=fps, max_speed_kmh=self.sport.max_speed_kmh,
            )
            # Live preview: a vertical plane through the net centre facing the
            # camera. It never contains the camera (unlike a down-the-line
            # plane for a centred camera), so it acts like a metric scale at
            # net depth. Per-flight analysis replaces it with the physics fit.
            net_centre = np.array([self.sport.court_width_m / 2, self.sport.net_y_m])
            facing = net_centre - self.camera.camera_center[:2]
            normal = np.array([*facing / np.linalg.norm(facing), 0.0])
            self._live_plane = (normal, float(normal[:2] @ net_centre))
        else:
            self.speed_calc = SpeedCalculator(
                fps=fps,
                calibration=CourtCalibration(court_length_m=self.sport.court_length_m),
                max_speed_kmh=self.sport.max_speed_kmh,
            )
            self._live_plane = None
        self._live_track: list[tuple[float, float]] = []
        self._last_live_hit = -10**9
        self._last_frame_idx: int | None = None

    def calibrate(
        self,
        image_size: tuple[int, int],
        corners_px: list[tuple[float, float]] | None = None,
        keypoints_px: dict[str, tuple[float, float]] | None = None,
        frame: np.ndarray | None = None,
    ) -> str:
        """Set up the camera model. Returns the calibration source used."""
        if keypoints_px:
            self.camera = CourtCamera.from_keypoints(keypoints_px, image_size, self.sport)
            self.calibration_source = "keypoints"
        elif corners_px:
            self.camera = CourtCamera.from_corners(corners_px, image_size, self.sport)
            self.calibration_source = "keypoints"
        elif frame is not None and (auto := detect_court_corners(frame)) is not None:
            self.camera = CourtCamera.from_corners(auto, image_size, self.sport)
            self.calibration_source = "auto-lines"
        elif self.camera is None:
            self.calibration_source = "rough"
        if self.camera is not None:
            # _live_plane and the metric SpeedCalculator are built in
            # _reset_live, which has already run with no camera by the time
            # process_video calls us.
            self._reset_live(self.fps)
        return self.calibration_source

    def _detect(self, frame: np.ndarray) -> tuple[tuple[float, float] | None, float]:
        if self.detector is None:
            return None, 0.0
        if hasattr(self.detector, "detect_shuttle"):
            det = self.detector.detect_shuttle(frame)
            return ((det["center_x"], det["center_y"]), det["confidence"]) if det else (None, 0.0)
        det = self.detector.detect(frame)
        return (det["center"], det["confidence"]) if det else (None, 0.0)

    # ------------------------------------------------------------------
    # Live
    # ------------------------------------------------------------------
    def process_frame(
        self, frame: np.ndarray, fps: float = 60.0, frame_idx: int = 0,
    ) -> FrameResult:
        """Process one frame for real-time feedback."""
        if fps != self.fps:
            self._reset_live(fps)
        if self.camera is None and self.speed_calc.calibration.pixels_per_meter <= 0:
            h, w = frame.shape[:2]
            self.speed_calc.calibration.calibrate_auto(w, h)

        # Live capture drops frames when the pipeline falls behind. Advance
        # the tracker through the gap so its fixed dt stays honest, and tell
        # the speed calculator how long the step really was.
        gap = 1
        if self._last_frame_idx is not None and frame_idx > self._last_frame_idx:
            gap = frame_idx - self._last_frame_idx
        self._last_frame_idx = frame_idx
        for _ in range(min(gap, self.tracker.MAX_OCCLUSION_FRAMES + 1) - 1):
            coasted = self.tracker.update(None)
            if coasted is None:
                self._live_track.clear()
            else:
                self._live_track.append(coasted)
                del self._live_track[:-7]

        raw, conf = self._detect(frame)
        tracked = self.tracker.update(raw)
        speed = float("nan")
        hit = False
        if tracked is not None:
            point: tuple[float, ...] = tracked
            if self.camera is not None:
                point = tuple(self.camera.lift_to_plane(np.array([tracked]), *self._live_plane)[0])
            if self.tracker.hits <= 1:
                self.speed_calc.break_track()  # new track: don't score the jump
            if np.all(np.isfinite(point)):  # a NaN would poison the EMA for good
                computed = self.speed_calc.compute_speed(point, frames=gap)
                if computed is not None:
                    speed = computed
            else:
                self.speed_calc.break_track()
            self._live_track.append(tracked)
            del self._live_track[:-7]
            hit = self._live_turn(frame_idx)
        else:
            self._live_track.clear()
            self.speed_calc.break_track()

        return FrameResult(
            frame=frame_idx,
            shuttle_x=tracked[0] if tracked else float("nan"),
            shuttle_y=tracked[1] if tracked else float("nan"),
            speed_kmh=speed,
            stroke_detected=hit,
            confidence=conf,
        )

    def _live_turn(self, frame_idx: int) -> bool:
        if len(self._live_track) < 7:
            return False
        turns = find_trajectory_turns(np.array(self._live_track), self.TURN_ANGLE_DEG)
        if 3 in turns and frame_idx - self._last_live_hit >= self.MIN_HIT_GAP_S * self.fps:
            self._last_live_hit = frame_idx
            return True
        return False

    # ------------------------------------------------------------------
    # Offline
    # ------------------------------------------------------------------
    def process_video(
        self,
        video_path: str | Path,
        hit_frames: list[int] | None = None,
        anchors: dict[int, tuple[float, float]] | None = None,
        corners_px: list[tuple[float, float]] | None = None,
        keypoints_px: dict[str, tuple[float, float]] | None = None,
    ) -> pd.DataFrame:
        """Analyse a whole video.

        Args:
            video_path: Video file.
            hit_frames: Hit frames from pose/shuttle fusion; if None,
                trajectory turns are used.
            anchors: Ground point (court metres) of whoever hits at each hit
                frame, e.g. the ankle midpoint mapped through
                ``camera.image_to_ground``. Key the landing point by the
                flight's end frame for the rally's last shot. Each flight's
                motion plane runs from its hitter to the next anchor. Without
                anchors the azimuth is estimated, which is less reliable.
            corners_px: The 4 court corners (near-left, near-right,
                far-right, far-left), if the user tapped them.
            keypoints_px: Named calibration keypoints (adds net-post tops).

        Returns:
            DataFrame with columns frame, shuttle_x, shuttle_y, speed_kmh,
            stroke_detected.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"Cannot open video: {video_path}")
        fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
        size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        self._reset_live(fps)
        if hasattr(self.detector, "reset"):
            self.detector.reset()

        raw: list[tuple[float, float]] = []
        confs: list[float] = []
        first_frame = None
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if first_frame is None:
                first_frame = frame
            pos, conf = self._detect(frame)
            raw.append(pos if pos is not None else (np.nan, np.nan))
            confs.append(conf)
        cap.release()

        self.calibrate(size, corners_px, keypoints_px, first_frame)
        self.frame_size = size
        self._raw, self._confs = np.array(raw, dtype=float).reshape(-1, 2), confs
        return self.analyse_track(self._raw, confs, fps, size, hit_frames, anchors)

    def reanalyse(
        self,
        hit_frames: list[int] | None = None,
        anchors: dict[int, tuple[float, float]] | None = None,
    ) -> pd.DataFrame:
        """Re-run the offline analysis of the last video with better hits/anchors.

        Detection is the expensive part and isn't repeated. Typical use: run
        ``process_video``, fuse its trajectory turns with pose swing peaks,
        then call this with the fused hits and the hitters' feet.
        """
        if self._raw is None or self.frame_size is None:
            raise RuntimeError("process_video() must run first")
        return self.analyse_track(self._raw, self._confs, self.fps, self.frame_size,
                                  hit_frames, anchors)

    def analyse_track(
        self,
        raw: np.ndarray,
        confidences: list[float],
        fps: float,
        image_size: tuple[int, int],
        hit_frames: list[int] | None = None,
        anchors: dict[int, tuple[float, float]] | None = None,
    ) -> pd.DataFrame:
        """Offline analysis of an already-detected (N, 2) track (NaN = missing)."""
        self.fps = fps
        min_gap = max(1, int(self.MIN_HIT_GAP_S * fps))
        if hit_frames is None:
            # iterations=0: inpaint short gaps only. The outlier pass has no hit
            # breaks to work with here, so it reads every reversal as a run of
            # outliers and smooths the turn away before we can find it.
            coarse = rectify_trajectory(raw, max_gap=4, iterations=0)
            hit_frames = find_trajectory_turns(
                coarse.positions, self.TURN_ANGLE_DEG, min_gap=min_gap,
            )
        hits = sorted(h for h in hit_frames if 0 <= h < len(raw))
        track = rectify_trajectory(raw, hit_frames=hits)
        pos = track.positions
        times = np.arange(len(pos)) / fps

        self.flights = []
        if self.camera is not None:
            bounds = [0, *hits, len(pos)]
            metric = np.full((len(pos), 3), np.nan)
            for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
                seg, seg_t = pos[a:b], times[a:b]
                ok = np.isfinite(seg).all(axis=1)
                if ok.sum() < 3:
                    continue
                anchor = (anchors or {}).get(a, (self.sport.court_width_m / 2, 0.0))
                toward = (anchors or {}).get(b)
                if toward is not None:
                    planes, source = [motion_plane(anchor, toward)], "anchored"
                else:
                    planes = [self._estimate_plane(seg[ok], seg_t[ok], anchor)] + [
                        motion_plane(anchor, np.asarray(anchor) + [np.sin(az), np.cos(az)])
                        for az in (-0.35, 0.35)
                    ]
                    source = "estimated"
                lifted = [self.camera.lift_to_plane(seg[ok], *plane) for plane in planes]
                metric[a:b][ok] = lifted[0]
                if i == 0 and a not in hits:
                    continue  # partial flight before the first hit: no launch

                if self.sport.wall_rebounds:
                    # The ball comes off a wall between hits. That reverses it
                    # without flipping its vertical velocity, so there is no
                    # bounce for first_bounce_index to cut at and a single arc
                    # fitted across the rebound would pass the reprojection
                    # gate while being wrong. Report nothing instead.
                    self.flights.append(FlightResult(
                        start_frame=a, end_frame=b - 1, launch_speed_kmh=None,
                        net_speed_kmh=None, method="unsupported-wall-rebound",
                        reprojection_rms_px=None,
                    ))
                    continue

                # A ball bounces between hits and a single gravity + drag arc
                # cannot span that, so fit only up to the first bounce. The
                # robust loss would otherwise absorb the post-bounce points
                # and still pass the reprojection gate, with a biased speed.
                hi, hi_ok = len(seg), ok.sum()
                if self.sport.bounces:
                    bounce = first_bounce_index(lifted[0], self.sport.floor_z_m)
                    if bounce is not None and bounce >= 3:
                        hi, hi_ok = int(np.flatnonzero(ok)[bounce]), bounce

                seeds = [self._seed(seg_t[ok][:hi_ok], pts[:hi_ok], times[a])
                         for pts in lifted]
                physics = fit_flight_physics(
                    self.camera.projection, seg_t[:hi], seg[:hi],
                    [sd for sd in seeds if sd],
                    self.sport.drag_k, hit_time_s=times[a],
                )
                if physics is not None and physics.reprojection_rms_px < self.MAX_REPROJ_PX:
                    # Only where the object was seen: the fit covers 0.6 s but
                    # returns a simulated point for every frame in the segment,
                    # so dead time would otherwise get a speed.
                    metric[a:b][:hi][ok[:hi]] = physics.positions_m[ok[:hi]]
                    launch, method = physics.speed_kmh, "physics"
                    rms = physics.reprojection_rms_px
                else:
                    fit = fit_launch_speed(seg_t[:hi], metric[a:b][:hi], self.sport.drag_k,
                                           self.sport.max_speed_kmh, hit_time_s=times[a])
                    launch = fit.speed_kmh if fit else None
                    method, rms = f"plane-{source}", None
                net = (speed_at_net(seg_t, metric[a:b], self.sport.net_y_m)
                       if self.sport.has_net else None)
                self.flights.append(FlightResult(
                    start_frame=a, end_frame=b - 1,
                    launch_speed_kmh=min(launch, self.sport.max_speed_kmh) if launch else None,
                    net_speed_kmh=net * KMH_PER_MS if net is not None else None,
                    method=method, reprojection_rms_px=rms,
                ))
            scale = 1.0
            series = metric
        else:
            calib = CourtCalibration(court_length_m=self.sport.court_length_m)
            calib.calibrate_auto(*image_size)
            scale = calib.pixels_per_meter
            series = pos
        # Central differences on the rectified track, never across a hit.
        diff = np.full(len(pos), np.nan)
        diff[1:-1] = np.linalg.norm(series[2:] - series[:-2], axis=1) / (2 / fps) / scale
        for h in hits:
            diff[max(h - 1, 0):h + 2] = np.nan
        speeds = np.minimum(diff * KMH_PER_MS, self.sport.max_speed_kmh)

        hit_set = set(hits)
        self.results = [
            FrameResult(
                frame=i,
                shuttle_x=float(pos[i, 0]),
                shuttle_y=float(pos[i, 1]),
                speed_kmh=float(speeds[i]),
                stroke_detected=i in hit_set,
                confidence=float(confidences[i]) if track.status[i] == OBSERVED else 0.0,
            )
            for i in range(len(pos))
        ]
        return self._results_to_dataframe()

    def _seed(
        self, times: np.ndarray, lifted: np.ndarray, hit_time: float,
    ) -> tuple[np.ndarray, np.ndarray] | None:
        """Initial (position, velocity) at the hit from a plane-lifted track."""
        ok = np.isfinite(lifted).all(axis=1)
        if ok.sum() < 3:
            return None
        pts, ts = lifted[ok], times[ok]
        fit = fit_launch_speed(ts, pts, self.sport.drag_k, self.sport.max_speed_kmh,
                               hit_time_s=hit_time)
        j = min(3, len(pts) - 1)
        direction = pts[j] - pts[0]
        norm = float(np.linalg.norm(direction))
        if fit is None or norm < 1e-6:
            return None
        return pts[0], direction / norm * fit.speed_ms

    def _estimate_plane(
        self, pixels: np.ndarray, times: np.ndarray, anchor: tuple[float, float],
    ) -> tuple[np.ndarray, float]:
        """Choose the plane azimuth whose lifted track best fits the drag model.

        A wrong azimuth warps the lifted flight (depth gets compressed or
        stretched non-linearly), which raises the drag-fit residual. On
        simulated flights the median azimuth error is ~1°, but the tail is
        heavy, so anchored planes are always preferred.
        """
        best, best_rms = 0.0, np.inf
        for theta in np.radians(np.arange(-70.0, 70.1, 2.0)):
            direction = np.array([np.sin(theta), np.cos(theta)])
            normal, offset = motion_plane(anchor, np.asarray(anchor) + direction)
            lifted = self.camera.lift_to_plane(pixels, normal, offset)
            ok = np.isfinite(lifted).all(axis=1)
            if ok.sum() < 5:
                continue
            fit = fit_launch_speed(times[ok], lifted[ok], self.sport.drag_k,
                                   self.sport.max_speed_kmh, window_s=0.3)
            span = float(np.linalg.norm(lifted[ok][-1] - lifted[ok][0]))
            # Relative residual: a plane that squashes the flight would
            # otherwise win just by shrinking every distance.
            if fit is not None and span > 0.1 and fit.rms_m / span < best_rms:
                best, best_rms = theta, fit.rms_m / span
        return motion_plane(anchor, np.asarray(anchor) + [np.sin(best), np.cos(best)])

    # ------------------------------------------------------------------
    # Output
    # ------------------------------------------------------------------
    def _results_to_dataframe(self) -> pd.DataFrame:
        cols = ["frame", "shuttle_x", "shuttle_y", "speed_kmh", "stroke_detected"]
        return pd.DataFrame([{c: getattr(r, c) for c in cols} for r in self.results], columns=cols)

    def export_csv(self, output_path: str | Path) -> Path:
        """Write the per-frame results to CSV and return the path."""
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        self._results_to_dataframe().to_csv(output, index=False)
        return output

    #: Calibration sources that cannot support a metric speed. "rough" is a
    #: guess from the frame diagonal, so a km/h derived from it is a number
    #: with no claim behind it.
    UNMETRIC_CALIBRATION = ("none", "rough")

    @property
    def speed_is_metric(self) -> bool:
        """Whether this clip's calibration can support a speed in km/h at all."""
        return self.calibration_source not in self.UNMETRIC_CALIBRATION

    def get_summary(self) -> dict[str, Any]:
        """Detection rate, speed statistics, hits and per-flight speeds.

        Speeds are ``None``, never ``0.0``, when there is nothing to report:
        an empty clip and a stationary shuttle are different facts, and so are
        "no speed" and "zero speed". Without a real calibration every speed is
        ``None`` — a frame-diagonal guess cannot produce km/h worth printing.
        """
        total = len(self.results)
        detected = sum(1 for r in self.results if r.confidence > 0)
        speeds = (
            [r.speed_kmh for r in self.results if np.isfinite(r.speed_kmh) and r.speed_kmh > 0]
            if self.speed_is_metric
            else []
        )
        launches = (
            [f.launch_speed_kmh for f in self.flights if f.launch_speed_kmh is not None]
            if self.speed_is_metric
            else []
        )
        return {
            "sport": self.sport.name,
            "calibration": self.calibration_source,
            "speed_is_metric": self.speed_is_metric,
            "total_frames": total,
            "detected_frames": detected,
            "detection_rate": detected / total if total else 0.0,
            "avg_speed_kmh": float(np.mean(speeds)) if speeds else None,
            "max_speed_kmh": max(speeds) if speeds else None,
            "min_speed_kmh": min(speeds) if speeds else None,
            "strokes_detected": sum(1 for r in self.results if r.stroke_detected),
            "max_launch_speed_kmh": max(launches) if launches else None,
            "flights": [asdict(f) for f in self.flights],
        }
