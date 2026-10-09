"""YOLO fallback detector for the shuttle/ball.

Only used when no trained TrackNet is available. Single-frame box detectors
miss most fast, tiny shuttles (YOLOv7 F1 68.0 vs TrackNetV3 97.5 on the same
benchmark), so treat this path as a cold-start convenience.
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

    # A fine-tuned model's own classes, plus COCO's "sports ball" for stock weights.
    CLASSES = ["shuttle", "shuttlecock", "ball", "sports ball"]
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
        """Return the most confident shuttle/ball detection, or None.

        Other classes (people, rackets) are never used as a stand-in.
        """
        candidates = [d for d in self.detect(frame) if d["class"].lower() in self.CLASSES]
        return max(candidates, key=lambda d: d["confidence"]) if candidates else None
