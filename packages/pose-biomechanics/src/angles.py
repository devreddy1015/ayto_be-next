"""Joint angle computation and biomechanical analysis for badminton.

All range-of-motion (ROM) limits and ideal stroke angles are derived from
peer-reviewed sports science literature:

    * Morrey 1998          — elbow ROM
    * Rambely et al. 2005  — badminton smash mechanics
    * Kwan et al. 2011     — elite vs sub-elite kinematics
    * Phomsoupha & Lam 2015 — comprehensive review
    * Teu et al. 2006      — 3-D kinematic analysis
    * Kuntze et al. 2010   — knee biomechanics in racket sports
    * Escamilla 2001       — hip flexion norms
    * Palmer 1985          — wrist ROM
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

# ---------------------------------------------------------------------------
# MediaPipe landmark triplets for the 10 tracked joint angles
# ---------------------------------------------------------------------------
JOINT_TRIPLETS = {
    "left_elbow": (11, 13, 15), "right_elbow": (12, 14, 16),
    "left_shoulder": (13, 11, 23), "right_shoulder": (14, 12, 24),
    "left_hip": (11, 23, 25), "right_hip": (12, 24, 26),
    "left_knee": (23, 25, 27), "right_knee": (24, 26, 28),
    "left_wrist": (13, 15, 19), "right_wrist": (14, 16, 20),
}

# ---------------------------------------------------------------------------
# Physiological ROM limits (degrees) — values outside these are noise
# ---------------------------------------------------------------------------
JOINT_ROM_LIMITS: dict[str, tuple[float, float]] = {
    "right_elbow":    (0.0, 150.0),    # Full extension → max flexion (Morrey 1998)
    "left_elbow":     (0.0, 150.0),
    "right_shoulder": (0.0, 180.0),    # Overhead reach in smash (Rambely et al. 2005)
    "left_shoulder":  (0.0, 180.0),
    "right_knee":     (0.0, 140.0),    # Full extension → deep lunge (Kuntze et al. 2010)
    "left_knee":      (0.0, 140.0),
    "right_hip":      (0.0, 125.0),    # Hip flexion in lunge (Escamilla 2001)
    "left_hip":       (0.0, 125.0),
    "right_wrist":    (0.0, 85.0),     # Wrist flex/ext (Palmer 1985)
    "left_wrist":     (0.0, 85.0),
}

# ---------------------------------------------------------------------------
# Stroke-specific ideal angle ranges from pro player analysis
# ---------------------------------------------------------------------------
IDEAL_ANGLES_BY_STROKE: dict[str, dict[str, tuple[float, float]]] = {
    "smash": {
        "right_shoulder": (155.0, 180.0),  # Near-full overhead extension at contact
        "right_elbow":    (145.0, 170.0),  # Extended arm at contact (Rambely 2005)
        "right_knee":     (100.0, 140.0),  # Slight bend for jump
        "left_knee":      (100.0, 140.0),
    },
    "clear": {
        "right_shoulder": (140.0, 175.0),  # High but not maximal
        "right_elbow":    (130.0, 160.0),  # Slightly more bent than smash
        "right_knee":     (110.0, 150.0),  # Standing position
    },
    "drop": {
        "right_shoulder": (120.0, 160.0),  # Lower contact point
        "right_elbow":    (100.0, 140.0),  # More wrist action, less arm
        "right_wrist":    (30.0, 70.0),    # Deceptive wrist snap
    },
    "net": {
        "right_shoulder": (40.0, 100.0),   # Low, forward reach
        "right_elbow":    (90.0, 140.0),   # Moderate extension
        "right_knee":     (70.0, 120.0),   # Deep lunge position
    },
    "serve": {
        "right_shoulder": (60.0, 120.0),   # Contact below waist (BWF rule)
        "right_elbow":    (100.0, 150.0),  # Moderate extension
        "right_wrist":    (20.0, 60.0),    # Wrist snap for deception
    },
    "defensive": {
        "right_shoulder": (30.0, 130.0),   # Wide range (scramble)
        "right_elbow":    (80.0, 150.0),   # Variable
        "right_knee":     (60.0, 130.0),   # Often deep knee bend
    },
}

# Weights for biomechanical similarity scoring.
# Contact-critical joints (elbow, shoulder) are weighted 3× because
# they are the primary determinants of shot type and power.
JOINT_IMPORTANCE_WEIGHTS: dict[str, float] = {
    "right_elbow":    3.0,
    "left_elbow":     3.0,
    "right_shoulder": 3.0,
    "left_shoulder":  3.0,
    "right_wrist":    2.0,
    "left_wrist":     2.0,
    "right_knee":     1.0,
    "left_knee":      1.0,
    "right_hip":      1.0,
    "left_hip":       1.0,
}


# ---------------------------------------------------------------------------
# Core geometry
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Validation & scoring
# ---------------------------------------------------------------------------

def validate_angles(angles: dict[str, float]) -> dict[str, bool]:
    """Check whether each angle falls within physiological ROM limits.

    Returns:
        Dict mapping joint name → True if within valid ROM, False if the
        value is likely sensor noise.
    """
    result: dict[str, bool] = {}
    for name, value in angles.items():
        lo, hi = JOINT_ROM_LIMITS.get(name, (0.0, 180.0))
        result[name] = lo <= value <= hi
    return result


def compute_stroke_quality_score(
    player_angles: dict[str, float],
    stroke_type: str,
) -> dict[str, Any]:
    """Score a player's stroke form against ideal pro-level angles.

    Args:
        player_angles: Measured joint angles for the stroke.
        stroke_type: One of the six stroke classes.

    Returns:
        Dict with:
            overall_score: float in [0, 1]
            per_joint: dict mapping joint → individual score in [0, 1]
            feedback: list of actionable coaching tips
    """
    ideal = IDEAL_ANGLES_BY_STROKE.get(stroke_type, {})
    if not ideal:
        return {"overall_score": 0.0, "per_joint": {}, "feedback": ["Unknown stroke type"]}

    per_joint: dict[str, float] = {}
    weighted_sum = 0.0
    total_weight = 0.0
    feedback: list[str] = []

    for joint_name, (lo, hi) in ideal.items():
        measured = player_angles.get(joint_name)
        if measured is None:
            continue

        weight = JOINT_IMPORTANCE_WEIGHTS.get(joint_name, 1.0)
        mid = (lo + hi) / 2.0
        half_range = (hi - lo) / 2.0

        if lo <= measured <= hi:
            # Within ideal range — score based on distance from centre
            deviation = abs(measured - mid) / half_range
            score = 1.0 - 0.3 * deviation   # 1.0 at centre, 0.7 at edge
        else:
            # Outside ideal range — score falls off quickly
            overshoot = min(abs(measured - lo), abs(measured - hi))
            score = max(0.0, 0.7 - overshoot / 90.0)

            direction = "more" if measured > hi else "less"
            feedback.append(
                f"{joint_name}: {overshoot:.0f}° outside ideal range — "
                f"try {direction} extension (you: {measured:.0f}°, "
                f"ideal: {lo:.0f}–{hi:.0f}°)"
            )

        per_joint[joint_name] = round(score, 3)
        weighted_sum += score * weight
        total_weight += weight

    overall = weighted_sum / total_weight if total_weight > 0 else 0.0

    return {
        "overall_score": round(overall, 3),
        "per_joint": per_joint,
        "feedback": feedback,
    }


# ---------------------------------------------------------------------------
# JointAngleComputer class
# ---------------------------------------------------------------------------

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

    def compute_all_angles_validated(self, landmarks: np.ndarray) -> dict[str, float]:
        """Compute angles and clamp to physiological ROM limits.

        Values outside ROM are clamped rather than rejected so that
        downstream consumers always receive a valid angle.
        """
        raw = self.compute_all_angles(landmarks)
        clamped: dict[str, float] = {}
        for name, value in raw.items():
            lo, hi = JOINT_ROM_LIMITS.get(name, (0.0, 180.0))
            clamped[name] = float(np.clip(value, lo, hi))
        return clamped

    def compute_angle_sequence(
        self,
        keypoints_sequence: list[np.ndarray | None],
    ) -> list[dict[str, float] | None]:
        """Compute angles for a sequence of frames."""
        return [
            self.compute_all_angles(kps) if kps is not None else None
            for kps in keypoints_sequence
        ]

    @staticmethod
    def wrist_velocity(
        landmarks_prev: np.ndarray,
        landmarks_curr: np.ndarray,
        fps: float = 60.0,
        side: str = "right",
    ) -> float:
        """Compute wrist velocity between two consecutive frames."""
        idx = 16 if side == "right" else 15
        return float(np.linalg.norm(landmarks_curr[idx, :3] - landmarks_prev[idx, :3]) * fps)
