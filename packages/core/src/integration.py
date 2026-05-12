from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from schemas import COMPARABLE_JOINTS, PoseFrame, ProComparison, ShuttleFrame, StrokeEvent


def merge_pipeline_outputs(
    cv_results: list[Any],
    keypoints_sequence: list[np.ndarray | None],
    angle_sequence: list[dict[str, float] | None],
    stroke_events: list[Any],
    comparisons: list[ProComparison],
    fps: float = 60.0,
) -> tuple[list[tuple], list[tuple], list[Any], list[ProComparison]]:
    max_len = max(len(cv_results), len(keypoints_sequence), len(angle_sequence))
    frames: list[tuple[ShuttleFrame, PoseFrame]] = []

    for i in range(max_len):
        timestamp = i / fps

        shuttle = ShuttleFrame(detected=False)
        if i < len(cv_results):
            r = cv_results[i]
            if r and hasattr(r, "shuttle_detected") and r.shuttle_detected:
                shuttle = ShuttleFrame(
                    detected=True,
                    x=r.tracked_position[0] if r.tracked_position else None,
                    y=r.tracked_position[1] if r.tracked_position else None,
                    speed_kmh=r.speed_kmh,
                    confidence=r.confidence,
                )

        pose = PoseFrame(detected=False)
        if i < len(keypoints_sequence) and keypoints_sequence[i] is not None:
            pose.detected = True
            pose.keypoints = keypoints_sequence[i].tolist()

            if i < len(angle_sequence) and angle_sequence[i] is not None:
                a = angle_sequence[i]
                pose.left_elbow = a.get("left_elbow")
                pose.right_elbow = a.get("right_elbow")
                pose.left_shoulder = a.get("left_shoulder")
                pose.right_shoulder = a.get("right_shoulder")
                pose.left_knee = a.get("left_knee")
                pose.right_knee = a.get("right_knee")

            if i > 0 and i < len(keypoints_sequence):
                prev_kps = keypoints_sequence[i - 1]
                curr_kps = keypoints_sequence[i]
                if prev_kps is not None and curr_kps is not None:
                    left_wrist = np.linalg.norm(curr_kps[15, :3] - prev_kps[15, :3]) * fps
                    right_wrist = np.linalg.norm(curr_kps[16, :3] - prev_kps[16, :3]) * fps
                    pose.left_wrist_velocity = float(left_wrist)
                    pose.right_wrist_velocity = float(right_wrist)

        frames.append((shuttle, pose))

    strokes_mapped: list[StrokeEvent] = []
    for ev in stroke_events:
        speed_val = None
        if ev.frame_peak < len(cv_results):
            r = cv_results[ev.frame_peak]
            if r and hasattr(r, "speed_kmh"):
                speed_val = r.speed_kmh

        strokes_mapped.append(
            StrokeEvent(
                stroke_type=getattr(ev, "stroke_label", "unknown"),
                confidence=getattr(ev, "confidence", 0.0),
                frame_start=ev.frame_start,
                frame_peak=ev.frame_peak,
                frame_end=ev.frame_end,
                peak_wrist_velocity=ev.peak_wrist_velocity,
                peak_elbow_angle=ev.peak_elbow_angle,
                speed_at_peak_kmh=speed_val,
                side=ev.side,
            )
        )

    return frames, strokes_mapped, comparisons


def generate_mock_comparison(
    player_angles: dict[str, float],
    pro_name: str = "Viktor Axelsen",
    stroke_type: str = "smash",
) -> ProComparison:
    PRO_ANGLES = {
        "smash": {
            "left_elbow": 165.0, "right_elbow": 168.0,
            "left_shoulder": 145.0, "right_shoulder": 150.0,
            "left_knee": 135.0, "right_knee": 140.0,
            "left_wrist": 170.0, "right_wrist": 172.0,
        },
        "clear": {
            "left_elbow": 155.0, "right_elbow": 158.0,
            "left_shoulder": 140.0, "right_shoulder": 145.0,
            "left_knee": 140.0, "right_knee": 145.0,
            "left_wrist": 165.0, "right_wrist": 168.0,
        },
    }

    pro = PRO_ANGLES.get(stroke_type, PRO_ANGLES["smash"])
    common = set(player_angles.keys()) & set(pro.keys())
    differences: dict[str, float] = {}
    total_diff = 0.0

    for j in common:
        diff = abs(player_angles[j] - pro[j])
        differences[j] = diff
        total_diff += diff

    avg_diff = total_diff / len(common) if common else 0.0
    similarity = max(0.0, 1.0 - avg_diff / 180.0)

    feedback: list[str] = []
    sorted_diffs = sorted(differences.items(), key=lambda x: x[1], reverse=True)
    for joint, diff_val in sorted_diffs[:3]:
        if diff_val > 10:
            direction = "more" if player_angles[joint] > pro[joint] else "less"
            feedback.append(
                f"{joint.replace('_', ' ').title()}: {diff_val:.0f}° off — "
                f"{direction} extended ({player_angles[joint]:.0f}° vs pro {pro[joint]:.0f}°)"
            )

    return ProComparison(
        pro_name=pro_name,
        stroke_type=stroke_type,
        player_angles={j: player_angles[j] for j in common},
        pro_angles={j: pro[j] for j in common},
        differences=differences,
        similarity_score=similarity,
        feedback=feedback,
    )
