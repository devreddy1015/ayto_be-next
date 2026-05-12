"""Stroke classification models for Ayto.

The production-facing classifier is intentionally multi-stream:

* raw per-frame features preserve pose/shuttle/court state
* first-order motion captures racket and body velocity
* second-order motion captures acceleration around impact
* temporal convolutions model short swing phases
* a Transformer encoder models longer context across the clipped stroke

The public API remains compatible with the original ``BadmintonStrokeClassifier``.
"""
from __future__ import annotations

import math

import torch
import torch.nn as nn


CLASSES = ["smash", "drop", "clear", "net", "serve", "defensive"]


def _as_odd_kernel(kernel_size: int) -> int:
    if kernel_size < 1:
        raise ValueError("Temporal kernel sizes must be positive")
    return kernel_size if kernel_size % 2 == 1 else kernel_size + 1


def temporal_difference(x: torch.Tensor) -> torch.Tensor:
    """Return first-order temporal differences with a zero first frame."""
    diff = torch.zeros_like(x)
    diff[:, 1:] = x[:, 1:] - x[:, :-1]
    return diff


class MultiScaleTemporalStem(nn.Module):
    """Local temporal filters for short swing phases."""

    def __init__(
        self,
        model_dim: int,
        kernels: tuple[int, ...] = (3, 5, 7),
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.branches = nn.ModuleList(
            [
                nn.Sequential(
                    nn.Conv1d(
                        model_dim,
                        model_dim,
                        kernel_size=_as_odd_kernel(k),
                        padding=_as_odd_kernel(k) // 2,
                        groups=1,
                    ),
                    nn.GELU(),
                    nn.Dropout(dropout),
                )
                for k in kernels
            ]
        )
        self.norm = nn.LayerNorm(model_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x_t = x.transpose(1, 2)
        local = torch.stack([branch(x_t).transpose(1, 2) for branch in self.branches]).mean(dim=0)
        return self.norm(x + local)


class BadmintonStrokeClassifier(nn.Module):
    """Motion-aware Transformer classifier for badminton stroke clips.

    Args:
        input_size: Number of features per frame. The legacy pose-only setting is
            27 features, but the model also accepts richer fused vectors such as
            pose + shuttle trajectory + court/player position features.
        model_dim: Internal embedding dimension.
        hidden_size: Kept for backward compatibility. If ``model_dim`` is not
            provided by old callers, it is used as the embedding dimension.
        num_layers: Number of Transformer encoder layers.
        num_classes: Number of output stroke classes.
        dropout: Dropout rate.
        num_heads: Number of Transformer and attention-pooling heads.
        max_seq_len: Maximum supported sequence length.
        temporal_kernels: Multi-scale temporal convolution kernel sizes.
    """

    def __init__(
        self,
        input_size: int = 27,
        model_dim: int | None = None,
        hidden_size: int = 128,
        num_layers: int = 3,
        num_classes: int = 6,
        dropout: float = 0.25,
        num_heads: int = 4,
        max_seq_len: int = 120,
        temporal_kernels: tuple[int, ...] = (3, 5, 7),
    ) -> None:
        super().__init__()
        if model_dim is None:
            model_dim = hidden_size
        if model_dim % num_heads != 0:
            raise ValueError("model_dim must be divisible by num_heads")

        self.input_size = input_size
        self.model_dim = model_dim
        self.num_classes = num_classes
        self.max_seq_len = max_seq_len

        self.input_norm = nn.LayerNorm(input_size)
        self.raw_projection = nn.Linear(input_size, model_dim)
        self.velocity_projection = nn.Linear(input_size, model_dim)
        self.acceleration_projection = nn.Linear(input_size, model_dim)
        self.modality_gate = nn.Sequential(
            nn.Linear(model_dim * 3, model_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(model_dim, 3),
            nn.Softmax(dim=-1),
        )

        self.temporal_stem = MultiScaleTemporalStem(
            model_dim=model_dim,
            kernels=temporal_kernels,
            dropout=dropout,
        )

        self.cls_token = nn.Parameter(torch.zeros(1, 1, model_dim))
        self.positional_embedding = nn.Parameter(torch.zeros(1, max_seq_len + 1, model_dim))

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=model_dim,
            nhead=num_heads,
            dim_feedforward=model_dim * 4,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.attention = nn.MultiheadAttention(
            embed_dim=model_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.feature_norm = nn.LayerNorm(model_dim * 4)
        self.classifier = nn.Sequential(
            nn.Linear(model_dim * 4, model_dim * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(model_dim * 2, model_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(model_dim, num_classes),
        )

        self._reset_parameters()

    def _reset_parameters(self) -> None:
        nn.init.trunc_normal_(self.cls_token, std=0.02)
        nn.init.trunc_normal_(self.positional_embedding, std=0.02)
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def _embed_streams(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_norm(x)
        velocity = temporal_difference(x)
        acceleration = temporal_difference(velocity)

        raw = self.raw_projection(x)
        vel = self.velocity_projection(velocity)
        acc = self.acceleration_projection(acceleration)

        gates = self.modality_gate(torch.cat([raw, vel, acc], dim=-1))
        fused = (
            gates[..., 0:1] * raw
            + gates[..., 1:2] * vel
            + gates[..., 2:3] * acc
        ) * math.sqrt(3.0)
        return fused

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        """Return the pooled clip embedding before the classifier head."""
        if x.ndim != 3:
            raise ValueError("Expected input shape (batch, seq_len, features)")
        batch_size, seq_len, _ = x.shape
        if seq_len > self.max_seq_len:
            raise ValueError(f"seq_len={seq_len} exceeds max_seq_len={self.max_seq_len}")

        tokens = self.temporal_stem(self._embed_streams(x))
        cls = self.cls_token.expand(batch_size, -1, -1)
        tokens = torch.cat([cls, tokens], dim=1)
        tokens = tokens + self.positional_embedding[:, : seq_len + 1]

        encoded = self.transformer(tokens)
        cls_token = encoded[:, :1]
        frame_tokens = encoded[:, 1:]

        attended, _ = self.attention(cls_token, frame_tokens, frame_tokens)
        mean_pool = frame_tokens.mean(dim=1)
        max_pool = frame_tokens.max(dim=1).values
        features = torch.cat(
            [cls_token.squeeze(1), attended.squeeze(1), mean_pool, max_pool],
            dim=-1,
        )
        return self.feature_norm(features)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Return class logits for input shape ``(batch, seq_len, features)``."""
        return self.classifier(self.extract_features(x))

    def predict(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Run inference and return class predictions and probabilities."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            probs = torch.softmax(logits, dim=1)
            preds = torch.argmax(probs, dim=1)
        return preds, probs


StrokeClassifier = BadmintonStrokeClassifier
