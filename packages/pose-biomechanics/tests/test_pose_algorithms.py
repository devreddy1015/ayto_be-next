"""Tests for One-Euro smoothing, RTMPose mapping, hit fusion and DTW technique comparison."""
from __future__ import annotations

import numpy as np
import pytest
from angles import JointAngleComputer
from keypoints import COCO_TO_BLAZEPOSE, _select_main_person, coco17_to_blazepose
from normalize import OneEuroFilter, smooth_sequence
from stroke_events import StrokeEvent, fuse_hits
from technique import compare_technique, dtw_path


class TestOneEuro:
    def _signal(self, fps: float) -> tuple[np.ndarray, np.ndarray]:
        t = np.arange(0, 3, 1 / fps)
        return t, 0.8 * np.tanh((t - 1.5) / 0.04)      # rest, fast swing, rest

    @pytest.mark.parametrize("fps", [30.0, 60.0])
    def test_beats_ema_on_jitter_and_lag(self, fps: float) -> None:
        t, truth = self._signal(fps)
        rng = np.random.default_rng(0)
        rest = (np.abs(t - 1.5) > 0.3)[1:]
        swing = np.abs(t - 1.5) <= 0.1
        scores = {}
        for method in ("one_euro", "ema"):
            jitter, lag = [], []
            for _ in range(20):
                noisy = truth + rng.normal(0, 0.03, len(t))
                frames = [np.column_stack([np.full((33, 3), v), np.ones(33)]) for v in noisy]
                out = np.array([f[0, 0] for f in smooth_sequence(frames, method=method, fps=fps)])
                jitter.append(np.sqrt(np.mean((np.diff(out) - np.diff(truth))[rest] ** 2)))
                lag.append(np.sqrt(np.mean((out - truth)[swing] ** 2)))
            scores[method] = (np.mean(jitter), np.mean(lag))
        assert scores["one_euro"][0] < scores["ema"][0]
        assert scores["one_euro"][1] < scores["ema"][1]

    def test_missing_frames_carry_forward(self) -> None:
        frame = np.ones((33, 4))
        out = smooth_sequence([None, frame, None, frame * 2])
        assert out[0] is None and np.allclose(out[2], out[1])

    def test_unknown_method(self) -> None:
        with pytest.raises(ValueError):
            smooth_sequence([np.ones((33, 4))], method="kalman")

    def test_filter_is_identity_on_constant(self) -> None:
        f = OneEuroFilter(fps=30)
        for _ in range(10):
            out = f(np.full(3, 2.5))
        assert np.allclose(out, 2.5)


class TestRtmposeMapping:
    def test_coco_to_blazepose_layout(self) -> None:
        kps = np.arange(34, dtype=float).reshape(17, 2) * 10
        scores = np.linspace(0.5, 1.0, 17)
        out = coco17_to_blazepose(kps, scores, (640, 480))
        assert out.shape == (33, 4)
        assert out[16, 0] == pytest.approx(kps[10, 0] / 640)   # right wrist
        assert out[24, 1] == pytest.approx(kps[12, 1] / 480)   # right hip
        missing = sorted(set(range(33)) - set(COCO_TO_BLAZEPOSE.values()))
        assert np.all(out[missing, 3] == 0)

    def test_wrist_angle_skipped_without_fingers(self) -> None:
        out = coco17_to_blazepose(np.random.rand(17, 2) * 400, np.ones(17), (640, 480))
        angles = JointAngleComputer().compute_all_angles(out)
        assert "right_elbow" in angles and "right_wrist" not in angles

    def test_main_person_is_largest(self) -> None:
        small = np.random.rand(17, 2) * 50
        big = np.random.rand(17, 2) * 400
        assert _select_main_person(np.stack([small, big]), np.ones((2, 17))) == 1


def _event(frame: int, conf: float = 0.8) -> StrokeEvent:
    return StrokeEvent(frame - 10, frame, frame + 8, 2.0, "right", conf)


class TestFuseHits:
    def test_rally_alternates(self) -> None:
        # Player hits at 30 and 150 (swing + turn); opponent at 90 (turn only).
        hits = fuse_hits([_event(31), _event(149)], [30, 90, 150], fps=60)
        assert [(h.frame, h.hitter, h.source) for h in hits] == [
            (30, "player", "shuttle+pose"), (90, "opponent", "shuttle"),
            (150, "player", "shuttle+pose")]

    def test_feint_dropped_when_shuttle_visible(self) -> None:
        visible = np.ones(200, dtype=bool)
        hits = fuse_hits([_event(31), _event(60)], [30, 90], fps=60, shuttle_visible=visible)
        assert [h.frame for h in hits] == [30, 90]

    def test_swing_kept_when_shuttle_occluded(self) -> None:
        visible = np.ones(200, dtype=bool)
        visible[100:130] = False
        hits = fuse_hits([_event(115)], [60], fps=60, shuttle_visible=visible)
        assert [(h.frame, h.hitter) for h in hits] == [(60, "opponent"), (115, "player")]

    def test_no_double_hit(self) -> None:
        hits = fuse_hits([], [30, 60], fps=60)   # two opponent hits in a row
        assert len(hits) == 1


class TestTechnique:
    JOINTS = ["right_elbow", "right_shoulder", "right_knee", "left_knee"]

    def _stroke(self, fps: float, delays: dict[int, float] | None = None, n: float = 1.2):
        t = np.arange(0, n, 1 / fps)
        delays = delays or {}
        cols = []
        for j, (lo, hi, at) in enumerate([(80, 165, 0.6), (60, 170, 0.55),
                                          (150, 120, 0.5), (150, 130, 0.45)]):
            centre = at + delays.get(j, 0.0)
            cols.append(lo + (hi - lo) / (1 + np.exp(-(t - centre) / 0.03)))
        return np.column_stack(cols)

    def test_dtw_identical_is_diagonal(self) -> None:
        x = np.sin(np.linspace(0, 3, 40))[:, None]
        path, cost = dtw_path(x, x)
        assert cost == pytest.approx(0.0) and all(i == j for i, j in path)

    def test_dtw_absorbs_global_tempo(self) -> None:
        a = np.sin(np.linspace(0, 3, 40))[:, None]
        b = np.sin(np.linspace(0, 3, 55))[:, None]
        _, warped = dtw_path(a, b)
        assert warped / 55 < 0.05

    def test_identical_stroke_scores_one(self) -> None:
        s = self._stroke(60)
        result = compare_technique(s, s, self.JOINTS, fps=60)
        assert result.similarity == pytest.approx(1.0)
        assert not result.feedback

    def test_slower_tempo_alone_is_not_penalised(self) -> None:
        fast = self._stroke(60)
        slow = self._stroke(48)          # same motion sampled as if 25% slower
        result = compare_technique(slow, fast, self.JOINTS, fps=60)
        assert result.similarity > 0.85

    def test_late_elbow_reported(self) -> None:
        ref = self._stroke(60)
        player = self._stroke(60, delays={0: 0.08})     # elbow extends 80 ms late
        result = compare_technique(player, ref, self.JOINTS, fps=60)
        elbow = result.per_joint["right_elbow"]
        assert elbow.timing_offset_ms > 30
        others = [result.per_joint[j].timing_offset_ms for j in self.JOINTS[1:]]
        assert max(abs(o) for o in others) < elbow.timing_offset_ms
        assert any("Right elbow" in tip and "late" in tip for tip in result.feedback)

    def test_hit_crop_and_fps_resample(self) -> None:
        ref = self._stroke(120, n=2.0)
        player = np.vstack([np.full((60, 4), 150.0), self._stroke(60)])  # idle lead-in
        result = compare_technique(player, ref, self.JOINTS, fps=60, player_hit=96,
                                   reference_hit=72, reference_fps=120)
        assert result.similarity > 0.8

    def test_missing_joint_ignored(self) -> None:
        s = self._stroke(60)
        p = s.copy()
        p[:, 2] = np.nan
        result = compare_technique(p, s, self.JOINTS, fps=60)
        assert "right_knee" not in result.per_joint and len(result.per_joint) == 3
