"""Adaptive tracker that selects the best backend at runtime.

Priority chain (auto-detected):
    1. TrackNetV2 (U-Net heatmap) — best accuracy for shuttle tracking
     2. DeepTracker (learned motion features) — handles occlusion
    3. Kalman filter (physics-based) — lightweight, always works
    4. None (pass-through) — no smoothing

The AdaptiveTracker auto-detects which backends are available
(trained model weights present? dependencies installed?) and
selects the highest-fidelity one available.

Usage:
    tracker = AdaptiveTracker()
    pos = tracker.update(frame, detection)
    if tracker.is_tracknet:
        print("Using TrackNetV2 — pro-tier accuracy")
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np


class AdaptiveTracker:
    """Adaptive shuttle tracker with automatic fallback.

    Tries backends in order: TrackNetV2 → DeepTracker → Kalman → pass-through.
    Each backend is tried once at init; if unavailable, the next best is used.
    """

    # --- Backend priority levels ---
    TRACKNET = "tracknet"
    DEEP = "deep"
    KALMAN = "kalman"
    PASSTHROUGH = "passthrough"

    def __init__(
        self,
        tracknet_model_path: str = "models/tracknetv2.pt",
        deep_model_path: str = "models/deep_tracker.pt",
        fps: float = 60.0,
        device: str = "cpu",
    ) -> None:
        self.fps = fps
        self.device = device
        self.backend = self.PASSTHROUGH
        self._tracker: Any = None
        self._detector: Any = None
        self._frame_buffer: list[np.ndarray] = []

        # --- Probe backends ---
        if self._try_tracknet(tracknet_model_path):
            self.backend = self.TRACKNET
        elif self._try_deep(deep_model_path):
            self.backend = self.DEEP
        elif self._try_kalman():
            self.backend = self.KALMAN

    @property
    def is_tracknet(self) -> bool:
        return self.backend == self.TRACKNET

    @property
    def is_deep(self) -> bool:
        return self.backend == self.DEEP

    @property
    def is_kalman(self) -> bool:
        return self.backend == self.KALMAN

    def detect(
        self, frame: np.ndarray
    ) -> dict[str, Any] | None:
        """Detect + track shuttle in a single frame.

        Returns detection dict compatible with ShuttleDetector format:
            {"class": "shuttle", "center": (x, y), "confidence": float, "bbox": [...]}
        """
        if self.backend == self.TRACKNET and self._detector:
            return self._detector.detect(frame)
        return None

    def update(
        self, frame: np.ndarray, detection: tuple[float, float] | None = None
    ) -> tuple[float, float] | None:
        """Track shuttle position with the current backend.

        Args:
            frame: BGR image (H, W, 3).
            detection: Optional (x, y) pixel detection from YOLO/etc.

        Returns:
            Smoothed (x, y) position.
        """
        self._frame_buffer.append(frame)
        if len(self._frame_buffer) > 10:
            self._frame_buffer.pop(0)

        if self.backend == self.DEEP and self._tracker:
            return self._tracker.update(frame, detection)
        elif self.backend == self.KALMAN and self._tracker:
            return self._tracker.update(detection)
        elif self.backend == self.TRACKNET and self._detector:
            result = self._detector.detect(frame)
            if result:
                return result["center"]
        return detection

    def reset(self) -> None:
        self._frame_buffer.clear()
        if hasattr(self._tracker, "reset"):
            self._tracker.reset()
        if hasattr(self._detector, "reset"):
            self._detector.reset()

    # --- Backend probes ---

    def _try_tracknet(self, model_path: str) -> bool:
        if not Path(model_path).exists():
            return False
        try:
            from tracknet_detector import TrackNetDetector
            self._detector = TrackNetDetector(model_path=model_path, device=self.device)
            if self._detector.is_trained():
                return True
        except Exception:
            pass
        return False

    def _try_deep(self, model_path: str) -> bool:
        if not Path(model_path).exists():
            return False
        try:
            from deep_tracker import LightweightDeepTracker
            self._tracker = LightweightDeepTracker(
                model_path=model_path, device=self.device
            )
            if self._tracker.is_trained():
                return True
        except Exception:
            pass
        return False

    def _try_kalman(self) -> bool:
        try:
            from tracker import ShuttleTracker
            self._tracker = ShuttleTracker(dt=1.0 / self.fps)
            return True
        except Exception:
            return False

    def get_track_history(self) -> list[tuple[float, float]]:
        if hasattr(self._tracker, "get_track_history"):
            return self._tracker.get_track_history()
        return []

    def is_valid(self) -> bool:
        if hasattr(self._tracker, "is_valid"):
            return self._tracker.is_valid()
        return self.backend != self.PASSTHROUGH
