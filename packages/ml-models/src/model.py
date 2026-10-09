"""Stroke classification models for Ayto.

``BadmintonStrokeClassifier`` takes one tensor ``(batch, seq_len, input_size)``
whose last axis is laid out as ``[pose | shuttle | position]``:

* the **pose** stream is embedded as raw / velocity / acceleration streams
  fused by a learned gate, then filtered by depthwise multi-scale temporal
  convolutions (short swing phases);
* when ``shuttle_dim > 0`` the **shuttle trajectory** (and, optionally, the
  players' **court positions**) form a second stream encoded by a dilated TCN;
  missing shuttle frames (confidence 0) are replaced by a learned token;
* pose tokens **query** trajectory tokens with cross-attention (the Cross
  Transformer idea from BST, arXiv 2502.21085) and a learned gate decides,
  per frame, how much trajectory evidence to mix in;
* a Transformer encoder with a CLS token and attention pooling classifies the
  fused clip.

With the default ``shuttle_dim=0`` and ``position_dim=0`` the whole last axis
is pose and the model behaves as the original pose-only classifier.

An optional Adjacent-Stroke Fusion head (``asf=True``, TemPose-TF-ASF,
arXiv 2605.02558) conditions the prediction on the class probabilities of the
previous and next strokes in the rally; see :func:`two_stage_predict`.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import torch
import torch.nn as nn

try:
    from .stroke_taxonomy import DEFAULT_SPORT, get_classes
except ImportError:
    from stroke_taxonomy import DEFAULT_SPORT, get_classes

CLASSES = get_classes("badminton")

DEFAULT_POSE_DIM = 27
# Trajectory TCN: kernel 5 with dilations 1/2/4 gives a 29-frame (~1 s @ 30 fps)
# receptive field, i.e. the whole hit-centred clip.
_TRAJECTORY_KERNEL = 5
_TRAJECTORY_DILATIONS = (1, 2, 4)


def _as_odd_kernel(kernel_size: int) -> int:
    if kernel_size < 1:
        raise ValueError("Temporal kernel sizes must be positive")
    return kernel_size if kernel_size % 2 == 1 else kernel_size + 1


def temporal_difference(x: torch.Tensor) -> torch.Tensor:
    """Return first-order temporal differences with a zero first frame.

    Written as slice + concat (no in-place scatter) so it exports to plain
    ONNX ``Slice``/``Sub``/``Concat`` ops.
    """
    return torch.cat([torch.zeros_like(x[:, :1]), x[:, 1:] - x[:, :-1]], dim=1)


def resolve_input_layout(
    input_size: int | None = None,
    pose_dim: int | None = None,
    shuttle_dim: int = 0,
    position_dim: int = 0,
) -> tuple[int, int, int]:
    """Resolve ``(pose_dim, shuttle_dim, position_dim)`` from partial arguments.

    ``pose_dim`` defaults to whatever is left of ``input_size`` after the shuttle
    and position channels, so legacy callers that only pass ``input_size`` get a
    pose-only model.
    """
    shuttle_dim = int(shuttle_dim or 0)
    position_dim = int(position_dim or 0)
    if shuttle_dim < 0 or position_dim < 0:
        raise ValueError("shuttle_dim and position_dim must be non-negative")
    if pose_dim is None:
        total = DEFAULT_POSE_DIM + shuttle_dim + position_dim if input_size is None else input_size
        pose_dim = int(total) - shuttle_dim - position_dim
    pose_dim = int(pose_dim)
    if pose_dim <= 0:
        raise ValueError("pose_dim must be positive")
    if input_size is not None and int(input_size) != pose_dim + shuttle_dim + position_dim:
        raise ValueError(
            f"input_size={input_size} != pose_dim + shuttle_dim + position_dim "
            f"({pose_dim} + {shuttle_dim} + {position_dim})"
        )
    return pose_dim, shuttle_dim, position_dim


class MultiScaleTemporalStem(nn.Module):
    """Depthwise multi-scale temporal filters for short swing phases.

    Each scale is a depthwise convolution; a shared pointwise convolution mixes
    channels afterwards. This keeps the stem at ``O(D * sum(k) + D^2)`` params
    instead of ``O(D^2 * sum(k))`` for full convolutions.
    """

    def __init__(
        self,
        model_dim: int,
        kernels: tuple[int, ...] = (3, 5, 7),
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.branches = nn.ModuleList(
            [
                nn.Conv1d(
                    model_dim,
                    model_dim,
                    kernel_size=_as_odd_kernel(k),
                    padding=_as_odd_kernel(k) // 2,
                    groups=model_dim,
                )
                for k in kernels
            ]
        )
        self.activation = nn.GELU()
        self.pointwise = nn.Conv1d(model_dim, model_dim, kernel_size=1)
        self.dropout = nn.Dropout(dropout)
        self.norm = nn.LayerNorm(model_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x_t = x.transpose(1, 2)
        local = self.activation(self.branches[0](x_t))
        for branch in self.branches[1:]:
            local = local + self.activation(branch(x_t))
        local = self.pointwise(local / len(self.branches))
        return self.norm(x + self.dropout(local.transpose(1, 2)))


class TemporalConvBlock(nn.Module):
    """Residual depthwise-separable dilated temporal convolution (TCN) block."""

    def __init__(
        self,
        dim: int,
        kernel_size: int = _TRAJECTORY_KERNEL,
        dilation: int = 1,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        kernel_size = _as_odd_kernel(kernel_size)
        self.depthwise = nn.Conv1d(
            dim,
            dim,
            kernel_size=kernel_size,
            padding=dilation * (kernel_size // 2),
            dilation=dilation,
            groups=dim,
        )
        self.activation = nn.GELU()
        self.pointwise = nn.Conv1d(dim, dim, kernel_size=1)
        self.dropout = nn.Dropout(dropout)
        self.norm = nn.LayerNorm(dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.pointwise(self.activation(self.depthwise(x.transpose(1, 2))))
        return self.norm(x + self.dropout(y.transpose(1, 2)))


class TrajectoryEncoder(nn.Module):
    """Encodes the shuttle trajectory and optional court positions into context tokens.

    Shuttle frames are embedded and blended with a learned *missing* token by
    their confidence, so frames with confidence 0 carry no information from
    their (meaningless) x/y values. Court positions are a separate small
    projection summed into the same tokens rather than concatenated raw into
    the pose stream (BST found raw concatenation into the pose stream hurt).
    """

    def __init__(
        self,
        shuttle_dim: int,
        position_dim: int,
        model_dim: int,
        conf_index: int | None = 2,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        if shuttle_dim == 0 and position_dim == 0:
            raise ValueError("TrajectoryEncoder needs shuttle or position channels")
        if conf_index is not None and shuttle_dim > 0 and not 0 <= conf_index < shuttle_dim:
            raise ValueError(f"shuttle_conf_index={conf_index} outside shuttle_dim={shuttle_dim}")
        self.conf_index = conf_index if shuttle_dim > 0 else None
        self.shuttle_projection = nn.Linear(shuttle_dim, model_dim) if shuttle_dim > 0 else None
        self.missing_token = nn.Parameter(torch.zeros(1, 1, model_dim))
        self.position_projection = (
            nn.Linear(position_dim, model_dim) if position_dim > 0 else None
        )
        self.norm = nn.LayerNorm(model_dim)
        self.blocks = nn.Sequential(
            *[
                TemporalConvBlock(model_dim, dilation=d, dropout=dropout)
                for d in _TRAJECTORY_DILATIONS
            ]
        )

    def forward(
        self,
        shuttle: torch.Tensor,
        position: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Return ``(context_tokens, visibility)`` with shapes ``(B, T, D)``, ``(B, T, 1)``."""
        if self.conf_index is not None:
            visibility = shuttle[..., self.conf_index : self.conf_index + 1].clamp(0.0, 1.0)
        else:
            reference = shuttle if self.shuttle_projection is not None else position
            visibility = torch.ones_like(reference[..., :1])

        tokens = (1.0 - visibility) * self.missing_token
        if self.shuttle_projection is not None:
            tokens = tokens + visibility * self.shuttle_projection(shuttle)
        if self.position_projection is not None:
            tokens = tokens + self.position_projection(position)
        return self.blocks(self.norm(tokens)), visibility


class CrossModalFusion(nn.Module):
    """Pose tokens query trajectory tokens; a learned gate controls the mix.

    The gate sees the pose token, the attended trajectory evidence and the
    *coverage* -- the share of attention mass that landed on observed shuttle
    frames -- so it can close when the shuttle is occluded or undetected.
    """

    def __init__(self, dim: int, num_heads: int, dropout: float = 0.1) -> None:
        super().__init__()
        self.query_norm = nn.LayerNorm(dim)
        self.context_norm = nn.LayerNorm(dim)
        self.attention = nn.MultiheadAttention(
            embed_dim=dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.gate = nn.Linear(2 * dim + 1, dim)
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        pose: torch.Tensor,
        context: torch.Tensor,
        visibility: torch.Tensor,
    ) -> torch.Tensor:
        context = self.context_norm(context)
        attended, weights = self.attention(
            self.query_norm(pose),
            context,
            context,
            need_weights=True,
            average_attn_weights=True,
        )
        coverage = torch.bmm(weights, visibility)
        gate = torch.sigmoid(self.gate(torch.cat([pose, attended, coverage], dim=-1)))
        return pose + self.dropout(gate * attended)


class BadmintonStrokeClassifier(nn.Module):
    """Motion-aware multimodal Transformer classifier for racket-sport stroke clips.

    Args:
        input_size: Total features per frame (``pose_dim + shuttle_dim +
            position_dim``). Defaults to 27 pose features when nothing is given.
        model_dim: Internal embedding dimension.
        hidden_size: Kept for backward compatibility. If ``model_dim`` is not
            provided by old callers, it is used as the embedding dimension.
        num_layers: Number of Transformer encoder layers.
        num_classes: Number of output stroke classes.
        dropout: Dropout rate.
        num_heads: Number of attention heads.
        max_seq_len: Maximum supported sequence length.
        temporal_kernels: Multi-scale temporal convolution kernel sizes.
        pose_dim: Leading pose channels. Defaults to ``input_size - shuttle_dim
            - position_dim``.
        shuttle_dim: Shuttle trajectory channels after the pose block, e.g.
            ``[x, y, confidence, dx, dy]``. ``0`` disables the trajectory stream.
        position_dim: Court-position channels after the shuttle block, e.g.
            hitter and opponent ``(x, y)`` in normalised court coordinates.
        shuttle_conf_index: Index *within the shuttle block* of the per-frame
            detection confidence / visibility in ``[0, 1]``; ``None`` treats every
            frame as observed.
        asf: Add the Adjacent-Stroke Fusion head. ``forward`` then accepts an
            optional ``adjacent`` tensor ``(batch, 2 * num_classes)`` holding the
            previous and next strokes' class probabilities.
    """

    def __init__(
        self,
        input_size: int | None = None,
        model_dim: int | None = None,
        hidden_size: int = 128,
        num_layers: int = 3,
        num_classes: int = 6,
        dropout: float = 0.25,
        num_heads: int = 4,
        max_seq_len: int = 120,
        temporal_kernels: tuple[int, ...] = (3, 5, 7),
        pose_dim: int | None = None,
        shuttle_dim: int = 0,
        position_dim: int = 0,
        shuttle_conf_index: int | None = 2,
        asf: bool = False,
    ) -> None:
        super().__init__()
        if model_dim is None:
            model_dim = hidden_size
        if model_dim % num_heads != 0:
            raise ValueError("model_dim must be divisible by num_heads")
        pose_dim, shuttle_dim, position_dim = resolve_input_layout(
            input_size, pose_dim, shuttle_dim, position_dim
        )

        self.pose_dim = pose_dim
        self.shuttle_dim = shuttle_dim
        self.position_dim = position_dim
        self.input_size = pose_dim + shuttle_dim + position_dim
        self.model_dim = model_dim
        self.num_classes = num_classes
        self.max_seq_len = max_seq_len
        self.asf = asf

        self.input_norm = nn.LayerNorm(pose_dim)
        self.raw_projection = nn.Linear(pose_dim, model_dim)
        self.velocity_projection = nn.Linear(pose_dim, model_dim)
        self.acceleration_projection = nn.Linear(pose_dim, model_dim)
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

        self.trajectory_encoder: TrajectoryEncoder | None = None
        self.cross_fusion: CrossModalFusion | None = None
        if shuttle_dim > 0 or position_dim > 0:
            self.trajectory_encoder = TrajectoryEncoder(
                shuttle_dim=shuttle_dim,
                position_dim=position_dim,
                model_dim=model_dim,
                conf_index=shuttle_conf_index,
                dropout=dropout,
            )
            self.cross_fusion = CrossModalFusion(model_dim, num_heads, dropout)

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
        self.transformer = nn.TransformerEncoder(
            encoder_layer,
            num_layers=num_layers,
            enable_nested_tensor=False,
        )
        self.attention = nn.MultiheadAttention(
            embed_dim=model_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.feature_norm = nn.LayerNorm(model_dim * 4)
        # Bias-free so an all-zero context (ASF stage 1) adds exactly nothing.
        self.asf_projection = (
            nn.Sequential(
                nn.Linear(2 * num_classes, model_dim, bias=False),
                nn.GELU(),
                nn.Linear(model_dim, model_dim * 4, bias=False),
            )
            if asf
            else None
        )
        self.classifier = nn.Sequential(
            nn.Linear(model_dim * 4, model_dim),
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
        if self.trajectory_encoder is not None:
            nn.init.trunc_normal_(self.trajectory_encoder.missing_token, std=0.02)
        if self.asf_projection is not None:
            # Start ASF as the identity so stage-2 training begins from the base model.
            nn.init.zeros_(self.asf_projection[-1].weight)

    def _embed_pose(self, pose: torch.Tensor) -> torch.Tensor:
        pose = self.input_norm(pose)
        velocity = temporal_difference(pose)
        acceleration = temporal_difference(velocity)

        raw = self.raw_projection(pose)
        vel = self.velocity_projection(velocity)
        acc = self.acceleration_projection(acceleration)

        gates = self.modality_gate(torch.cat([raw, vel, acc], dim=-1))
        fused = gates[..., 0:1] * raw + gates[..., 1:2] * vel + gates[..., 2:3] * acc
        return fused * 3.0**0.5

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        """Return the pooled clip embedding ``(batch, 4 * model_dim)`` before the head."""
        if x.ndim != 3:
            raise ValueError("Expected input shape (batch, seq_len, features)")
        batch_size, seq_len, width = x.shape
        if width != self.input_size:
            raise ValueError(f"Expected {self.input_size} features per frame, got {width}")
        if seq_len > self.max_seq_len:
            raise ValueError(f"seq_len={seq_len} exceeds max_seq_len={self.max_seq_len}")

        positions = self.positional_embedding[:, : seq_len + 1]
        pose_end = self.pose_dim
        shuttle_end = pose_end + self.shuttle_dim
        frames = self.temporal_stem(self._embed_pose(x[..., :pose_end])) + positions[:, 1:]

        if self.trajectory_encoder is not None and self.cross_fusion is not None:
            context, visibility = self.trajectory_encoder(
                x[..., pose_end:shuttle_end],
                x[..., shuttle_end:],
            )
            frames = self.cross_fusion(frames, context + positions[:, 1:], visibility)

        cls = self.cls_token.expand(batch_size, -1, -1) + positions[:, :1]
        encoded = self.transformer(torch.cat([cls, frames], dim=1))
        cls_token = encoded[:, :1]
        frame_tokens = encoded[:, 1:]

        attended, _ = self.attention(cls_token, frame_tokens, frame_tokens, need_weights=False)
        # ``[:, 0]`` rather than ``squeeze(1)``: the TorchScript ONNX exporter wraps
        # squeeze of a non-provable dim in an ``If`` node that onnx2tf cannot lower.
        features = torch.cat(
            [
                cls_token[:, 0],
                attended[:, 0],
                frame_tokens.mean(dim=1),
                frame_tokens.max(dim=1).values,
            ],
            dim=-1,
        )
        return self.feature_norm(features)

    def forward(
        self,
        x: torch.Tensor,
        adjacent: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Return class logits for ``x`` of shape ``(batch, seq_len, input_size)``.

        ``adjacent`` is the ASF context ``(batch, 2 * num_classes)`` = previous
        stroke probabilities followed by next stroke probabilities (zeros where
        unknown). Omitting it is identical to passing zeros (ASF stage 1).
        """
        features = self.extract_features(x)
        if adjacent is not None:
            if self.asf_projection is None:
                raise ValueError("adjacent context given but the model was built with asf=False")
            features = features + self.asf_projection(adjacent)
        return self.classifier(features)

    def predict(
        self,
        x: torch.Tensor,
        adjacent: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Run inference and return class predictions and probabilities."""
        self.eval()
        with torch.no_grad():
            probs = torch.softmax(self.forward(x, adjacent), dim=1)
        return torch.argmax(probs, dim=1), probs


StrokeClassifier = BadmintonStrokeClassifier


def adjacent_context(
    probs: torch.Tensor,
    prev_index: torch.Tensor | None = None,
    next_index: torch.Tensor | None = None,
) -> torch.Tensor:
    """Build the ASF context ``(N, 2C)`` = ``[previous probs | next probs]``.

    By default ``probs`` is one rally in stroke order. Otherwise pass explicit
    neighbour indices; ``-1`` marks "no neighbour" and yields zeros.
    """
    count = probs.shape[0]
    order = torch.arange(count, device=probs.device)
    prev_index = order - 1 if prev_index is None else prev_index.to(probs.device)
    next_index = order + 1 if next_index is None else next_index.to(probs.device)
    # Row ``count`` is all zeros; both index ``count`` and index -1 resolve to it.
    padded = torch.cat([probs, probs.new_zeros(1, probs.shape[1])], dim=0)
    return torch.cat([padded[prev_index], padded[next_index]], dim=1)


def two_stage_predict(
    model: BadmintonStrokeClassifier,
    clips: torch.Tensor,
    prev_index: torch.Tensor | None = None,
    next_index: torch.Tensor | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Two-stage Adjacent-Stroke Fusion inference over a rally.

    Stage 1 classifies every clip with zeroed context; stage 2 re-classifies
    each clip given the stage-1 probabilities of its neighbours. Models built
    without ``asf`` return the stage-1 result.

    Args:
        model: A trained classifier.
        clips: ``(num_strokes, seq_len, input_size)`` in rally order (or any
            order when explicit neighbour indices are given).
        prev_index: Optional ``(num_strokes,)`` index of each stroke's
            predecessor, ``-1`` for none.
        next_index: Optional ``(num_strokes,)`` index of each stroke's
            successor, ``-1`` for none.

    Returns:
        ``(predictions, probabilities)`` like :meth:`BadmintonStrokeClassifier.predict`.
    """
    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model(clips), dim=1)
        if model.asf:
            context = adjacent_context(probs, prev_index, next_index)
            probs = torch.softmax(model(clips, context), dim=1)
    return torch.argmax(probs, dim=1), probs


def build_model(config: Mapping[str, Any]) -> BadmintonStrokeClassifier:
    """Build the classifier from a training config / checkpoint config dict."""
    pose_dim, shuttle_dim, position_dim = resolve_input_layout(
        config.get("input_size"),
        config.get("pose_dim"),
        config.get("shuttle_dim", 0),
        config.get("position_dim", 0),
    )
    num_classes = len(get_classes(config.get("sport", DEFAULT_SPORT)))
    if config.get("num_classes") not in (None, num_classes):
        raise ValueError(
            f"num_classes={config['num_classes']} does not match the "
            f"{config.get('sport', DEFAULT_SPORT)} taxonomy ({num_classes} classes)"
        )
    return BadmintonStrokeClassifier(
        model_dim=config.get("model_dim", config.get("hidden_size", 128)),
        hidden_size=config.get("hidden_size", 128),
        num_layers=config.get("num_layers", 3),
        num_classes=num_classes,
        dropout=config.get("dropout", 0.25),
        num_heads=config.get("num_heads", 4),
        max_seq_len=config.get("max_seq_len", max(config.get("seq_len", 30), 120)),
        temporal_kernels=tuple(config.get("temporal_kernels", [3, 5, 7])),
        pose_dim=pose_dim,
        shuttle_dim=shuttle_dim,
        position_dim=position_dim,
        shuttle_conf_index=config.get("shuttle_conf_index", 2),
        asf=bool(config.get("asf", False)),
    )
