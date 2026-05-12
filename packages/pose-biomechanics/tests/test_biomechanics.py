import numpy as np
import pytest

from src.angles import JointAngleComputer
from src.normalizer import PoseNormalizer


class TestJointAngleComputer:
    def test_right_angle(self):
        a = np.array([1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([0.0, 1.0, 0.0])
        angle = JointAngleComputer.angle_between_points(a, b, c)
        assert angle == pytest.approx(90.0, abs=0.1)

    def test_straight_angle(self):
        a = np.array([1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([-1.0, 0.0, 0.0])
        angle = JointAngleComputer.angle_between_points(a, b, c)
        assert angle == pytest.approx(180.0, abs=0.1)

    def test_compute_all_angles(self):
        landmarks = np.random.rand(33, 4)
        computer = JointAngleComputer()
        angles = computer.compute_all_angles(landmarks)
        assert len(angles) == 10
        for name, angle in angles.items():
            assert 0 <= angle <= 180

    def test_wrist_velocity(self):
        prev = np.zeros((33, 4))
        curr = np.zeros((33, 4))
        curr[16, :3] = [0.1, 0.0, 0.0]
        velocity = JointAngleComputer.wrist_velocity(prev, curr, fps=60.0, side="right")
        assert velocity > 0


class TestPoseNormalizer:
    def test_hip_centered(self):
        landmarks = np.random.rand(33, 4)
        normalizer = PoseNormalizer()
        normalized = normalizer.normalize(landmarks)
        hip_mid = (normalized[23, :3] + normalized[24, :3]) / 2
        assert np.allclose(hip_mid, 0.0, atol=1e-6)

    def test_scale_invariant(self):
        landmarks = np.random.rand(33, 4)
        normalizer = PoseNormalizer()
        n1 = normalizer.normalize(landmarks)
        scaled = landmarks.copy()
        scaled[:, :3] *= 2.0
        n2 = normalizer.normalize(scaled)
        assert np.allclose(n1[:, :3], n2[:, :3], atol=0.1)

    def test_none_handling(self):
        normalizer = PoseNormalizer()
        result = normalizer.normalize_sequence([None, np.random.rand(33, 4), None])
        assert result[0] is None
        assert result[1] is not None
        assert result[2] is None
