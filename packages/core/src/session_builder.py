from __future__ import annotations

from collections import Counter

from schemas import (
    STROKE_LABELS,
    FrameData,
    PoseFrame,
    ProComparison,
    SessionMetrics,
    SessionOutput,
    ShuttleFrame,
    StrokeEvent,
)


class SessionBuilder:
    def __init__(self, sport: str = "badminton", fps: float = 60.0) -> None:
        self.sport = sport
        self.fps = fps
        self.output = SessionOutput(sport=sport, fps=fps)

    def add_frame(
        self,
        frame_idx: int,
        timestamp_s: float,
        shuttle: ShuttleFrame | None = None,
        pose: PoseFrame | None = None,
    ) -> None:
        self.output.frames.append(
            FrameData(
                frame_idx=frame_idx,
                timestamp_s=timestamp_s,
                shuttle=shuttle,
                pose=pose,
            )
        )

    def add_stroke_event(self, event: StrokeEvent) -> None:
        self.output.strokes.append(event)

    def add_comparison(self, comparison: ProComparison) -> None:
        self.output.comparisons.append(comparison)

    def compute_metrics(self) -> SessionMetrics:
        frames = self.output.frames

        total = len(frames)
        detected = sum(1 for f in frames if f.shuttle and f.shuttle.detected)
        speeds = [
            f.shuttle.speed_kmh
            for f in frames
            if f.shuttle and f.shuttle.speed_kmh is not None and f.shuttle.speed_kmh > 0
        ]

        stroke_counts: dict[str, int] = {label: 0 for label in STROKE_LABELS}
        for s in self.output.strokes:
            if s.stroke_type in stroke_counts:
                stroke_counts[s.stroke_type] += 1

        detection_rate = (detected / total) if total > 0 else 0.0
        form_score = self._compute_form_score(frames)

        metrics = SessionMetrics(
            duration_s=frames[-1].timestamp_s if frames else 0.0,
            total_frames=total,
            detected_frames=detected,
            detection_rate=detection_rate,
            max_speed_kmh=max(speeds) if speeds else 0.0,
            avg_speed_kmh=sum(speeds) / len(speeds) if speeds else 0.0,
            min_speed_kmh=min(speeds) if speeds else 0.0,
            stroke_counts=stroke_counts,
            form_score=form_score,
        )
        self.output.metrics = metrics
        self.output.duration_s = metrics.duration_s
        return metrics

    def generate_drills(self) -> list[str]:
        drills: list[str] = []
        comparisons = self.output.comparisons
        strokes = self.output.strokes

        if comparisons:
            for comp in comparisons[:2]:
                worst_joints = sorted(
                    comp.differences.items(),
                    key=lambda x: x[1],
                    reverse=True,
                )[:2]
                for joint_name, diff in worst_joints:
                    direction = "more extended" if diff > 0 else "less extended"
                    drills.append(
                        f"{comp.stroke_type.title()} {joint_name.replace('_', ' ')}: "
                        f"{diff:.0f}° off vs {comp.pro_name} — your angle is {direction}"
                    )

        if strokes:
            stroke_counter = Counter(s.stroke_type for s in strokes)
            most_common = stroke_counter.most_common(1)
            if most_common:
                top_stroke = most_common[0][0]
                drills.append(
                    f"Increase {top_stroke} accuracy — focus on consistent "
                    f"follow-through and wrist snap timing"
                )

            smash_events = [s for s in strokes if s.stroke_type == "smash"]
            if smash_events:
                avg_elbow = sum(
                    s.peak_elbow_angle for s in smash_events if s.peak_elbow_angle
                )
                count = sum(1 for s in smash_events if s.peak_elbow_angle)
                if count > 0:
                    avg_elbow /= count
                    if avg_elbow < 150:
                        drills.append(
                            f"Smash elbow angle avg {avg_elbow:.0f}° — too low. "
                            f"Practice overhead extension to reach 160-170°"
                        )

        if len(drills) < 3:
            drills.extend([
                "Split-step timing: land as opponent strikes for 0.2s faster reactions",
                "Net play: practice tight spinning net shots from 3 positions",
            ])

        self.output.drills = drills[:5]
        return drills

    def build(self) -> SessionOutput:
        self.compute_metrics()
        self.generate_drills()
        return self.output

    @staticmethod
    def _compute_form_score(frames: list[FrameData]) -> float:
        pose_frames = [f.pose for f in frames if f.pose and f.pose.detected]
        if not pose_frames:
            return 0.0

        angles_available = sum(
            1
            for pf in pose_frames
            if pf.left_elbow and pf.right_elbow and pf.left_knee and pf.right_knee
        )
        detection_pct = angles_available / len(pose_frames) if pose_frames else 0.0

        elbow_values = [
            pf.left_elbow
            for pf in pose_frames
            if pf.left_elbow and 30 < pf.left_elbow < 180
        ]
        knee_values = [
            pf.left_knee
            for pf in pose_frames
            if pf.left_knee and 30 < pf.left_knee < 180
        ]

        angle_stability = 1.0
        if len(elbow_values) > 5:
            import numpy as np
            angle_stability = max(0.0, 1.0 - float(np.std(elbow_values)) / 60.0)

        base = detection_pct * 60 + angle_stability * 40
        return min(100.0, max(0.0, base))
