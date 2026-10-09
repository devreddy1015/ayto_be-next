"""SportIQ Pose Biomechanics: keypoints, normalisation, angles, hits, technique."""

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
from .keypoints import PoseExtractor, coco17_to_blazepose
from .normalize import (
    OneEuroFilter,
    PoseNormalizer,
    normalize_and_smooth,
    normalize_keypoints,
    normalize_sequence,
    smooth_sequence,
)
from .stroke_events import Hit, StrokeDetector, StrokeEvent, fuse_hits
from .technique import JointDeviation, TechniqueComparison, compare_technique, dtw_path

__all__ = [
    "PoseExtractor",
    "coco17_to_blazepose",
    "OneEuroFilter",
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
    "Hit",
    "fuse_hits",
    "compare_technique",
    "dtw_path",
    "TechniqueComparison",
    "JointDeviation",
]
