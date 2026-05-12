from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass
class ComparisonResult:
    player_angles: dict[str, float]
    pro_angles: dict[str, float]
    differences: dict[str, float]
    similarity_score: float
    feedback: list[str]


class ProComparisonEngine:
    def __init__(self, pro_db_path: str | Path | None = None) -> None:
        self.pro_profiles: dict[str, dict[str, Any]] = {}
        if pro_db_path and Path(pro_db_path).exists():
            self._load_db(pro_db_path)

    def _load_db(self, path: str | Path) -> None:
        with open(path) as f:
            self.pro_profiles = json.load(f)

    def add_pro_profile(
        self,
        name: str,
        stroke_type: str,
        avg_angles: dict[str, float],
        avg_wrist_velocity: float,
    ) -> None:
        key = f"{name}_{stroke_type}"
        self.pro_profiles[key] = {
            "name": name,
            "stroke_type": stroke_type,
            "avg_angles": avg_angles,
            "avg_wrist_velocity": avg_wrist_velocity,
        }

    def compare(
        self,
        player_angles: dict[str, float],
        pro_name: str,
        stroke_type: str,
    ) -> ComparisonResult | None:
        key = f"{pro_name}_{stroke_type}"
        profile = self.pro_profiles.get(key)
        if profile is None:
            return None

        pro_angles = profile["avg_angles"]
        common_joints = set(player_angles.keys()) & set(pro_angles.keys())
        if not common_joints:
            return None

        differences: dict[str, float] = {}
        total_diff = 0.0
        for joint in common_joints:
            diff = abs(player_angles[joint] - pro_angles[joint])
            differences[joint] = diff
            total_diff += diff

        avg_diff = total_diff / len(common_joints)
        similarity = max(0.0, 1.0 - avg_diff / 180.0)

        feedback = self._generate_feedback(differences, pro_angles, player_angles)

        return ComparisonResult(
            player_angles=player_angles,
            pro_angles={j: pro_angles[j] for j in common_joints},
            differences=differences,
            similarity_score=similarity,
            feedback=feedback,
        )

    @staticmethod
    def _generate_feedback(
        differences: dict[str, float],
        pro_angles: dict[str, float],
        player_angles: dict[str, float],
    ) -> list[str]:
        feedback: list[str] = []
        sorted_diffs = sorted(differences.items(), key=lambda x: x[1], reverse=True)

        for joint, diff in sorted_diffs[:3]:
            if diff > 15:
                direction = "more" if player_angles[joint] > pro_angles[joint] else "less"
                feedback.append(
                    f"{joint}: {diff:.1f}deg off — your angle is {direction} "
                    f"extended ({player_angles[joint]:.1f} vs pro {pro_angles[joint]:.1f})"
                )
        return feedback

    def save_db(self, path: str | Path) -> None:
        with open(path, "w") as f:
            json.dump(self.pro_profiles, f, indent=2)
