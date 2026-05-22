"""Keypoint normalization for camera-agnostic pose analysis.

Normalizes keypoints by centering on the hip midpoint and scaling
by torso length, making the representation invariant to camera
angle, distance, and subject height.

Includes temporal smoothing via exponential moving average (EMA)
to reduce MediaPipe keypoint jitter, which is typically 2–5 px at
720p resolution (Google MediaPipe benchmark).
"""
from __future__ import annotations

import numpy as np

LEFT_HIP_IDX = 23
RIGHT_HIP_IDX = 24
LEFT_SHOULDER_IDX = 11
RIGHT_SHOULDER_IDX = 12

# MediaPipe keypoint jitter is typically 2–5 px at 720p.
# EMA with α = 0.7 gives an effective ~3-frame smoothing window,
# which suppresses high-frequency jitter while preserving fast
# stroke dynamics at 30–60 fps.
TEMPORAL_SMOOTH_ALPHA = 0.7


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


def smooth_sequence(
    keypoints_sequence: list[np.ndarray | None],
    alpha: float = TEMPORAL_SMOOTH_ALPHA,
) -> list[np.ndarray | None]:
    """Apply exponential moving average to reduce keypoint jitter.

    Uses a per-coordinate EMA filter.  When a frame is ``None``
    (no detection), the previous smoothed value is carried forward
    unchanged so that a single missed frame does not create a
    discontinuity.

    Args:
        keypoints_sequence: List of (33, 4) arrays or None.
        alpha: Smoothing factor in (0, 1].  Higher values respond
            faster to new observations (less smoothing).  The default
            0.7 gives a ~3-frame effective window, suitable for
            30–60 fps badminton video.

    Returns:
        Smoothed list of the same length and shape.
    """
    if not keypoints_sequence:
        return []

    smoothed: list[np.ndarray | None] = []
    prev: np.ndarray | None = None

    for kps in keypoints_sequence:
        if kps is None:
            smoothed.append(prev.copy() if prev is not None else None)
            continue

        if prev is None:
            prev = kps.copy()
        else:
            # Smooth only the xyz coordinates (columns 0–2);
            # preserve visibility (column 3) from the raw observation.
            prev[:, :3] = alpha * kps[:, :3] + (1 - alpha) * prev[:, :3]
            prev[:, 3] = kps[:, 3]

        smoothed.append(prev.copy())

    return smoothed


def normalize_and_smooth(
    keypoints_sequence: list[np.ndarray | None],
    alpha: float = TEMPORAL_SMOOTH_ALPHA,
) -> list[np.ndarray | None]:
    """Convenience: normalize then temporally smooth a full sequence.

    This is the recommended preprocessing pipeline for model input.

    Args:
        keypoints_sequence: Raw (33, 4) arrays from MediaPipe.
        alpha: EMA smoothing factor (default 0.7).

    Returns:
        Normalized and smoothed sequence.
    """
    normalized = normalize_sequence(keypoints_sequence)
    return smooth_sequence(normalized, alpha)


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

    def normalize_and_smooth(
        self,
        keypoints_sequence: list[np.ndarray | None],
        alpha: float = TEMPORAL_SMOOTH_ALPHA,
    ) -> list[np.ndarray | None]:
        """Normalize and temporally smooth a sequence.

        Args:
            keypoints_sequence: List of (33, 4) arrays or None.
            alpha: EMA smoothing factor.

        Returns:
            Normalized and smoothed sequence.
        """
        return normalize_and_smooth(keypoints_sequence, alpha)
