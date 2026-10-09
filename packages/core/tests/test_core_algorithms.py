"""Core wiring for the research-driven algorithms: DTW comparison and the real pipeline."""
from __future__ import annotations

import json

import cv2
import numpy as np
import pytest
from src.comparison import ProComparisonEngine
from src.orchestrator import _ensure_paths, run_full_pipeline

_ensure_paths()


def _stroke(fps: float, elbow_delay: float = 0.0) -> list[dict[str, float]]:
    t = np.arange(0, 1.2, 1 / fps)
    elbow = 80 + 85 / (1 + np.exp(-(t - 0.6 - elbow_delay) / 0.03))
    shoulder = 60 + 110 / (1 + np.exp(-(t - 0.55) / 0.03))
    knee = 150 - 30 / (1 + np.exp(-(t - 0.5) / 0.03))
    return [{"right_elbow": e, "right_shoulder": s, "right_knee": k}
            for e, s, k in zip(elbow, shoulder, knee)]


class TestSequenceComparison:
    def test_identical_strokes(self) -> None:
        ref = _stroke(60)
        comp = ProComparisonEngine.compare_sequence(ref, ref, fps=60)
        assert comp.similarity_score == pytest.approx(1.0)

    def test_late_elbow_surfaces_in_feedback_and_json(self) -> None:
        comp = ProComparisonEngine.compare_sequence(
            _stroke(60, elbow_delay=0.08), _stroke(60), fps=60, reference_name="Coach",
        )
        assert comp.timing_offsets_ms["right_elbow"] > 50
        assert any("late" in tip for tip in comp.feedback)

    def test_missing_frames_tolerated(self) -> None:
        player = _stroke(60)
        player[10:14] = [None] * 4
        comp = ProComparisonEngine.compare_sequence(player, _stroke(60), fps=60)
        assert comp.similarity_score > 0.9


class TestRealPipelineDegradesGracefully:
    def test_runs_without_models(self, tmp_path) -> None:
        """No pose backend or detector weights installed: the session still builds."""
        path = tmp_path / "clip.mp4"
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
        for i in range(30):
            frame = np.full((240, 320, 3), 40, np.uint8)
            cv2.circle(frame, (20 + 9 * i, 120), 3, (255, 255, 255), -1)
            writer.write(frame)
        writer.release()

        session = run_full_pipeline(path, use_real_inference=True)
        data = json.loads(session.to_json())
        assert data["metrics"]["total_frames"] == 30
        assert data["comparisons"] == []   # no classifier -> no misleading pro comparison
