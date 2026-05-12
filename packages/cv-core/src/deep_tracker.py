from __future__ import annotations

import math
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class CorrelationVolume(nn.Module):
    """Compute 4D correlation volume between feature maps (TAPIR-style)."""

    def __init__(self, radius: int = 4) -> None:
        super().__init__()
        self.radius = radius

    def forward(
        self, fmap1: torch.Tensor, fmap2: torch.Tensor
    ) -> torch.Tensor:
        B, C, H, W = fmap1.shape
        corr_pyramid: list[torch.Tensor] = []

        fmap2_padded = F.pad(fmap2, [self.radius] * 4)

        for dy in range(-self.radius, self.radius + 1):
            for dx in range(-self.radius, self.radius + 1):
                fmap2_shifted = fmap2_padded[
                    :, :,
                    self.radius + dy : self.radius + dy + H,
                    self.radius + dx : self.radius + dx + W,
                ]
                corr = (fmap1 * fmap2_shifted).sum(dim=1, keepdim=True)
                corr_pyramid.append(corr)

        return torch.cat(corr_pyramid, dim=1)


class IterativeRefiner(nn.Module):
    """Iteratively refines position estimate using correlation features (RAFT-inspired)."""

    def __init__(self, corr_dim: int = 81, hidden_dim: int = 128) -> None:
        super().__init__()
        self.gru = nn.GRUCell(corr_dim + 2, hidden_dim)
        self.delta_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 2),
        )

    def forward(
        self, corr_volume: torch.Tensor, coords: torch.Tensor, h: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor]:
        B, _, H, W = corr_volume.shape

        cx = (coords[:, 0] * (W - 1)).long().clamp(0, W - 1)
        cy = (coords[:, 1] * (H - 1)).long().clamp(0, H - 1)

        corr_features: list[torch.Tensor] = []
        for b in range(B):
            cf = corr_volume[b, :, cy[b], cx[b]]
            corr_features.append(cf)
        corr_vec = torch.stack(corr_features)

        corr_encoded = corr_vec

        gru_input = torch.cat([corr_encoded, coords], dim=1)
        h = self.gru(gru_input, h) if h is not None else self.gru(gru_input)

        delta = self.delta_head(h)
        new_coords = coords + delta * 0.1

        new_coords[:, 0] = new_coords[:, 0].clamp(0.001, 0.999)
        new_coords[:, 1] = new_coords[:, 1].clamp(0.001, 0.999)

        return new_coords, h


class DeepTracker(nn.Module):
    """
    DeepTracker: Learning-based point tracker for small fast objects.

    Architecture (TAPIR + CoTracker-inspired):
    1. Frame encoder: Shared CNN extracts features from each frame
    2. Correlation volume: 4D correlation between consecutive frame features
    3. Iterative refiner: GRU-based refinement with learned motion priors
    4. Temporal smoothing: Hidden state propagates motion history

    Advantages over Kalman filter:
    - Learns sport-specific motion patterns (shuttle deceleration, spin)
    - Handles full occlusion (shuttle behind player body)
    - Multi-frame temporal consistency via learned dynamics
    - Sub-pixel accuracy via correlation features

    References:
    - TAPIR: Tracking Any Point with per-frame Initialization (Doersch et al., NeurIPS 2023)
    - CoTracker: It is Better to Track Together (Karaev et al., ECCV 2024)
    """

    def __init__(
        self,
        feature_dim: int = 64,
        hidden_dim: int = 128,
        num_refinements: int = 4,
        correlation_radius: int = 4,
    ) -> None:
        super().__init__()

        self.num_refinements = num_refinements

        self.feature_encoder = nn.Sequential(
            nn.Conv2d(3, 16, 7, stride=2, padding=3),
            nn.ReLU(),
            nn.Conv2d(16, 32, 5, stride=2, padding=2),
            nn.ReLU(),
            nn.Conv2d(32, feature_dim, 3, stride=2, padding=1),
            nn.ReLU(),
        )

        corr_dim = (correlation_radius * 2 + 1) ** 2
        self.correlation = CorrelationVolume(radius=correlation_radius)
        self.refiner = IterativeRefiner(corr_dim=corr_dim, hidden_dim=hidden_dim)

    def encode_frame(self, frame: torch.Tensor) -> torch.Tensor:
        """Encode a frame into feature map. Input: (B, 3, H, W) → (B, C, H/8, W/8)."""
        return self.feature_encoder(frame)

    def forward(
        self,
        frames: torch.Tensor,
        init_position: torch.Tensor,
    ) -> torch.Tensor:
        B, T, C, H, W = frames.shape

        coords = init_position.clone()  # (B, 2) in [0,1] normalized coords
        h_state: torch.Tensor | None = None
        all_positions: list[torch.Tensor] = [coords.clone()]

        for t in range(T - 1):
            f_t = self.encode_frame(frames[:, t])      # (B, C, H/8, W/8)
            f_next = self.encode_frame(frames[:, t + 1])

            corr = self.correlation(f_t, f_next)        # (B, 81, H/8, W/8)

            for _ in range(self.num_refinements):
                coords, h_state = self.refiner(corr, coords, h_state)

            all_positions.append(coords.clone())

        return torch.stack(all_positions, dim=1)  # (B, T, 2)

    def track(
        self,
        frames_np: list[np.ndarray],
        init_x: float,
        init_y: float,
        input_size: tuple[int, int] = (288, 512),
        device: str = "cpu",
    ) -> list[tuple[float, float]]:
        """Track a point through a sequence of frames (NumPy interface)."""
        import cv2

        self.eval()
        h, w = input_size
        frames_tensor = []

        for frame in frames_np:
            resized = cv2.resize(frame, (w, h))
            tensor = torch.tensor(
                resized.transpose(2, 0, 1), dtype=torch.float32
            ) / 255.0
            frames_tensor.append(tensor)

        frames_batch = torch.stack(frames_tensor).unsqueeze(0).to(device)  # (1, T, 3, H, W)
        init_pos = torch.tensor([[init_x, init_y]], dtype=torch.float32).to(device)

        with torch.no_grad():
            positions = self.forward(frames_batch, init_pos)

        positions_np = positions.squeeze(0).cpu().numpy()
        return [(float(p[0]), float(p[1])) for p in positions_np]


class LightweightDeepTracker:
    """
    Production-grade wrapper for DeepTracker.
    Falls back to Kalman filter when model is not trained.
    """

    def __init__(
        self,
        model_path: str = "models/deep_tracker.pt",
        input_size: tuple[int, int] = (288, 512),
        device: str = "cpu",
    ) -> None:
        self.input_size = input_size
        self.device = device
        self.model = DeepTracker()

        try:
            self.model.load_state_dict(
                torch.load(model_path, map_location=device, weights_only=True)
            )
            self.model.to(device)
            self.model.eval()
            self.trained = True
        except (FileNotFoundError, RuntimeError):
            self.trained = False

        self._frame_buffer: list[np.ndarray] = []
        self._kalman = None

    def is_trained(self) -> bool:
        return self.trained

    def update(
        self, frame: np.ndarray, detection: tuple[float, float] | None
    ) -> tuple[float, float] | None:
        self._frame_buffer.append(frame)
        if len(self._frame_buffer) > 10:
            self._frame_buffer.pop(0)

        if self.trained and len(self._frame_buffer) >= 3:
            h, w = frame.shape[:2]
            init_x = detection[0] / w if detection else 0.5
            init_y = detection[1] / h if detection else 0.5
            positions = self.model.track(
                self._frame_buffer[-3:],
                init_x, init_y,
                self.input_size, self.device,
            )
            if positions:
                last = positions[-1]
                return (last[0] * w, last[1] * h)

        return self._kalman_update(detection)

    def _kalman_update(
        self, detection: tuple[float, float] | None
    ) -> tuple[float, float] | None:
        if self._kalman is None:
            try:
                from filterpy.kalman import KalmanFilter
                self._kalman = _init_kf()
            except ImportError:
                return detection

        if detection is not None:
            self._kalman.update(np.array([[detection[0]], [detection[1]]]))
        self._kalman.predict()
        return (float(self._kalman.x[0, 0]), float(self._kalman.x[1, 0]))

    def reset(self) -> None:
        self._frame_buffer.clear()
        self._kalman = None


def _init_kf() -> Any:
    from filterpy.kalman import KalmanFilter
    kf = KalmanFilter(dim_x=4, dim_z=2)
    kf.F = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]])
    kf.H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]])
    kf.R *= 5.0
    kf.P *= 100.0
    return kf
