from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


STROKE_LABELS = ["smash", "drop", "clear", "net", "serve", "defensive"]

COMPARABLE_JOINTS = [
    "left_elbow", "right_elbow", "left_shoulder", "right_shoulder",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_wrist", "right_wrist",
]


@dataclass
class ShuttleFrame:
    detected: bool
    x: float | None = None
    y: float | None = None
    speed_kmh: float | None = None
    confidence: float = 0.0


@dataclass
class PoseFrame:
    detected: bool
    keypoints: list[list[float]] | None = None
    left_elbow: float | None = None
    right_elbow: float | None = None
    left_shoulder: float | None = None
    right_shoulder: float | None = None
    left_knee: float | None = None
    right_knee: float | None = None
    left_wrist_velocity: float | None = None
    right_wrist_velocity: float | None = None


@dataclass
class FrameData:
    frame_idx: int
    timestamp_s: float
    shuttle: ShuttleFrame | None = None
    pose: PoseFrame | None = None


@dataclass
class StrokeEvent:
    stroke_type: str
    confidence: float
    frame_start: int
    frame_peak: int
    frame_end: int
    peak_wrist_velocity: float | None = None
    peak_elbow_angle: float | None = None
    speed_at_peak_kmh: float | None = None
    side: str = "right"


@dataclass
class ProComparison:
    pro_name: str
    stroke_type: str
    player_angles: dict[str, float] = field(default_factory=dict)
    pro_angles: dict[str, float] = field(default_factory=dict)
    differences: dict[str, float] = field(default_factory=dict)
    similarity_score: float = 0.0
    feedback: list[str] = field(default_factory=list)


@dataclass
class SessionMetrics:
    duration_s: float = 0.0
    total_frames: int = 0
    detected_frames: int = 0
    detection_rate: float = 0.0
    max_speed_kmh: float = 0.0
    avg_speed_kmh: float = 0.0
    min_speed_kmh: float = 0.0
    stroke_counts: dict[str, int] = field(default_factory=dict)
    form_score: float = 0.0


@dataclass
class SessionOutput:
    session_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    sport: str = "badminton"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    duration_s: float = 0.0
    fps: float = 60.0
    metrics: SessionMetrics = field(default_factory=SessionMetrics)
    strokes: list[StrokeEvent] = field(default_factory=list)
    comparisons: list[ProComparison] = field(default_factory=list)
    drills: list[str] = field(default_factory=list)
    frames: list[FrameData] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        frames_out = []
        for f in self.frames:
            fd: dict[str, Any] = {"frame_idx": f.frame_idx, "timestamp_s": f.timestamp_s}
            if f.shuttle:
                fd["shuttle"] = {
                    "detected": f.shuttle.detected,
                    "x": f.shuttle.x,
                    "y": f.shuttle.y,
                    "speed_kmh": f.shuttle.speed_kmh,
                    "confidence": f.shuttle.confidence,
                }
            if f.pose:
                fd["pose"] = {
                    "detected": f.pose.detected,
                    "angles": {
                        "left_elbow": f.pose.left_elbow,
                        "right_elbow": f.pose.right_elbow,
                        "left_shoulder": f.pose.left_shoulder,
                        "right_shoulder": f.pose.right_shoulder,
                        "left_knee": f.pose.left_knee,
                        "right_knee": f.pose.right_knee,
                    },
                    "left_wrist_velocity": f.pose.left_wrist_velocity,
                    "right_wrist_velocity": f.pose.right_wrist_velocity,
                }
            frames_out.append(fd)

        return {
            "session_id": self.session_id,
            "sport": self.sport,
            "created_at": self.created_at,
            "duration_s": self.duration_s,
            "fps": self.fps,
            "metrics": {
                "duration_s": self.metrics.duration_s,
                "total_frames": self.metrics.total_frames,
                "detected_frames": self.metrics.detected_frames,
                "detection_rate": round(self.metrics.detection_rate, 4),
                "max_speed_kmh": round(self.metrics.max_speed_kmh, 1),
                "avg_speed_kmh": round(self.metrics.avg_speed_kmh, 1),
                "min_speed_kmh": round(self.metrics.min_speed_kmh, 1),
                "stroke_counts": self.metrics.stroke_counts,
                "form_score": round(self.metrics.form_score, 1),
            },
            "strokes": [
                {
                    "stroke_type": s.stroke_type,
                    "confidence": round(s.confidence, 4),
                    "frame_start": s.frame_start,
                    "frame_peak": s.frame_peak,
                    "frame_end": s.frame_end,
                    "peak_wrist_velocity": s.peak_wrist_velocity,
                    "peak_elbow_angle": s.peak_elbow_angle,
                    "speed_at_peak_kmh": s.speed_at_peak_kmh,
                    "side": s.side,
                }
                for s in self.strokes
            ],
            "comparisons": [
                {
                    "pro_name": c.pro_name,
                    "stroke_type": c.stroke_type,
                    "player_angles": {k: round(v, 1) for k, v in c.player_angles.items()},
                    "pro_angles": {k: round(v, 1) for k, v in c.pro_angles.items()},
                    "differences": {k: round(v, 1) for k, v in c.differences.items()},
                    "similarity_score": round(c.similarity_score, 3),
                    "feedback": c.feedback,
                }
                for c in self.comparisons
            ],
            "drills": self.drills,
            "frames": frames_out,
        }

    def to_json(self) -> str:
        import json
        return json.dumps(self.to_dict(), indent=2)
