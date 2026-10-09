"""Tests for calibration, 3D lifting, rectification, drag-fit speed and TrackNet.

Everything runs on synthetic data from a known camera and simulated
quadratic-drag flights, so the ground truth is exact.
"""
from __future__ import annotations

import cv2
import numpy as np
import pytest
from court import CourtCamera, detect_court_corners, fit_projection, motion_plane
from pipeline import CVPipeline
from speed import SHUTTLE_DRAG_K, fit_launch_speed, speed_at_net
from sports import SPORTS, get_sport
from tracker import ShuttleTracker
from trajectory import INPAINTED, MISSING, REPLACED, find_trajectory_turns, rectify_trajectory

W, H = 1920, 1080
# Behind the near baseline but off the centre line, so shots down the middle
# don't lie in a plane through the camera (where depth is unobservable).
OFFSET_CAM = ((0.8, -5.5, 3.2), (3.05, 6.7, 0.0))


def _camera(center=(3.05, -3.0, 2.5), target=(3.05, 6.7, 0.5), f=1400.0) -> np.ndarray:
    c = np.asarray(center, dtype=float)
    z = np.asarray(target, dtype=float) - c
    z /= np.linalg.norm(z)
    x = np.cross(z, [0.0, 0.0, 1.0])
    x /= np.linalg.norm(x)
    r = np.vstack([x, np.cross(z, x), z])
    k = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
    return k @ np.column_stack([r, -r @ c])


def _project(p: np.ndarray, pts: np.ndarray) -> np.ndarray:
    h = np.hstack([np.atleast_2d(pts), np.ones((len(np.atleast_2d(pts)), 1))]) @ p.T
    return h[:, :2] / h[:, 2:3]


def _flight(v0: float, elev: float, fps: float, duration: float = 0.6,
            start=(3.0, 1.0, 2.6)) -> tuple[np.ndarray, np.ndarray]:
    dt, sub = 1 / fps, 40
    p = np.array(start, dtype=float)
    v = np.array([0.05, np.cos(elev), np.sin(elev)])
    v = v / np.linalg.norm(v) * v0
    out = []
    for _ in range(int(duration * fps)):
        out.append(p.copy())
        for _ in range(sub):
            a = -SHUTTLE_DRAG_K * np.linalg.norm(v) * v + np.array([0, 0, -9.81])
            v = v + a * dt / sub
            p = p + v * dt / sub
    return np.arange(len(out)) * dt, np.array(out)


# ---------------------------------------------------------------------------
# Sports registry
# ---------------------------------------------------------------------------
class TestSports:
    def test_lookup_is_forgiving(self) -> None:
        assert get_sport("Table Tennis").name == "table_tennis"
        with pytest.raises(ValueError):
            get_sport("quidditch")

    def test_net_sports_have_six_keypoints(self) -> None:
        for sport in SPORTS.values():
            expected = 6 if sport.has_net else 4
            assert len(sport.calibration_keypoints()) == expected

    def test_drag_ordering_is_physical(self) -> None:
        # A feathered shuttle decelerates far harder than any ball.
        assert SPORTS["badminton"].drag_k > SPORTS["table_tennis"].drag_k > SPORTS["tennis"].drag_k


# ---------------------------------------------------------------------------
# Calibration and lifting
# ---------------------------------------------------------------------------
class TestCourtCamera:
    def _keypoints(self, p: np.ndarray, noise: float = 0.0) -> dict[str, tuple[float, float]]:
        rng = np.random.default_rng(0)
        kp = get_sport("badminton").calibration_keypoints()
        return {
            n: tuple(_project(p, np.array(v))[0] + rng.normal(0, noise, 2)) for n, v in kp.items()
        }

    @pytest.mark.parametrize("center,target", [
        ((3.05, -3.0, 2.5), (3.05, 6.7, 0.5)),   # centred behind baseline
        ((1.0, -4.0, 3.0), (3.5, 7.0, 0.0)),     # off-centre, high
        ((-2.0, 2.0, 1.5), (4.0, 8.0, 0.5)),     # side-on, low
    ])
    def test_four_corners_recover_camera(self, center, target) -> None:
        p = _camera(center, target)
        corners = {k: v for k, v in self._keypoints(p).items() if not k.startswith("net")}
        cam = CourtCamera.from_keypoints(corners, (W, H))
        assert cam.reprojection_error_px < 1e-6
        np.testing.assert_allclose(cam.camera_center, center, atol=1e-3)

    def test_six_point_dlt_with_noise(self) -> None:
        p = _camera()
        cam = CourtCamera.from_keypoints(self._keypoints(p, noise=1.0), (W, H))
        assert cam.reprojection_error_px < 2.0
        np.testing.assert_allclose(cam.camera_center, (3.05, -3.0, 2.5), atol=0.1)

    def test_coplanar_points_rejected_by_dlt(self) -> None:
        world = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [2, 2, 0], [3, 1, 0]], float)
        with pytest.raises(ValueError):
            fit_projection(world, world[:, :2])

    def test_lift_to_motion_plane_is_exact(self) -> None:
        p = _camera()
        cam = CourtCamera.from_corners(
            [tuple(_project(p, np.array([x, y, 0.0]))[0])
             for x, y in get_sport("badminton").ground_corners()],
            (W, H),
        )
        normal, offset = motion_plane([2.0, 1.0], [2.0, 12.0])
        truth = np.array([[2.0, 1.0 + 0.5 * i, 2.0 + 0.1 * i] for i in range(20)])
        lifted = cam.lift_to_plane(_project(p, truth), normal, offset)
        np.testing.assert_allclose(lifted, truth, atol=1e-6)

    def test_lift_rejects_plane_through_camera(self) -> None:
        p = _camera()                                  # camera on the centre line
        cam = CourtCamera.from_keypoints(self._keypoints(p), (W, H))
        normal, offset = motion_plane([3.05, 1.0])     # plane x = 3.05 contains it
        lifted = cam.lift_to_plane(_project(p, np.array([[3.05, 6.0, 2.0]])), normal, offset)
        assert np.isnan(lifted).all()

    def test_image_to_ground_roundtrip(self) -> None:
        p = _camera()
        cam = CourtCamera.from_keypoints(self._keypoints(p), (W, H))
        feet = np.array([[1.0, 5.0, 0.0], [4.5, 9.0, 0.0]])
        np.testing.assert_allclose(cam.image_to_ground(_project(p, feet)), feet[:, :2], atol=1e-3)


class TestCourtDetection:
    def test_detects_rendered_court(self) -> None:
        p = _camera(*OFFSET_CAM)
        img = np.full((H, W, 3), (60, 120, 40), np.uint8)  # green floor (BGR)
        corners = _project(p, np.array(
            [[x, y, 0.0] for x, y in get_sport("badminton").ground_corners()]))
        for a, b in zip(corners, np.roll(corners, -1, axis=0)):
            cv2.line(img, tuple(map(int, a)), tuple(map(int, b)), (255, 255, 255), 6)
        found = detect_court_corners(img)
        assert found is not None
        np.testing.assert_allclose(np.array(found), corners, atol=12)

    def test_blank_frame_returns_none(self) -> None:
        assert detect_court_corners(np.zeros((H, W, 3), np.uint8)) is None


# ---------------------------------------------------------------------------
# Trajectory rectification
# ---------------------------------------------------------------------------
class TestRectify:
    def _parabola(self, n: int = 60) -> np.ndarray:
        t = np.arange(n, dtype=float)
        return np.column_stack([100 + 12 * t, 600 - 15 * t + 0.25 * t ** 2])

    def test_outliers_replaced_and_gaps_filled(self) -> None:
        truth = self._parabola()
        raw = truth + np.random.default_rng(1).normal(0, 0.5, truth.shape)
        raw[[10, 31]] += [[80, -60], [-70, 90]]       # clutter
        raw[40:45] = np.nan                            # occlusion
        out = rectify_trajectory(raw)
        assert out.status[10] == REPLACED and out.status[31] == REPLACED
        assert np.all(out.status[40:45] == INPAINTED)
        assert np.nanmax(np.linalg.norm(out.positions - truth, axis=1)) < 3.0

    def test_long_gap_and_edges_not_extrapolated(self) -> None:
        raw = self._parabola()
        raw[:3] = np.nan
        raw[20:40] = np.nan
        out = rectify_trajectory(raw, max_gap=8)
        assert np.all(out.status[:3] == MISSING)
        assert np.all(out.status[20:40] == MISSING)

    def test_fit_does_not_cross_hits(self) -> None:
        t = np.arange(40, dtype=float)
        x = np.where(t < 20, 100 + 15 * t, 100 + 15 * 19 - 15 * (t - 19))  # reversal at 19/20
        raw = np.column_stack([x, 400 + 0 * t])
        raw[20] = np.nan
        out = rectify_trajectory(raw, hit_frames=[20])
        assert out.status[20] == MISSING  # can't interpolate across the hit

    def test_turns_found_at_reversals(self) -> None:
        t = np.arange(90, dtype=float)
        x = 500 + 300 * np.sin(np.pi * t / 30)       # reverses every 30 frames
        turns = find_trajectory_turns(np.column_stack([x, 300 + 40 * np.cos(t / 9)]),
                                      min_angle_deg=90)
        assert turns
        assert all(min(abs(tt - r) for r in (15, 45, 75)) <= 3 for tt in turns)


# ---------------------------------------------------------------------------
# Speed physics
# ---------------------------------------------------------------------------
class TestFlightSpeed:
    @pytest.mark.parametrize("fps", [30.0, 60.0])
    def test_drag_fit_recovers_launch_speed(self, fps: float) -> None:
        rng = np.random.default_rng(4)
        errors, naive = [], []
        for _ in range(30):
            v0 = rng.uniform(25, 100)
            fine_t, fine = _flight(v0, rng.uniform(-0.3, 0.3), fps * 20)
            offset = rng.uniform(0, 1 / fps)               # hit happens between frames
            t = np.arange(offset, 0.5, 1 / fps)
            obs = fine[np.minimum((t * fps * 20).round().astype(int), len(fine) - 1)]
            obs = obs + rng.normal(0, 0.03, obs.shape)
            fit = fit_launch_speed(t, obs, hit_time_s=0.0)
            errors.append(abs(fit.speed_ms - v0))
            naive.append(abs(np.linalg.norm(obs[1] - obs[0]) * fps - v0))
        assert np.mean(errors) * 3.6 < 8.0          # km/h
        assert np.mean(errors) < 0.25 * np.mean(naive)

    def test_fit_needs_three_samples(self) -> None:
        assert fit_launch_speed(np.array([0.0, 0.1]), np.zeros((2, 3))) is None

    def test_speed_at_net(self) -> None:
        t = np.arange(0, 1, 1 / 60)
        pos = np.column_stack([3 + 0 * t, 2 + 20 * t, 1.5 + 0 * t])   # 20 m/s along y
        assert speed_at_net(t, pos, net_y_m=6.7) == pytest.approx(20.0, rel=1e-6)
        assert speed_at_net(t, pos, net_y_m=50.0) is None


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------
class TestTrackerGating:
    def test_ignores_isolated_clutter(self) -> None:
        tracker = ShuttleTracker(dt=1 / 60)
        for i in range(15):
            tracker.update((100.0 + 10 * i, 500.0 - 4 * i))
        pos = tracker.update((900.0, 100.0))        # far-away false positive
        assert pos is not None and abs(pos[0] - 250.0) < 20

    def test_reacquires_after_hit_reversal(self) -> None:
        tracker = ShuttleTracker(dt=1 / 60)
        for i in range(15):
            tracker.update((100.0 + 20 * i, 400.0))
        for i in range(1, 6):                       # shuttle hit back the other way
            pos = tracker.update((380.0 - 25 * i, 400.0))
        assert pos is not None and abs(pos[0] - (380.0 - 125)) < 15
        vx, _ = tracker.get_velocity()
        assert vx < 0


# ---------------------------------------------------------------------------
# Offline pipeline on a synthetic rally
# ---------------------------------------------------------------------------
class TestAnalyseTrack:
    FPS = 60.0

    def _pipe(self) -> tuple[CVPipeline, np.ndarray]:
        p = _camera(*OFFSET_CAM)
        pipe = CVPipeline.__new__(CVPipeline)       # skip detector loading
        pipe.sport = get_sport("badminton")
        pipe.calibration_source = "keypoints"
        pipe.camera = CourtCamera.from_corners(
            [tuple(_project(p, np.array([x, y, 0.0]))[0])
             for x, y in pipe.sport.ground_corners()], (W, H))
        pipe.results, pipe.flights = [], []
        return pipe, p

    def _rally(self, p: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        # 30 empty frames, then a 60 m/s hit drifting sideways (not down the line).
        _, flight = _flight(60.0, -0.1, self.FPS, duration=0.8, start=(3.05, 1.0, 2.5))
        world = np.vstack([np.full((30, 3), np.nan), flight])
        pixels = np.full((len(world), 2), np.nan)
        ok = np.isfinite(world).all(axis=1)
        pixels[ok] = _project(p, world[ok])
        return world, pixels

    def test_anchored_flight_speeds(self) -> None:
        pipe, p = self._pipe()
        world, pixels = self._rally(p)
        receiver = tuple(world[-1, :2])               # where the flight was heading
        df = pipe.analyse_track(pixels, [1.0] * len(pixels), self.FPS, (W, H), hit_frames=[30],
                                anchors={30: (3.05, 1.0), len(world): receiver})
        summary = pipe.get_summary()
        assert len(df) == len(world) and bool(df["stroke_detected"].iloc[30])
        assert summary["flights"][0]["method"] == "physics"
        assert summary["max_launch_speed_kmh"] == pytest.approx(60.0 * 3.6, rel=0.03)
        assert summary["flights"][0]["net_speed_kmh"] < summary["max_launch_speed_kmh"]

    def test_physics_fit_without_receiver(self) -> None:
        pipe, p = self._pipe()
        _, pixels = self._rally(p)
        pipe.analyse_track(pixels, [1.0] * len(pixels), self.FPS, (W, H), hit_frames=[30],
                           anchors={30: (3.05, 1.0)})
        flight = pipe.get_summary()["flights"][0]
        assert flight["method"] == "physics"
        assert flight["launch_speed_kmh"] == pytest.approx(60.0 * 3.6, rel=0.05)


# ---------------------------------------------------------------------------
# TrackNet (needs torch)
# ---------------------------------------------------------------------------
class TestTrackNet:
    @pytest.fixture(autouse=True)
    def _torch(self) -> None:
        pytest.importorskip("torch")

    @pytest.mark.parametrize("kwargs", [
        {},
        {"num_frames": 3, "use_background": True, "motion_attention": True},
        {"num_frames": 8, "use_background": True, "out_frames": 8, "width": 0.25},
    ])
    def test_shapes(self, kwargs) -> None:
        import torch
        from tracknet_model import TrackNet
        model = TrackNet(**kwargs).eval()
        x = torch.rand(2, model.in_channels, 72, 128)
        with torch.no_grad():
            y = model(x)
        assert y.shape == (2, kwargs.get("out_frames", 1), 72, 128)
        assert float(y.min()) >= 0 and float(y.max()) <= 1

    def test_width_multiplier_shrinks_model(self) -> None:
        from tracknet_model import TrackNet
        big = sum(p.numel() for p in TrackNet().parameters())
        small = sum(p.numel() for p in TrackNet(width=0.25).parameters())
        assert small < big / 10

    def test_decode_is_subpixel(self) -> None:
        import torch
        from tracknet_model import decode_heatmap
        ys, xs = torch.meshgrid(torch.arange(40.0), torch.arange(60.0), indexing="ij")
        hm = torch.exp(-((xs - 20.4) ** 2 + (ys - 10.7) ** 2) / (2 * 2.5 ** 2))[None, None]
        xy, score = decode_heatmap(hm, threshold=0.5)
        assert abs(float(xy[0, 0, 0]) - 20.4) < 0.1
        assert abs(float(xy[0, 0, 1]) - 10.7) < 0.1
        empty, _ = decode_heatmap(torch.zeros(1, 1, 40, 60))
        assert torch.isnan(empty).all()

    def test_weighted_bce_prefers_correct_peak(self) -> None:
        import torch
        from tracknet_model import weighted_bce
        target = torch.zeros(1, 1, 8, 8)
        target[0, 0, 4, 4] = 1.0
        good = target * 0.9 + 0.01
        bad = torch.full_like(target, 0.01)
        bad[0, 0, 0, 0] = 0.9
        assert weighted_bce(good, target) < weighted_bce(bad, target)


class TestLivePreview:
    def test_centred_camera_live_speed_stays_finite(self) -> None:
        p = _camera()                                   # on the centre line
        pipe = CVPipeline.__new__(CVPipeline)
        pipe.sport = get_sport("badminton")
        pipe.camera = CourtCamera.from_corners(
            [tuple(_project(p, np.array([x, y, 0.0]))[0])
             for x, y in pipe.sport.ground_corners()], (W, H))
        pipe.detector = None
        pipe._reset_live(60.0)
        frame = np.zeros((H, W, 3), np.uint8)
        speeds = []
        for i in range(20):
            point = _project(p, np.array([[3.05, 2.0 + 0.4 * i, 2.0]]))[0]
            pipe._detect = lambda _frame, pt=point: (tuple(pt), 1.0)
            speeds.append(pipe.process_frame(frame, 60.0, i).speed_kmh)
        tail = np.array(speeds[5:])
        assert np.all(np.isfinite(tail)) and np.all(tail > 0)
