"""Regression tests for the October 2026 adversarial review.

Each test pins one confirmed defect from ``research/review-findings-2026-10.md``
so it cannot come back. The ids (C1, C6, ...) are that document's.
"""
from __future__ import annotations

import numpy as np
import pytest
from court import CourtCamera, fit_projection
from pipeline import CVPipeline
from speed import SHUTTLE_DRAG_K, SpeedCalculator, first_bounce_index, fit_launch_speed
from sports import get_sport
from tracker import ShuttleTracker
from trajectory import OBSERVED, REPLACED, find_trajectory_turns, rectify_trajectory

W, H = 1920, 1080
FPS = 60.0


def _camera(center, target, f=1400.0) -> np.ndarray:
    c = np.asarray(center, dtype=float)
    z = np.asarray(target, dtype=float) - c
    z /= np.linalg.norm(z)
    x = np.cross(z, [0.0, 0.0, 1.0])
    x /= np.linalg.norm(x)
    r = np.vstack([x, np.cross(z, x), z])
    k = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1.0]])
    return k @ np.hstack([r, -r @ c.reshape(3, 1)])


def _project(p: np.ndarray, world: np.ndarray) -> np.ndarray:
    pts = np.atleast_2d(world)
    q = np.hstack([pts, np.ones((len(pts), 1))]) @ p.T
    return q[:, :2] / q[:, 2:3]


def _flight(v0, elev, fps, duration, start, k=SHUTTLE_DRAG_K, floor=None, restitution=0.75,
            heading=1.0):
    dt, sub = 1 / fps, 40
    p = np.array(start, dtype=float)
    v = np.array([0.05, heading * np.cos(elev), np.sin(elev)])
    v = v / np.linalg.norm(v) * v0
    out = []
    for _ in range(int(duration * fps)):
        out.append(p.copy())
        for _ in range(sub):
            v = v + (-k * np.linalg.norm(v) * v + np.array([0, 0, -9.81])) * dt / sub
            p = p + v * dt / sub
            if floor is not None and p[2] < floor and v[2] < 0:
                p[2], v[2] = floor, -v[2] * restitution
    return np.array(out)


def _pipe(sport_name="badminton", center=(0.8, -5.5, 3.2)):
    sport = get_sport(sport_name)
    p = _camera(center, (sport.court_width_m / 2, sport.court_length_m / 2, 0.0))
    pipe = CVPipeline.__new__(CVPipeline)
    pipe.sport = sport
    pipe.calibration_source = "keypoints"
    pipe.camera = CourtCamera.from_corners(
        [tuple(_project(p, np.array([x, y, 0.0]))[0]) for x, y in sport.ground_corners()], (W, H),
    )
    pipe.results, pipe.flights = [], []
    return pipe, p, sport


class TestTrajectory:
    def test_c6_post_hit_detections_survive(self) -> None:
        """The frames right after a hit carry the launch speed; keep them."""
        _, p, _ = _pipe()
        flight = _flight(90.0, -0.1, FPS, 0.5, (3.0, 2.5, 2.5))
        pix = np.full((20 + len(flight), 2), np.nan)
        pix[20:] = _project(p, flight)
        track = rectify_trajectory(pix, hit_frames=[20])
        assert (track.status[20:24] == OBSERVED).all()
        assert np.isfinite(track.positions[20:24]).all()

    def test_c6_launch_speed_survives_detector_noise(self) -> None:
        errors = []
        for seed in range(8):
            rng = np.random.default_rng(seed)
            pipe, p, _ = _pipe()
            flight = _flight(90.0, -0.1, FPS, 0.5, (3.0, 2.5, 2.5))
            pix = np.full((20 + len(flight), 2), np.nan)
            pix[20:] = _project(p, flight) + rng.normal(0, 1.0, (len(flight), 2))
            pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H),
                               hit_frames=[20], anchors={20: (3.0, 2.5)})
            errors.append(abs(pipe.flights[0].launch_speed_kmh - 90.0 * 3.6))
        # The unfixed code averaged 127.5 km/h of error here.
        assert np.mean(errors) < 40.0

    def test_c6_clutter_is_still_rejected(self) -> None:
        rng = np.random.default_rng(0)
        _, p, _ = _pipe()
        flight = _flight(60.0, -0.1, FPS, 0.8, (3.05, 1.0, 2.5))
        pix = np.full((10 + len(flight), 2), np.nan)
        pix[10:] = _project(p, flight) + rng.normal(0, 1.0, (len(flight), 2))
        pix[30] += np.array([60.0, -45.0])
        assert rectify_trajectory(pix, hit_frames=[10]).status[30] == REPLACED

    @pytest.mark.parametrize(
        ("v_in", "elev", "hit", "v_out"), [(40.0, 0.15, 18, 55.0), (35.0, 0.25, 20, 60.0)],
    )
    def test_c7_turns_are_not_displaced_by_the_coarse_pass(
        self, v_in: float, elev: float, hit: int, v_out: float,
    ) -> None:
        """Rectifying across a hit we haven't found yet moves it."""
        _, p, _ = _pipe()
        out = _flight(v_in, elev, FPS, hit / FPS + 0.01, (3.05, 2.0, 1.8))[:hit]
        back = _flight(v_out, 0.12, FPS, 0.4, tuple(out[-1]), heading=-1.0)[:24]
        pix = _project(p, np.vstack([out, back]))
        assert find_trajectory_turns(pix, 100.0, min_gap=10) == [hit], "scenario has no clean turn"

        # Gap-filling only: the turn stays where it happened.
        gap_filled = rectify_trajectory(pix, max_gap=4, iterations=0)
        assert find_trajectory_turns(gap_filled.positions, 100.0, min_gap=10) == [hit]

        # With the outlier pass the frames around the reversal are replaced by
        # a smooth fit, which drags the detected turn backwards.
        smoothed = rectify_trajectory(pix, max_gap=4)
        assert find_trajectory_turns(smoothed.positions, 100.0, min_gap=10) != [hit]

    def test_c7_analyse_track_finds_its_own_hits(self) -> None:
        pipe, p, _ = _pipe()
        out = _flight(40.0, 0.15, FPS, 18 / FPS + 0.01, (3.05, 2.0, 1.8))[:18]
        back = _flight(55.0, 0.12, FPS, 0.4, tuple(out[-1]), heading=-1.0)[:24]
        pix = _project(p, np.vstack([out, back]))
        df = pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H))
        assert bool(df["stroke_detected"].iloc[18])


class TestFlightFits:
    def test_c1_ball_speed_is_not_biased_by_a_bounce(self) -> None:
        pipe, p, sport = _pipe("pickleball", (1.0, -4.0, 2.5))
        world = _flight(19.5, 0.12, FPS, 0.9, (sport.court_width_m / 2, 1.0, 0.9),
                        k=sport.drag_k, floor=0.0)
        pix = np.full((30 + len(world), 2), np.nan)
        pix[30:] = _project(p, world)
        pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H), hit_frames=[30],
                           anchors={30: (sport.court_width_m / 2, 1.0)})
        # Fitting through the bounce reported 79.0 against a true 70.2 km/h.
        assert pipe.flights[0].launch_speed_kmh == pytest.approx(19.5 * 3.6, rel=0.05)

    def test_c1_shuttle_flights_are_not_cut(self) -> None:
        assert get_sport("badminton").bounces is False
        descending = np.stack([np.zeros(10), np.arange(10.0), np.linspace(2.5, 0.1, 10)], axis=1)
        assert first_bounce_index(descending) is None

    def test_c4_launch_speed_is_monotonic_in_the_truth(self) -> None:
        """v0 / (1 - k v0 tau) switched off at 0.9 and reported ~1/10th."""
        k, tau = SHUTTLE_DRAG_K, 0.10
        reported = []
        for truth_kmh in (140.0, 148.0, 151.0, 160.0, 260.0):
            v0 = truth_kmh / 3.6
            t = np.arange(0, 0.25, 1 / FPS)
            d = np.log1p(k * v0 * t) / k
            pos = np.stack([np.zeros_like(d), d, np.zeros_like(d)], axis=1)
            keep = t >= tau
            fit = fit_launch_speed(t[keep], pos[keep], k, 565.0, hit_time_s=0.0)
            reported.append(fit.speed_kmh)
            assert fit.speed_kmh == pytest.approx(truth_kmh, rel=0.02)
        assert reported == sorted(reported)

    def test_c8_dead_time_gets_no_speed(self) -> None:
        pipe, p, _ = _pipe()
        flight = _flight(60.0, -0.1, FPS, 0.8, (3.05, 1.0, 2.5))
        pix = np.full((30 + len(flight) + 120, 2), np.nan)
        pix[30:30 + len(flight)] = _project(p, flight)
        df = pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H), hit_frames=[30],
                                anchors={30: (3.05, 1.0)})
        tail = df.iloc[-115:]
        assert int((tail.speed_kmh.notna() & tail.shuttle_x.isna()).sum()) == 0


class TestCourtGeometry:
    @pytest.mark.parametrize("name", ["badminton", "tennis", "pickleball", "table_tennis"])
    def test_c2_real_post_tops_calibrate_correctly(self, name: str) -> None:
        sport = get_sport(name)
        centre = (sport.court_width_m * 0.3, -sport.court_length_m * 0.35,
                  max(1.0, sport.court_length_m * 0.2))
        p = _camera(centre, (sport.court_width_m / 2, sport.court_length_m / 2, 0.0))
        kps = {n: tuple(_project(p, np.array(w))[0])
               for n, w in sport.calibration_keypoints().items()}
        cam = CourtCamera.from_keypoints(kps, (W, H), sport)
        assert np.linalg.norm(cam.camera_center - np.array(centre)) < 0.05

    def test_c3_table_tennis_floor_is_below_the_table(self) -> None:
        sport = get_sport("table_tennis")
        assert sport.floor_z_m == pytest.approx(-0.76)
        p = _camera((0.7, -1.5, 1.0), (sport.court_width_m / 2, sport.court_length_m / 2, 0.0))
        cam = CourtCamera.from_corners(
            [tuple(_project(p, np.array([x, y, 0.0]))[0]) for x, y in sport.ground_corners()],
            (W, H), sport,
        )
        feet = np.array([0.5, -1.0, sport.floor_z_m])
        px = _project(p, feet)
        got = cam.image_to_plane(px, sport.floor_z_m)[0]
        assert np.allclose(got, feet[:2], atol=0.02)
        assert not np.allclose(cam.image_to_ground(px)[0], feet[:2], atol=0.2)

    def test_c5_degenerate_dlt_falls_back_to_the_homography(self) -> None:
        sport = get_sport("badminton")
        world = sport.calibration_keypoints()
        side_on = _camera((-6.0, 6.7, 1.3), (3.05, 6.7, 1.0), f=1000.0)
        kps = {n: tuple(_project(side_on, np.array(w))[0]) for n, w in world.items()}
        assert CourtCamera.from_keypoints(kps, (W, H), sport).calibration_path == "homography"

        good = _camera((0.8, -5.5, 3.2), (3.05, 6.7, 0.0), f=1000.0)
        kps = {n: tuple(_project(good, np.array(w))[0]) for n, w in world.items()}
        assert CourtCamera.from_keypoints(kps, (W, H), sport).calibration_path == "dlt6"

    def test_c5_conditioning_is_reported(self) -> None:
        sport = get_sport("badminton")
        kp = sport.calibration_keypoints()
        names = list(kp)
        world = np.array([kp[n] for n in names])
        p = _camera((0.8, -5.5, 3.2), (3.05, 6.7, 0.0), f=1000.0)
        _, cond = fit_projection(world, _project(p, world), return_conditioning=True)
        assert 0.0 < cond <= 1.0


class TestTracker:
    def test_c10_reinitialised_track_still_coasts(self) -> None:
        t = ShuttleTracker(dt=1 / FPS)
        for _ in range(6):
            t.update(None)                       # lose the first track
        out = [t.update((340.0 + 20 * i, 50.0) if i % 2 == 0 else None) for i in range(6)]
        assert all(o is not None for o in out)

    def test_c13_reacquire_velocity_accounts_for_the_gap(self) -> None:
        t = ShuttleTracker(dt=1 / FPS)
        for f in range(6):
            t.update((100.0 + 25 * f, 50.0))     # establish a track going +x
        t.update((100.0, 50.0))                  # gated out: remembered
        t.update(None)                           # one frame with nothing
        t.update((75.0, 50.0))                   # gated out again -> re-acquire
        vx, _ = t.get_velocity()
        # The two rejected detections are 25 px and two frames apart, so the
        # initial velocity is 12.5 px/frame. Dividing by a single dt, as the
        # unfixed code did, doubled it.
        assert vx == pytest.approx(-12.5 * FPS, rel=0.25)


class TestLiveSpeed:
    def test_c11_no_spike_when_a_new_track_starts(self) -> None:
        sc = SpeedCalculator(fps=FPS, max_speed_kmh=565.0)
        sc.calibration.calibrate_auto(W, H)
        for i in range(10):
            sc.compute_speed((100.0 + 2 * i, 50.0))
        sc.break_track()
        assert sc.compute_speed((1300.0, 50.0)) is None   # only seeds the position
        assert sc.compute_speed((1302.0, 50.0)) < 10.0

    def test_c12_live_preview_uses_this_sport_s_court(self) -> None:
        lengths = set()
        for name in ("badminton", "tennis", "table_tennis"):
            pipe = CVPipeline.__new__(CVPipeline)
            pipe.sport = get_sport(name)
            pipe.camera = None
            pipe._reset_live(FPS)
            lengths.add(pipe.speed_calc.calibration.court_length_m)
        assert len(lengths) == 3

    def test_s1_dropped_frames_do_not_inflate_speed(self) -> None:
        def run(stride: int) -> float:
            sc = SpeedCalculator(fps=FPS, max_speed_kmh=565.0)
            sc.calibration.calibrate_auto(W, H)
            last, speed = None, None
            for f in range(0, 40, stride):
                gap = 1 if last is None else f - last
                last = f
                got = sc.compute_speed((100.0 + 8.0 * f, 540.0), frames=gap)
                if got is not None:
                    speed = got
            return speed

        assert run(2) == pytest.approx(run(1), rel=0.01)
        assert run(3) == pytest.approx(run(1), rel=0.01)


class TestWallSports:
    """A wall rebound has no vertical-velocity flip, so no bounce to cut at."""

    def test_squash_and_padel_are_flagged(self) -> None:
        assert get_sport("squash").wall_rebounds is True
        assert get_sport("padel").wall_rebounds is True
        for name in ("badminton", "tennis", "table_tennis", "pickleball"):
            assert get_sport(name).wall_rebounds is False

    def test_wall_sports_report_no_launch_speed(self) -> None:
        pipe, p, sport = _pipe("squash", (1.0, -4.0, 2.6))
        flight = _flight(40.0, 0.12, FPS, 0.7, (sport.court_width_m / 2, 1.0, 0.9), k=sport.drag_k)
        pix = np.full((20 + len(flight), 2), np.nan)
        pix[20:] = _project(p, flight)
        pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H), hit_frames=[20],
                           anchors={20: (sport.court_width_m / 2, 1.0)})
        assert pipe.flights[0].launch_speed_kmh is None
        assert pipe.flights[0].method == "unsupported-wall-rebound"

    def test_net_sports_still_report_a_speed(self) -> None:
        pipe, p, sport = _pipe("tennis", (2.0, -8.0, 3.4))
        flight = _flight(30.0, 0.08, FPS, 0.45, (sport.court_width_m / 2, 2.0, 1.1), k=sport.drag_k)
        pix = np.full((20 + len(flight), 2), np.nan)
        pix[20:] = _project(p, flight)
        pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H), hit_frames=[20],
                           anchors={20: (sport.court_width_m / 2, 2.0)})
        assert pipe.flights[0].launch_speed_kmh is not None


class TestSpeedHonesty:
    """A speed with no calibration behind it is not a speed."""

    def test_rough_calibration_reports_no_speed(self) -> None:
        pipe, p, sport = _pipe()
        pipe.calibration_source = "rough"
        pipe.camera = None
        flight = _flight(60.0, -0.1, FPS, 0.8, (3.05, 1.0, 2.5))
        pix = np.full((30 + len(flight), 2), np.nan)
        pix[30:] = _project(p, flight)
        pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H), hit_frames=[30])
        summary = pipe.get_summary()
        assert summary["speed_is_metric"] is False
        assert summary["max_speed_kmh"] is None
        assert summary["avg_speed_kmh"] is None

    def test_calibrated_clip_still_reports_a_speed(self) -> None:
        pipe, p, _ = _pipe()
        flight = _flight(60.0, -0.1, FPS, 0.8, (3.05, 1.0, 2.5))
        pix = np.full((30 + len(flight), 2), np.nan)
        pix[30:] = _project(p, flight)
        pipe.analyse_track(pix, [1.0] * len(pix), FPS, (W, H), hit_frames=[30],
                           anchors={30: (3.05, 1.0)})
        summary = pipe.get_summary()
        assert summary["speed_is_metric"] is True
        assert summary["max_speed_kmh"] is not None

    def test_an_empty_clip_reports_none_not_zero(self) -> None:
        pipe, _, _ = _pipe()
        pipe.analyse_track(np.full((60, 2), np.nan), [0.0] * 60, FPS, (W, H), hit_frames=[])
        summary = pipe.get_summary()
        assert summary["max_speed_kmh"] is None, "0.0 would read as 'measured, and it was zero'"
