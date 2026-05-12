"""Joint angle computation for biomechanics analysis."""
from __future__ import annotations
import math
import numpy as np

JOINT_TRIPLETS = {
    "left_elbow": (11, 13, 15), "right_elbow": (12, 14, 16),
    "left_shoulder": (13, 11, 23), "right_shoulder": (14, 12, 24),
    "left_hip": (11, 23, 25), "right_hip": (12, 24, 26),
    "left_knee": (23, 25, 27), "right_knee": (24, 26, 28),
    "left_wrist": (13, 15, 19), "right_wrist": (14, 16, 20),
}

def _angle_3points(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Compute angle at point b formed by a-b-c in degrees."""
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    cosine = np.clip(cosine, -1.0, 1.0)
    return float(math.degrees(math.acos(cosine)))

def compute_elbow_angle(shoulder: np.ndarray, elbow: np.ndarray, wrist: np.ndarray) -> float:
    """Compute elbow flexion angle (shoulder-elbow-wrist) in degrees."""
    return _angle_3points(shoulder, elbow, wrist)

def compute_shoulder_angle(hip: np.ndarray, shoulder: np.ndarray, elbow: np.ndarray) -> float:
    """Compute shoulder angle (hip-shoulder-elbow) in degrees."""
    return _angle_3points(hip, shoulder, elbow)

def compute_knee_bend(hip: np.ndarray, knee: np.ndarray, ankle: np.ndarray) -> float:
    """Compute knee bend angle (hip-knee-ankle) in degrees."""
    return _angle_3points(hip, knee, ankle)

def compute_trunk_lean(shoulder_mid: np.ndarray, hip_mid: np.ndarray) -> float:
    """Compute trunk lean angle from vertical in degrees."""
    trunk_vec = shoulder_mid - hip_mid
    vertical = np.array([0.0, -1.0, 0.0])
    cosine = np.dot(trunk_vec, vertical) / (np.linalg.norm(trunk_vec) + 1e-8)
    cosine = np.clip(cosine, -1.0, 1.0)
    return float(math.degrees(math.acos(cosine)))

class JointAngleComputer:
    """Batch joint angle computation from MediaPipe landmarks."""
    @staticmethod
    def angle_between_points(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
        """Compute angle at point b given points a, b, c in degrees."""
        return _angle_3points(a, b, c)

    def compute_all_angles(self, landmarks: np.ndarray) -> dict[str, float]:
        """Compute all 10 tracked joint angles from (33,4) landmarks."""
        angles: dict[str, float] = {}
        for name, (i, j, k) in JOINT_TRIPLETS.items():
            angles[name] = _angle_3points(landmarks[i, :3], landmarks[j, :3], landmarks[k, :3])
        return angles

    def compute_angle_sequence(self, keypoints_sequence: list[np.ndarray | None]) -> list[dict[str, float] | None]:
        """Compute angles for a sequence of frames."""
        return [self.compute_all_angles(kps) if kps is not None else None for kps in keypoints_sequence]

    @staticmethod
    def wrist_velocity(landmarks_prev: np.ndarray, landmarks_curr: np.ndarray, fps: float = 60.0, side: str = "right") -> float:
        """Compute wrist velocity between two consecutive frames."""
        idx = 16 if side == "right" else 15
        return float(np.linalg.norm(landmarks_curr[idx, :3] - landmarks_prev[idx, :3]) * fps)

if __name__ == "__main__":
    print("Joint Angle Demo")
    s, e, w = np.array([0.4,0.4,0.0]), np.array([0.4,0.6,0.0]), np.array([0.5,0.7,0.0])
    print(f"Elbow angle: {compute_elbow_angle(s, e, w):.1f}deg")
    h = np.array([0.4,0.7,0.0])
    print(f"Shoulder angle: {compute_shoulder_angle(h, s, e):.1f}deg")
    k, a = np.array([0.4,0.85,0.0]), np.array([0.4,1.0,0.0])
    print(f"Knee bend: {compute_knee_bend(h, k, a):.1f}deg")
    sm, hm = np.array([0.5,0.4,0.0]), np.array([0.5,0.7,0.0])
    print(f"Trunk lean: {compute_trunk_lean(sm, hm):.1f}deg")
    landmarks = np.random.rand(33, 4)
    for name, angle in JointAngleComputer().compute_all_angles(landmarks).items():
        print(f"  {name}: {angle:.1f}deg")
