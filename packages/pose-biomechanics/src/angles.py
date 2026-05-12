from __future__ import annotations

import math

import numpy as np


JOINT_TRIPLETS = {
    "left_elbow": (11, 13, 15),
    "right_elbow": (12, 14, 16),
    "left_shoulder": (13, 11, 23),
    "right_shoulder": (14, 12, 24),
    "left_hip": (11, 23, 25),
    "right_hip": (12, 24, 26),
    "left_knee": (23, 25, 27),
    "right_knee": (24, 26, 28),
    "left_wrist": (13, 15, 19),
    "right_wrist": (14, 16, 20),
}


class JointAngleComputer:
    @staticmethod
    def angle_between_points(
        a: np.ndarray, b: np.ndarray, c: np.ndarray
    ) -> float:
        ba = a - b
        bc = c - b
        cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
        cosine = np.clip(cosine, -1.0, 1.0)
        return float(math.degrees(math.acos(cosine)))

    def compute_all_angles(self, landmarks: np.ndarray) -> dict[str, float]:
        angles: dict[str, float] = {}
        for name, (i, j, k) in JOINT_TRIPLETS.items():
            a = landmarks[i, :3]
            b = landmarks[j, :3]
            c = landmarks[k, :3]
            angles[name] = self.angle_between_points(a, b, c)
        return angles

    def compute_angle_sequence(
        self, keypoints_sequence: list[np.ndarray | None]
    ) -> list[dict[str, float] | None]:
        results: list[dict[str, float] | None] = []
        for kps in keypoints_sequence:
            if kps is None:
                results.append(None)
            else:
                results.append(self.compute_all_angles(kps))
        return results

    @staticmethod
    def wrist_velocity(
        landmarks_prev: np.ndarray,
        landmarks_curr: np.ndarray,
        fps: float = 60.0,
        side: str = "right",
    ) -> float:
        idx = 16 if side == "right" else 15
        prev = landmarks_prev[idx, :3]
        curr = landmarks_curr[idx, :3]
        displacement = np.linalg.norm(curr - prev)
        return float(displacement * fps)
