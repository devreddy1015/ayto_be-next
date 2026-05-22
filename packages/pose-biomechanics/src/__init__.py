"""SportIQ Pose Biomechanics — Keypoint extraction, normalization, angles, stroke events."""

from .angles import (
    IDEAL_ANGLES_BY_STROKE,
    JOINT_ROM_LIMITS,
    JointAngleComputer,
    compute_elbow_angle,
    compute_knee_bend,
    compute_shoulder_angle,
    compute_stroke_quality_score,
    compute_trunk_lean,
    validate_angles,
)
from .keypoints import PoseExtractor
from .normalize import (
    PoseNormalizer,
    normalize_and_smooth,
    normalize_keypoints,
    normalize_sequence,
    smooth_sequence,
)
from .stroke_events import StrokeDetector, StrokeEvent

__all__ = [
    "PoseExtractor",
    "PoseNormalizer",
    "normalize_keypoints",
    "normalize_sequence",
    "normalize_and_smooth",
    "smooth_sequence",
    "JointAngleComputer",
    "compute_elbow_angle",
    "compute_shoulder_angle",
    "compute_knee_bend",
    "compute_trunk_lean",
    "validate_angles",
    "compute_stroke_quality_score",
    "JOINT_ROM_LIMITS",
    "IDEAL_ANGLES_BY_STROKE",
    "StrokeDetector",
    "StrokeEvent",
]
