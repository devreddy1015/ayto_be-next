"""SportIQ Pose Biomechanics — Keypoint extraction, normalization, angles, stroke events."""

from .angles import (
    JointAngleComputer,
    compute_elbow_angle,
    compute_knee_bend,
    compute_shoulder_angle,
    compute_trunk_lean,
)
from .keypoints import PoseExtractor
from .normalize import PoseNormalizer, normalize_keypoints, normalize_sequence
from .stroke_events import StrokeDetector, StrokeEvent

__all__ = [
    "PoseExtractor",
    "PoseNormalizer",
    "normalize_keypoints",
    "normalize_sequence",
    "JointAngleComputer",
    "compute_elbow_angle",
    "compute_shoulder_angle",
    "compute_knee_bend",
    "compute_trunk_lean",
    "StrokeDetector",
    "StrokeEvent",
]
