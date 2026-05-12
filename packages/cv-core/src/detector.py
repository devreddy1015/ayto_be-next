from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


class ShuttleDetector:
    CLASSES = ["shuttle", "shuttlecock"]
    DEFAULT_CONF = 0.35
    DEFAULT_IMG_SIZE = 640

    def __init__(
        self,
        model_path: str | Path = "yolov8n.pt",
        conf_threshold: float = DEFAULT_CONF,
        img_size: int = DEFAULT_IMG_SIZE,
    ) -> None:
        if YOLO is None:
            raise ImportError("ultralytics is required — pip install ultralytics")
        self.model = YOLO(str(model_path))
        self.conf_threshold = conf_threshold
        self.img_size = img_size

    def detect(self, frame: np.ndarray) -> list[dict[str, Any]]:
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
                        "center": (float(cx), float(cy)),
                    }
                )
        return detections

    def detect_shuttle(self, frame: np.ndarray) -> dict[str, Any] | None:
        detections = self.detect(frame)
        shuttle_dets = [d for d in detections if d["class"].lower() in self.CLASSES]
        if not shuttle_dets:
            small_dets = sorted(
                detections,
                key=lambda d: (d["bbox"][2] - d["bbox"][0]) * (d["bbox"][3] - d["bbox"][1]),
            )
            return small_dets[0] if small_dets else None
        return max(shuttle_dets, key=lambda d: d["confidence"])
