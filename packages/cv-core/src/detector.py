"""YOLOv8n shuttle detection module.

Provides ShuttleDetector class for detecting shuttlecocks in video frames
using a YOLOv8n model. Returns bounding boxes, confidence scores, and
center coordinates for each detection.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


class ShuttleDetector:
    """YOLOv8n-based shuttlecock detector.

    Loads a YOLOv8 model and runs inference on individual frames,
    returning a list of detections with bounding boxes, confidence
    scores, and center coordinates.

    Attributes:
        CLASSES: Known shuttlecock class names in the model.
        DEFAULT_CONF: Default confidence threshold for detections.
        DEFAULT_IMG_SIZE: Default input image size for inference.
    """

    CLASSES = ["shuttle", "shuttlecock"]
    DEFAULT_CONF = 0.35
    DEFAULT_IMG_SIZE = 640

    def __init__(
        self,
        model_path: str | Path = "yolov8n.pt",
        conf_threshold: float = DEFAULT_CONF,
        img_size: int = DEFAULT_IMG_SIZE,
    ) -> None:
        """Initialize the shuttle detector.

        Args:
            model_path: Path to the YOLOv8 model weights file.
            conf_threshold: Minimum confidence threshold for detections.
            img_size: Input image size for model inference.

        Raises:
            ImportError: If ultralytics is not installed.
        """
        if YOLO is None:
            raise ImportError("ultralytics is required — pip install ultralytics")
        self.model = YOLO(str(model_path))
        self.conf_threshold = conf_threshold
        self.img_size = img_size

    def detect(self, frame: np.ndarray) -> list[dict[str, Any]]:
        """Run inference on a single frame and return all detections.

        Args:
            frame: BGR image as numpy array (H, W, 3).

        Returns:
            List of detection dicts, each containing:
                - bbox: [x1, y1, x2, y2] bounding box coordinates
                - confidence: detection confidence score (0-1)
                - center_x: x-coordinate of bounding box center
                - center_y: y-coordinate of bounding box center
                - class: detected class name string
        """
        results = self.model.predict(
            frame,
            conf=self.conf_threshold,
            imgsz=self.img_size,
            verbose=False,
        )
        detections: list[dict[str, Any]] = []
        for r in results:
            boxes = r.boxes
            if boxes is None:
                continue
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                cls_name = self.model.names[cls_id]
                conf = float(boxes.conf[i].item())
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                detections.append(
                    {
                        "class": cls_name,
                        "confidence": conf,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "center_x": float(cx),
                        "center_y": float(cy),
                    }
                )
        return detections

    def detect_shuttle(self, frame: np.ndarray) -> dict[str, Any] | None:
        """Detect the most likely shuttlecock in a frame.

        Filters detections for shuttle/shuttlecock classes. If none found,
        falls back to the smallest detected object (likely shuttle-sized).
        Handles no-detection gracefully by returning None.

        Args:
            frame: BGR image as numpy array (H, W, 3).

        Returns:
            Best shuttle detection dict, or None if nothing detected.
        """
        detections = self.detect(frame)
        shuttle_dets = [d for d in detections if d["class"].lower() in self.CLASSES]
        if not shuttle_dets:
            small_dets = sorted(
                detections,
                key=lambda d: (d["bbox"][2] - d["bbox"][0]) * (d["bbox"][3] - d["bbox"][1]),
            )
            return small_dets[0] if small_dets else None
        return max(shuttle_dets, key=lambda d: d["confidence"])
