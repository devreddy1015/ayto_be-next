from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch

from tracknet_model import TrackNetV2


class TrackNetDetector:
    INPUT_SIZE = (288, 512)
    DEFAULT_CONF = 0.3

    def __init__(
        self,
        model_path: str | Path = "models/tracknetv2.pt",
        conf_threshold: float = DEFAULT_CONF,
        device: str = "cpu",
    ) -> None:
        self.conf_threshold = conf_threshold
        self.device = device
        self.model = TrackNetV2(in_channels=9, out_channels=1).to(device)

        model_file = Path(model_path)
        if model_file.exists():
            self.model.load_state_dict(
                torch.load(str(model_file), map_location=device, weights_only=True)
            )
            self.model.eval()
            self._trained = True
        else:
            self._trained = False

        self._frame_buffer: list[np.ndarray] = []
        self._seq_len = 3

    def is_trained(self) -> bool:
        return self._trained

    def detect(
        self, frame: np.ndarray
    ) -> dict[str, Any] | None:
        frame_resized = cv2.resize(frame, (self.INPUT_SIZE[1], self.INPUT_SIZE[0]))
        self._frame_buffer.append(frame_resized)

        if len(self._frame_buffer) > self._seq_len:
            self._frame_buffer.pop(0)

        if not self._trained or len(self._frame_buffer) < self._seq_len:
            return self._fallback_detect(frame)

        frames = np.concatenate(
            [f.transpose(2, 0, 1) for f in self._frame_buffer], axis=0
        ).astype(np.float32) / 255.0

        input_tensor = torch.tensor(frames).unsqueeze(0).to(self.device)

        with torch.no_grad():
            heatmap, position = self.model.detect(input_tensor)

        heatmap_np = heatmap.squeeze().cpu().numpy()
        max_val = float(heatmap_np.max())

        if max_val < self.conf_threshold:
            return None

        x_norm = float(position[0, 0])
        y_norm = float(position[0, 1])

        h, w = frame.shape[:2]
        cx = x_norm * w
        cy = y_norm * h

        return {
            "class": "shuttle",
            "confidence": max_val,
            "center": (cx, cy),
            "bbox": [cx - 8, cy - 8, cx + 8, cy + 8],
        }

    def _fallback_detect(self, frame: np.ndarray) -> dict[str, Any] | None:
        try:
            from detector import ShuttleDetector
            detector = ShuttleDetector()
            return detector.detect_shuttle(frame)
        except ImportError:
            return None

    def reset(self) -> None:
        self._frame_buffer.clear()
