"""Computer vision pipeline for shuttlecock analysis.

Chains ShuttleDetector → ShuttleTracker → SpeedCalculator into a
unified pipeline that can process videos or individual frames and
return structured results as DataFrames.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pandas as pd

from .detector import ShuttleDetector
from .speed import CourtCalibration, SpeedCalculator
from .tracker import ShuttleTracker


@dataclass
class FrameResult:
    """Result of processing a single frame through the CV pipeline.

    Attributes:
        frame: Frame index (0-based).
        shuttle_x: Tracked x-coordinate of the shuttle (or NaN).
        shuttle_y: Tracked y-coordinate of the shuttle (or NaN).
        speed_kmh: Computed speed in km/h (or NaN).
        stroke_detected: Whether a potential stroke was detected this frame.
        confidence: Detection confidence score (0.0 if undetected).
    """

    frame: int
    shuttle_x: float
    shuttle_y: float
    speed_kmh: float
    stroke_detected: bool
    confidence: float


class CVPipeline:
    """End-to-end computer vision pipeline for shuttle analysis.

    Chains together detection, tracking, and speed estimation to
    process video files or individual frames. Includes simple
    stroke detection based on speed spikes.

    Usage:
        pipeline = CVPipeline()
        df = pipeline.process_video("match.mp4")
        result = pipeline.process_frame(frame, fps=60.0)
    """

    STROKE_SPEED_THRESHOLD = 150.0  # km/h — speed spike for stroke detection
    STROKE_ACCEL_THRESHOLD = 50.0   # km/h per frame — acceleration threshold

    def __init__(
        self,
        model_path: str | Path = "yolov8n.pt",
        conf_threshold: float = 0.35,
    ) -> None:
        """Initialize the CV pipeline.

        Args:
            model_path: Path to YOLOv8 model weights.
            conf_threshold: Minimum detection confidence threshold.
        """
        self.detector = ShuttleDetector(model_path=model_path, conf_threshold=conf_threshold)
        self.tracker = ShuttleTracker()
        self.speed_calc = SpeedCalculator()
        self.results: list[FrameResult] = []
        self._prev_speed: float = 0.0

    def process_video(self, video_path: str | Path) -> pd.DataFrame:
        """Process an entire video and return results as a DataFrame.

        Args:
            video_path: Path to the video file to process.

        Returns:
            DataFrame with columns: frame, shuttle_x, shuttle_y,
            speed_kmh, stroke_detected.

        Raises:
            FileNotFoundError: If the video file cannot be opened.
        """
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
        self._prev_speed = 0.0

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            result = self.process_frame(frame, fps, frame_idx)
            self.results.append(result)
            frame_idx += 1

        cap.release()

        return self._results_to_dataframe()

    def process_frame(
        self,
        frame: np.ndarray,
        fps: float = 60.0,
        frame_idx: int = 0,
    ) -> FrameResult:
        """Process a single frame for real-time use.

        Args:
            frame: BGR image as numpy array.
            fps: Current video frame rate.
            frame_idx: Current frame index.

        Returns:
            FrameResult dict with shuttle position, speed, and stroke detection.
        """
        detection = self.detector.detect_shuttle(frame)
        raw_pos = (detection["center_x"], detection["center_y"]) if detection else None
        conf = detection["confidence"] if detection else 0.0
        tracked_pos = self.tracker.update(raw_pos)

        speed = float("nan")
        stroke_detected = False

        if tracked_pos is not None:
            computed_speed = self.speed_calc.compute_speed(tracked_pos)
            if computed_speed is not None:
                speed = computed_speed
                accel = abs(speed - self._prev_speed)
                if speed > self.STROKE_SPEED_THRESHOLD and accel > self.STROKE_ACCEL_THRESHOLD:
                    stroke_detected = True
                self._prev_speed = speed

        result = FrameResult(
            frame=frame_idx,
            shuttle_x=tracked_pos[0] if tracked_pos else float("nan"),
            shuttle_y=tracked_pos[1] if tracked_pos else float("nan"),
            speed_kmh=speed,
            stroke_detected=stroke_detected,
            confidence=conf,
        )
        return result

    def _results_to_dataframe(self) -> pd.DataFrame:
        """Convert internal results list to a pandas DataFrame.

        Returns:
            DataFrame with columns: frame, shuttle_x, shuttle_y,
            speed_kmh, stroke_detected.
        """
        records = [
            {
                "frame": r.frame,
                "shuttle_x": r.shuttle_x,
                "shuttle_y": r.shuttle_y,
                "speed_kmh": r.speed_kmh,
                "stroke_detected": r.stroke_detected,
            }
            for r in self.results
        ]
        return pd.DataFrame(records)

    def export_csv(self, output_path: str | Path) -> Path:
        """Export results to a CSV file.

        Args:
            output_path: Destination path for the CSV file.

        Returns:
            Path to the written CSV file.
        """
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        df = self._results_to_dataframe()
        df.to_csv(output, index=False)
        return output

    def get_summary(self) -> dict[str, Any]:
        """Generate a summary of the pipeline results.

        Returns:
            Dict with total_frames, detected_frames, detection_rate,
            avg_speed_kmh, max_speed_kmh, min_speed_kmh, strokes_detected.
        """
        total_frames = len(self.results)
        detected_frames = sum(1 for r in self.results if r.confidence > 0)
        speeds = [
            r.speed_kmh
            for r in self.results
            if not np.isnan(r.speed_kmh) and r.speed_kmh > 0
        ]
        strokes = sum(1 for r in self.results if r.stroke_detected)
        return {
            "total_frames": total_frames,
            "detected_frames": detected_frames,
            "detection_rate": detected_frames / total_frames if total_frames > 0 else 0.0,
            "avg_speed_kmh": sum(speeds) / len(speeds) if speeds else 0.0,
            "max_speed_kmh": max(speeds) if speeds else 0.0,
            "min_speed_kmh": min(speeds) if speeds else 0.0,
            "strokes_detected": strokes,
        }
