"""Regression tests for the October 2026 adversarial review (pose side).

Ids (C15, C16, ...) are those of ``research/review-findings-2026-10.md``.
"""
from __future__ import annotations

import numpy as np
import pytest
from keypoints import _select_main_person
from normalize import smooth_sequence
from stroke_events import StrokeDetector, StrokeEvent, fuse_hits


def _event(peak: int, confidence: float = 0.9) -> StrokeEvent:
    return StrokeEvent(
        start_frame=max(0, peak - 5), peak_frame=peak, end_frame=peak + 5,
        peak_wrist_speed=30.0, dominant_hand="right", confidence=confidence,
    )


class TestFuseHits:
    def test_c15_serve_after_a_won_rally_is_kept(self) -> None:
        """The rally winner serves next, so two player hits in a row are real."""
        hits = fuse_hits(
            [_event(31), _event(149), _event(451), _event(569)],
            [30, 90, 150, 450, 510, 570], fps=60.0,
        )
        frames = [h.frame for h in hits]
        assert frames == [30, 90, 150, 450, 510, 570]
        assert [h.hitter for h in hits] == [
            "player", "opponent", "player", "player", "opponent", "player",
        ]

    def test_c15_double_hit_inside_a_rally_is_still_collapsed(self) -> None:
        hits = fuse_hits([], [30, 60], fps=60.0)     # 0.5 s apart: same rally
        assert len(hits) == 1

    def test_c17_serve_from_rest_is_kept(self) -> None:
        """A serve has no incoming trajectory, so it never produces a turn."""
        visible = np.ones(120, dtype=bool)
        speed = np.full(120, np.nan)
        speed[:30] = 0.2          # shuttle held, almost still
        speed[31:] = 40.0         # launched
        hits = fuse_hits([_event(30)], [75], fps=30.0,
                         shuttle_visible=visible, shuttle_speed=speed)
        assert [(h.frame, h.hitter) for h in hits] == [(30, "player"), (75, "opponent")]
        assert hits[0].source == "pose+serve"

    def test_c17_feint_is_still_dropped(self) -> None:
        visible = np.ones(120, dtype=bool)
        speed = np.full(120, 40.0)   # shuttle moving the whole time
        hits = fuse_hits([_event(30)], [75], fps=30.0,
                         shuttle_visible=visible, shuttle_speed=speed)
        assert [h.frame for h in hits] == [75]

    def test_c17_without_speed_behaviour_is_unchanged(self) -> None:
        visible = np.ones(120, dtype=bool)
        assert [h.frame for h in fuse_hits([_event(30)], [75], fps=30.0,
                                           shuttle_visible=visible)] == [75]


class TestSelectMainPerson:
    def test_c16_low_score_full_frame_skeleton_is_rejected(self) -> None:
        """rtmlib returns a full-image box when its detector finds nobody."""
        kps = np.random.default_rng(0).uniform(0, 600, (1, 17, 2))
        assert _select_main_person(kps, np.full((1, 17), 0.15)) is None

    def test_c16_confident_person_is_selected(self) -> None:
        kps = np.random.default_rng(0).uniform(0, 600, (1, 17, 2))
        assert _select_main_person(kps, np.full((1, 17), 0.8)) == 0

    def test_c16_torso_must_be_visible(self) -> None:
        kps = np.random.default_rng(0).uniform(0, 600, (1, 17, 2))
        scores = np.full((1, 17), 0.9)
        scores[0, [5, 6, 11, 12]] = 0.1        # shoulders and hips unseen
        assert _select_main_person(kps, scores) is None

    def test_c16_largest_confident_person_wins(self) -> None:
        small = np.zeros((17, 2)) + np.linspace(0, 50, 17)[:, None]
        big = np.zeros((17, 2)) + np.linspace(0, 400, 17)[:, None]
        assert _select_main_person(np.stack([small, big]), np.full((2, 17), 0.9)) == 1


class TestSmoothSequence:
    def test_c18_carry_forward_is_bounded(self) -> None:
        seq = ([np.ones((33, 4))] * 5) + ([None] * 60) + ([np.ones((33, 4)) * 2] * 5)
        out = smooth_sequence(seq, fps=30.0)
        assert len(out) == len(seq)
        held = sum(1 for frame in out[5:65] if frame is not None)
        assert held == 3                       # the default max_carry_frames
        assert all(frame is None for frame in out[8:65])

    def test_c18_short_dropouts_are_still_bridged(self) -> None:
        seq = [np.ones((33, 4)), None, None, np.ones((33, 4)) * 2]
        out = smooth_sequence(seq, fps=30.0)
        assert all(frame is not None for frame in out)

    def test_c18_filter_restarts_after_a_long_gap(self) -> None:
        """A fresh filter must not read the gap as one frame of motion."""
        a = np.zeros((33, 4))
        b = np.zeros((33, 4))
        b[:, :3] = 100.0
        out = smooth_sequence([a] * 5 + [None] * 30 + [b] * 5, fps=30.0)
        first_after = next(f for f in out[35:] if f is not None)
        # Re-acquisition starts the filter at the new pose, not part-way from
        # the stale one.
        assert np.allclose(first_after[:, :3], 100.0)


class TestFrameRateScaling:
    """C34: stroke windows were fixed frame counts calibrated at 60 fps."""

    @staticmethod
    def _rally(fps: float, shot_interval_s: float = 0.5, shots: int = 8):
        peaks = [int((i * shot_interval_s + 0.5) * fps) for i in range(shots)]
        seq = []
        for f in range(int(shots * shot_interval_s * fps) + int(fps)):
            kp = np.zeros((33, 4))
            kp[:, 3] = 1.0
            kp[[11, 12, 23, 24], :2] = [[0.45, 0.35], [0.55, 0.35], [0.46, 0.6], [0.54, 0.6]]
            swing = np.exp(-(min(abs(f - p) for p in peaks) ** 2) / (2 * (0.05 * fps) ** 2))
            kp[16, :2] = [0.55 + 0.30 * swing, 0.40 - 0.25 * swing]
            kp[15, :2] = [0.45, 0.45]
            seq.append(kp)
        return seq, peaks

    @pytest.mark.parametrize("fps", [24.0, 30.0, 50.0, 60.0, 120.0])
    def test_c34_rally_is_found_at_any_frame_rate(self, fps: float) -> None:
        seq, peaks = self._rally(fps)
        assert len(StrokeDetector(fps=fps).detect(seq)) == len(peaks)

    @pytest.mark.parametrize("fps", [24.0, 30.0, 60.0, 120.0])
    def test_c34_windows_are_durations_not_frame_counts(self, fps: float) -> None:
        d = StrokeDetector(fps=fps)
        assert d.min_gap_frames / fps == pytest.approx(StrokeDetector.MIN_GAP_S, abs=0.03)
        assert d.window_before / fps == pytest.approx(StrokeDetector.WINDOW_BEFORE_S, abs=0.03)
        assert d.window_after / fps == pytest.approx(StrokeDetector.WINDOW_AFTER_S, abs=0.03)

    def test_c34_a_fixed_24_frame_gap_would_halve_the_rally(self) -> None:
        """Guards the fix: show the old behaviour is what it protects against."""
        seq, peaks = self._rally(30.0)
        d = StrokeDetector(fps=30.0)
        d.min_gap_frames = 24  # the pre-fix constant
        assert len(d.detect(seq)) < len(peaks) / 1.5
