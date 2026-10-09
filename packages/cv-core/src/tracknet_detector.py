"""Streaming wrapper around :class:`TrackNet` for frame-by-frame use."""
from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch

try:
    from .tracknet_model import TrackNet, decode_heatmap
except ImportError:  # imported as a top-level module (src/ on sys.path)
    from tracknet_model import TrackNet, decode_heatmap


class TrackNetDetector:
    """Feeds a rolling window of frames to a trained TrackNet.

    Checkpoints are saved by ``train_tracknet.py`` as
    ``{"config": {...}, "state_dict": {...}}``, so the architecture options
    (frames, background, motion attention, width) travel with the weights.

    The background image for TrackNetV3-style models is the per-pixel median
    of up to ``BACKGROUND_SAMPLES`` frames, sampled every
    ``BACKGROUND_STRIDE`` frames and refreshed as the clip goes on.
    """

    INPUT_SIZE = (288, 512)  # (height, width), the TrackNet standard
    DEFAULT_CONF = 0.5
    BACKGROUND_SAMPLES = 32
    BACKGROUND_STRIDE = 15

    def __init__(
        self,
        model_path: str | Path = "models/tracknet.pt",
        conf_threshold: float = DEFAULT_CONF,
        device: str = "cpu",
    ) -> None:
        self.conf_threshold = conf_threshold
        self.device = device
        self.model: TrackNet | None = None

        path = Path(model_path)
        if path.exists():
            ckpt = torch.load(str(path), map_location=device, weights_only=True)
            config = ckpt.get("config", {}) if isinstance(ckpt, dict) else {}
            state = ckpt.get("state_dict", ckpt) if isinstance(ckpt, dict) else ckpt
            self.model = TrackNet(**config).to(device).eval()
            self.model.load_state_dict(state)

        frames = self.model.num_frames if self.model else 3
        self._frames: deque[np.ndarray] = deque(maxlen=frames)
        self._bg_samples: deque[np.ndarray] = deque(maxlen=self.BACKGROUND_SAMPLES)
        self._background: np.ndarray | None = None
        self._count = 0

    def is_trained(self) -> bool:
        return self.model is not None

    def _update_background(self, frame: np.ndarray) -> None:
        if self._count % self.BACKGROUND_STRIDE == 0:
            self._bg_samples.append(frame)
            self._background = np.median(np.stack(self._bg_samples), axis=0).astype(np.uint8)

    @torch.no_grad()
    def detect(self, frame: np.ndarray) -> dict[str, Any] | None:
        """Push one BGR frame; return the shuttle in it, or None.

        Returns:
            ``{"center": (x, y), "confidence": float, "bbox": [...]}`` in
            original-frame pixels.
        """
        if self.model is None:
            return None
        h, w = frame.shape[:2]
        small = cv2.resize(frame, (self.INPUT_SIZE[1], self.INPUT_SIZE[0]))
        self._frames.append(small)
        if self.model.use_background:
            self._update_background(small)
        self._count += 1
        if len(self._frames) < self._frames.maxlen:
            return None

        stack = list(self._frames)
        if self.model.use_background:
            stack.append(self._background)
        x = np.concatenate([f.transpose(2, 0, 1) for f in stack], axis=0)
        tensor = torch.from_numpy(x).float().div_(255.0).unsqueeze(0).to(self.device)
        heatmap = self.model(tensor)[:, -1:]  # heatmap of the newest frame

        xy, score = decode_heatmap(heatmap, threshold=self.conf_threshold)
        conf = float(score[0, 0])
        if not np.isfinite(float(xy[0, 0, 0])):
            return None
        cx = float(xy[0, 0, 0]) * w / self.INPUT_SIZE[1]
        cy = float(xy[0, 0, 1]) * h / self.INPUT_SIZE[0]
        return {
            "class": "shuttle",
            "confidence": conf,
            "center": (cx, cy),
            "bbox": [cx - 8, cy - 8, cx + 8, cy + 8],
        }

    def reset(self) -> None:
        self._frames.clear()
        self._bg_samples.clear()
        self._background = None
        self._count = 0
