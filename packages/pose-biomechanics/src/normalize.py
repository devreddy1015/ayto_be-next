"""Keypoint normalization for camera-agnostic pose analysis.

Normalizes keypoints by centering on the hip midpoint and scaling
by torso length, making the representation invariant to camera
angle, distance, and subject height.
"""
from __future__ import annotations

import numpy as np


LEFT_HIP_IDX = 23
RIGHT_HIP_IDX = 24
LEFT_SHOULDER_IDX = 11
RIGHT_SHOULDER_IDX = 12


def normalize_keypoints(frame_keypoints: np.ndarray) -> np.ndarray:
    """Normalize a single frame's keypoints to be camera-angle and height agnostic.

    Normalization steps:
        1. Subtract hip midpoint (sets hips as origin).
        2. Divide all coordinates by torso length (shoulder_mid to hip_mid).

    Args:
        frame_keypoints: Array of shape (33, 4) with [x, y, z, visibility].

    Returns:
        Normalized array of same shape (33, 4), with coordinates centered
        on hip midpoint and scaled by torso length. Visibility is preserved.
    """
    coords = frame_keypoints[:, :3].copy()

    hip_mid = (coords[LEFT_HIP_IDX] + coords[RIGHT_HIP_IDX]) / 2
    coords -= hip_mid

    shoulder_mid = (coords[LEFT_SHOULDER_IDX] + coords[RIGHT_SHOULDER_IDX]) / 2
    torso_length = float(np.linalg.norm(shoulder_mid))
    if torso_length > 1e-6:
        coords /= torso_length

    normalized = frame_keypoints.copy()
    normalized[:, :3] = coords
    return normalized


def normalize_sequence(
    keypoints_sequence: list[np.ndarray | None],
) -> list[np.ndarray | None]:
    """Normalize a sequence of keypoint frames.

    Args:
        keypoints_sequence: List of (33, 4) arrays or None for missing frames.

    Returns:
        List of normalized arrays (or None for missing frames).
    """
    results: list[np.ndarray | None] = []
    for kps in keypoints_sequence:
        if kps is None:
            results.append(None)
        else:
            results.append(normalize_keypoints(kps))
    return results


class PoseNormalizer:
    """Stateful wrapper around normalize_keypoints for backward compatibility.

    Attributes:
        LEFT_HIP_IDX: MediaPipe index for left hip.
        RIGHT_HIP_IDX: MediaPipe index for right hip.
        LEFT_SHOULDER_IDX: MediaPipe index for left shoulder.
        RIGHT_SHOULDER_IDX: MediaPipe index for right shoulder.
    """

    LEFT_HIP_IDX = LEFT_HIP_IDX
    RIGHT_HIP_IDX = RIGHT_HIP_IDX
    LEFT_SHOULDER_IDX = LEFT_SHOULDER_IDX
    RIGHT_SHOULDER_IDX = RIGHT_SHOULDER_IDX

    def normalize(self, landmarks: np.ndarray) -> np.ndarray:
        """Normalize a single frame's landmarks.

        Args:
            landmarks: Array of shape (33, 4).

        Returns:
            Normalized array of shape (33, 4).
        """
        return normalize_keypoints(landmarks)

    def normalize_sequence(
        self, keypoints_sequence: list[np.ndarray | None]
    ) -> list[np.ndarray | None]:
        """Normalize a sequence of frames.

        Args:
            keypoints_sequence: List of (33, 4) arrays or None.

        Returns:
            List of normalized arrays or None.
        """
        return normalize_sequence(keypoints_sequence)
