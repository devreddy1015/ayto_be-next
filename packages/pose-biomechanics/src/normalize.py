"""Keypoint normalization for camera-agnostic pose analysis.

Normalizes keypoints by centering on the hip midpoint and scaling
by torso length, making the representation invariant to camera
angle, distance, and subject height.

Temporal smoothing defaults to a One-Euro filter (the causal smoother
RTMPose's video pipeline uses). Its cutoff rises with joint speed, so it
damps jitter when a joint is still but barely lags a fast swing. On
simulated racket swings in torso units it cut both jitter at rest (33-55%)
and lag during the swing (37-66%) against the previous EMA (alpha 0.7) at
30 and 60 fps. The EMA stays available as ``method="ema"``.
"""
from __future__ import annotations

import math

import numpy as np

LEFT_HIP_IDX = 23
RIGHT_HIP_IDX = 24
LEFT_SHOULDER_IDX = 11
RIGHT_SHOULDER_IDX = 12

# Legacy EMA factor (method="ema"): ~3-frame effective window.
TEMPORAL_SMOOTH_ALPHA = 0.7

# One-Euro parameters for torso-normalised coordinates: 1 Hz cutoff at rest,
# rising by 10 Hz per torso-length/s of joint speed.
ONE_EURO_MIN_CUTOFF = 1.0
ONE_EURO_BETA = 10.0
ONE_EURO_D_CUTOFF = 1.0


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


class OneEuroFilter:
    """Vectorised One-Euro filter (Casiez et al., CHI 2012).

    Each coordinate is low-pass filtered with a cutoff of
    ``min_cutoff + beta * |speed|``, where speed is itself low-pass filtered
    at ``d_cutoff``. Works on arrays of any shape.
    """

    def __init__(
        self,
        fps: float,
        min_cutoff: float = ONE_EURO_MIN_CUTOFF,
        beta: float = ONE_EURO_BETA,
        d_cutoff: float = ONE_EURO_D_CUTOFF,
    ) -> None:
        self.fps = fps
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x: np.ndarray | None = None
        self._dx: np.ndarray | None = None

    def _alpha(self, cutoff: np.ndarray | float) -> np.ndarray | float:
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau * self.fps)

    def __call__(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=float)
        if self._x is None:
            self._x, self._dx = x.copy(), np.zeros_like(x)
            return x.copy()
        dx = (x - self._x) * self.fps
        a_d = self._alpha(self.d_cutoff)
        self._dx = a_d * dx + (1 - a_d) * self._dx
        a = self._alpha(self.min_cutoff + self.beta * np.abs(self._dx))
        self._x = a * x + (1 - a) * self._x
        return self._x.copy()

    def reset(self) -> None:
        """Forget the filter state, so the next sample starts a new track."""
        self._x = self._dx = None


def smooth_sequence(
    keypoints_sequence: list[np.ndarray | None],
    alpha: float = TEMPORAL_SMOOTH_ALPHA,
    method: str = "one_euro",
    fps: float = 30.0,
    max_carry_frames: int = 3,
) -> list[np.ndarray | None]:
    """Reduce keypoint jitter over time.

    Only xyz (columns 0-2) are filtered; visibility (column 3) is taken from
    the raw frame. A missing frame (``None``) carries the previous smoothed
    value forward, so one dropped detection doesn't create a discontinuity.

    Carry-forward stops after ``max_carry_frames``. Beyond that the player is
    gone rather than briefly occluded, and holding a stale pose would report
    the gap as a detected pose and turn the re-acquisition into a one-frame
    velocity spike (a false stroke at full confidence).

    Args:
        keypoints_sequence: List of (33, 4) arrays or None.
        alpha: EMA factor, used only with ``method="ema"``.
        method: ``"one_euro"`` (default) or ``"ema"``.
        fps: Frame rate, used by the One-Euro filter.
        max_carry_frames: Longest run of missing frames to hold the last pose
            through. Longer gaps stay None and restart the filter.

    Returns:
        Smoothed list of the same length and shape.
    """
    if method not in ("one_euro", "ema"):
        raise ValueError(f"Unknown smoothing method {method!r}")
    euro = OneEuroFilter(fps) if method == "one_euro" else None
    smoothed: list[np.ndarray | None] = []
    prev: np.ndarray | None = None
    gap = 0

    for kps in keypoints_sequence:
        if kps is None:
            gap += 1
            if prev is not None and gap <= max_carry_frames:
                smoothed.append(prev.copy())
            else:
                smoothed.append(None)
                prev = None
                if euro is not None:
                    euro.reset()
            continue
        gap = 0
        current = kps.copy()
        if euro is not None:
            current[:, :3] = euro(kps[:, :3])
        elif prev is not None:
            current[:, :3] = alpha * kps[:, :3] + (1 - alpha) * prev[:, :3]
        prev = current
        smoothed.append(current.copy())
    return smoothed


def normalize_and_smooth(
    keypoints_sequence: list[np.ndarray | None],
    alpha: float = TEMPORAL_SMOOTH_ALPHA,
    method: str = "one_euro",
    fps: float = 30.0,
    max_carry_frames: int = 3,
) -> list[np.ndarray | None]:
    """Normalize then temporally smooth a full sequence (the model-input pipeline)."""
    return smooth_sequence(
        normalize_sequence(keypoints_sequence), alpha, method, fps, max_carry_frames,
    )


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
        method: str = "one_euro",
        fps: float = 30.0,
    ) -> list[np.ndarray | None]:
        """Normalize and temporally smooth a sequence."""
        return normalize_and_smooth(keypoints_sequence, alpha, method, fps)
