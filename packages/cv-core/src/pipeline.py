from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .detector import ShuttleDetector
from .speed import CourtCalibration, SpeedCalculator
from .tracker import ShuttleTracker


@dataclass
class FrameResult:
    frame_idx: int
    timestamp_s: float
    shuttle_detected: bool
    raw_position: tuple[float, float] | None
    tracked_position: tuple[float, float] | None
    speed_kmh: float | None
    confidence: float


class CVPipeline:
    def __init__(
        self,
        model_path: str | Path = "yolov8n.pt",
        conf_threshold: float = 0.35,
    ) -> None:
        self.detector = ShuttleDetector(model_path=model_path, conf_threshold=conf_threshold)
        self.tracker = ShuttleTracker()
        self.speed_calc = SpeedCalculator()
        self.results: list[FrameResult] = []

    def process_video(self, video_path: str | Path) -> list[FrameResult]:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"Cannot open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        self.tracker = ShuttleTracker(dt=1.0 / fps)
        calibration = CourtCalibration()
        calibration.calibrate_auto(width, height)
        self.speed_calc = SpeedCalculator(fps=fps, calibration=calibration)
        self.results.clear()

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            detection = self.detector.detect_shuttle(frame)
            raw_pos = detection["center"] if detection else None
            conf = detection["confidence"] if detection else 0.0
            tracked_pos = self.tracker.update(raw_pos)
            speed = None
            if tracked_pos is not None:
                speed = self.speed_calc.compute_speed(tracked_pos)

            result = FrameResult(
                frame_idx=frame_idx,
                timestamp_s=frame_idx / fps,
                shuttle_detected=detection is not None,
                raw_position=raw_pos,
                tracked_position=tracked_pos,
                speed_kmh=speed,
                confidence=conf,
            )
            self.results.append(result)
            frame_idx += 1

        cap.release()
        return self.results

    def export_csv(self, output_path: str | Path) -> Path:
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)

        with open(output, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "frame",
                "timestamp_s",
                "detected",
                "raw_x",
                "raw_y",
                "tracked_x",
                "tracked_y",
                "speed_kmh",
                "confidence",
            ])
            for r in self.results:
                writer.writerow([
                    r.frame_idx,
                    f"{r.timestamp_s:.4f}",
                    int(r.shuttle_detected),
                    f"{r.raw_position[0]:.2f}" if r.raw_position else "",
                    f"{r.raw_position[1]:.2f}" if r.raw_position else "",
                    f"{r.tracked_position[0]:.2f}" if r.tracked_position else "",
                    f"{r.tracked_position[1]:.2f}" if r.tracked_position else "",
                    f"{r.speed_kmh:.2f}" if r.speed_kmh is not None else "",
                    f"{r.confidence:.4f}",
                ])
        return output

    def get_summary(self) -> dict[str, Any]:
        total_frames = len(self.results)
        detected_frames = sum(1 for r in self.results if r.shuttle_detected)
        speeds = [r.speed_kmh for r in self.results if r.speed_kmh is not None and r.speed_kmh > 0]
        return {
            "total_frames": total_frames,
            "detected_frames": detected_frames,
            "detection_rate": detected_frames / total_frames if total_frames > 0 else 0.0,
            "avg_speed_kmh": sum(speeds) / len(speeds) if speeds else 0.0,
            "max_speed_kmh": max(speeds) if speeds else 0.0,
            "min_speed_kmh": min(speeds) if speeds else 0.0,
        }
