"""Unit tests for pose-biomechanics: angles, normalizer, stroke detection."""
import numpy as np
import pytest

from angles import (
    JointAngleComputer,
    compute_elbow_angle,
    compute_knee_bend,
    compute_shoulder_angle,
    compute_trunk_lean,
)
from normalize import PoseNormalizer, normalize_keypoints


class TestStandaloneFunctions:
    def test_compute_elbow_angle_right(self) -> None:
        s = np.array([1.0, 0.0, 0.0])
        e = np.array([0.0, 0.0, 0.0])
        w = np.array([0.0, 1.0, 0.0])
        assert compute_elbow_angle(s, e, w) == pytest.approx(90.0, abs=0.1)

    def test_compute_shoulder_angle(self) -> None:
        h = np.array([0.0, 1.0, 0.0])
        s = np.array([0.0, 0.0, 0.0])
        e = np.array([1.0, 0.0, 0.0])
        assert compute_shoulder_angle(h, s, e) == pytest.approx(90.0, abs=0.1)

    def test_compute_knee_bend_straight(self) -> None:
        h = np.array([0.0, 0.0, 0.0])
        k = np.array([0.0, 1.0, 0.0])
        a = np.array([0.0, 2.0, 0.0])
        assert compute_knee_bend(h, k, a) == pytest.approx(180.0, abs=0.1)

    def test_compute_trunk_lean_upright(self) -> None:
        sm = np.array([0.5, 0.0, 0.0])
        hm = np.array([0.5, 1.0, 0.0])
        angle = compute_trunk_lean(sm, hm)
        assert angle == pytest.approx(0.0, abs=0.5)

    def test_compute_trunk_lean_horizontal(self) -> None:
        sm = np.array([1.0, 0.5, 0.0])
        hm = np.array([0.0, 0.5, 0.0])
        angle = compute_trunk_lean(sm, hm)
        assert angle == pytest.approx(90.0, abs=0.5)


class TestJointAngleComputer:
    def test_right_angle(self) -> None:
        a = np.array([1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([0.0, 1.0, 0.0])
        assert JointAngleComputer.angle_between_points(a, b, c) == pytest.approx(90.0, abs=0.1)

    def test_straight_angle(self) -> None:
        a = np.array([1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([-1.0, 0.0, 0.0])
        assert JointAngleComputer.angle_between_points(a, b, c) == pytest.approx(180.0, abs=0.1)

    def test_compute_all_angles(self) -> None:
        landmarks = np.random.rand(33, 4)
        angles = JointAngleComputer().compute_all_angles(landmarks)
        assert len(angles) == 10
        for angle in angles.values():
            assert 0 <= angle <= 180

    def test_wrist_velocity(self) -> None:
        prev = np.zeros((33, 4))
        curr = np.zeros((33, 4))
        curr[16, :3] = [0.1, 0.0, 0.0]
        assert JointAngleComputer.wrist_velocity(prev, curr, fps=60.0, side="right") > 0


class TestPoseNormalizer:
    def test_hip_centered(self) -> None:
        landmarks = np.random.rand(33, 4)
        normalized = normalize_keypoints(landmarks)
        hip_mid = (normalized[23, :3] + normalized[24, :3]) / 2
        assert np.allclose(hip_mid, 0.0, atol=1e-6)

    def test_scale_invariant(self) -> None:
        landmarks = np.random.rand(33, 4)
        n1 = normalize_keypoints(landmarks)
        scaled = landmarks.copy()
        scaled[:, :3] *= 2.0
        n2 = normalize_keypoints(scaled)
        assert np.allclose(n1[:, :3], n2[:, :3], atol=0.1)

    def test_none_handling(self) -> None:
        normalizer = PoseNormalizer()
        result = normalizer.normalize_sequence([None, np.random.rand(33, 4), None])
        assert result[0] is None
        assert result[1] is not None
        assert result[2] is None

    def test_class_wrapper_matches_function(self) -> None:
        landmarks = np.random.rand(33, 4)
        func_result = normalize_keypoints(landmarks)
        class_result = PoseNormalizer().normalize(landmarks)
        assert np.allclose(func_result, class_result)


class TestStrokeDetector:
    def test_no_events_on_static(self) -> None:
        from stroke_events import StrokeDetector
        sequence = [np.random.rand(33, 4) * 0.001 for _ in range(60)]
        detector = StrokeDetector(fps=60.0)
        events = detector.detect(sequence)
        assert isinstance(events, list)

    def test_events_have_correct_fields(self) -> None:
        from stroke_events import StrokeDetector
        np.random.seed(42)
        sequence: list[np.ndarray] = []
        for i in range(60):
            lm = np.zeros((33, 4), dtype=np.float32)
            lm[:, :3] = np.random.rand(33, 3) * 0.001
            lm[16, :3] = [0.5 + i * 0.001, 0.5, 0.0]
            if i in (25, 26):
                lm[16, :3] = [0.5 + 0.5, 0.5, 0.0]
            sequence.append(lm)
        detector = StrokeDetector(fps=60.0)
        events = detector.detect(sequence)
        for e in events:
            assert hasattr(e, "start_frame")
            assert hasattr(e, "peak_frame")
            assert hasattr(e, "end_frame")
            assert hasattr(e, "peak_wrist_speed")
            assert hasattr(e, "dominant_hand")
            assert e.dominant_hand in ("right", "left")
            assert e.start_frame <= e.peak_frame <= e.end_frame

    def test_min_gap_between_events(self) -> None:
        from stroke_events import StrokeDetector
        np.random.seed(123)
        sequence: list[np.ndarray] = []
        for i in range(120):
            lm = np.zeros((33, 4), dtype=np.float32)
            lm[16, :3] = [0.5 + i * 0.001, 0.5, 0.0]
            if i in (20, 21):
                lm[16, :3] = [1.0, 0.5, 0.0]
            if i in (50, 51):
                lm[16, :3] = [1.0, 0.5, 0.0]
            sequence.append(lm)
        detector = StrokeDetector(fps=60.0)
        events = detector.detect(sequence)
        for i in range(1, len(events)):
            assert events[i].peak_frame - events[i-1].peak_frame >= 15
