from __future__ import annotations

import numpy as np


class PoseNormalizer:
    LEFT_HIP_IDX = 23
    RIGHT_HIP_IDX = 24
    LEFT_SHOULDER_IDX = 11
    RIGHT_SHOULDER_IDX = 12

    def normalize(self, landmarks: np.ndarray) -> np.ndarray:
        coords = landmarks[:, :3].copy()

        hip_mid = (coords[self.LEFT_HIP_IDX] + coords[self.RIGHT_HIP_IDX]) / 2
        coords -= hip_mid

        shoulder_mid = (coords[self.LEFT_SHOULDER_IDX] + coords[self.RIGHT_SHOULDER_IDX]) / 2
        torso_length = np.linalg.norm(shoulder_mid)
        if torso_length > 1e-6:
            coords /= torso_length

        normalized = landmarks.copy()
        normalized[:, :3] = coords
        return normalized

    def normalize_sequence(
        self, keypoints_sequence: list[np.ndarray | None]
    ) -> list[np.ndarray | None]:
        results: list[np.ndarray | None] = []
        for kps in keypoints_sequence:
            if kps is None:
                results.append(None)
            else:
                results.append(self.normalize(kps))
        return results
