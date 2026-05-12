from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F


class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000, dropout: float = 0.1) -> None:
        super().__init__()
        self.dropout = nn.Dropout(dropout)
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.dropout(x + self.pe[: x.size(1)])


class TemporalAttentionBlock(nn.Module):
    def __init__(self, dim: int, num_heads: int = 8, mlp_ratio: float = 4.0, dropout: float = 0.1) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(dim)
        self.attn = nn.MultiheadAttention(
            dim, num_heads, dropout=dropout, batch_first=True
        )
        self.norm2 = nn.LayerNorm(dim)
        self.mlp = nn.Sequential(
            nn.Linear(dim, int(dim * mlp_ratio)),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(int(dim * mlp_ratio), dim),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        normed = self.norm1(x)
        attn_out, _ = self.attn(normed, normed, normed)
        x = x + attn_out
        x = x + self.mlp(self.norm2(x))
        return x


class CrossModalFusion(nn.Module):
    """Fuses pose keypoints with shuttle velocity using cross-attention (MotionFormer-inspired)."""

    def __init__(self, pose_dim: int, shuttle_dim: int, fusion_dim: int, num_heads: int = 4) -> None:
        super().__init__()
        self.pose_proj = nn.Linear(pose_dim, fusion_dim)
        self.shuttle_proj = nn.Linear(shuttle_dim, fusion_dim)
        self.cross_attn = nn.MultiheadAttention(
            fusion_dim, num_heads, batch_first=True
        )
        self.norm = nn.LayerNorm(fusion_dim)
        self.gate = nn.Sequential(
            nn.Linear(fusion_dim * 2, fusion_dim),
            nn.Sigmoid(),
        )

    def forward(
        self, pose_features: torch.Tensor, shuttle_features: torch.Tensor
    ) -> torch.Tensor:
        p = self.pose_proj(pose_features)   # (B, T, D)
        s = self.shuttle_proj(shuttle_features)
        fused, _ = self.cross_attn(p, s, s)
        fused = self.norm(fused + p)

        gate_val = self.gate(torch.cat([fused, p], dim=-1))
        return gate_val * fused + (1 - gate_val) * p


class SportFormer(nn.Module):
    """
    SportFormer: Transformer-based stroke classifier.

    Architecture (inspired by VideoMAE + MotionFormer):
    1. Input projection: (B, T, 132) → (B, T, 256) embedding
    2. Positional encoding
    3. 4× Temporal Transformer blocks with self-attention
    4. Cross-modal fusion with shuttle velocity features
    5. CLS token pooling → classification head

    Advantages over BiLSTM:
    - Global temporal context via self-attention
    - Better long-range dependency modeling (30 frames)
    - Cross-modal fusion: pose + shuttle velocity
    - Supports masked pose modeling pretraining

    Target: >92% accuracy on 6-class stroke classification
    """

    STROKE_CLASSES = ["smash", "drop", "clear", "net", "serve", "defensive"]

    def __init__(
        self,
        pose_dim: int = 132,
        shuttle_dim: int = 4,
        hidden_dim: int = 256,
        num_layers: int = 4,
        num_heads: int = 8,
        num_classes: int = 6,
        dropout: float = 0.1,
        use_cross_modal: bool = True,
    ) -> None:
        super().__init__()

        self.use_cross_modal = use_cross_modal
        self.cls_token = nn.Parameter(torch.randn(1, 1, hidden_dim))

        self.input_proj = nn.Sequential(
            nn.Linear(pose_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.Dropout(dropout),
        )

        self.pos_encoding = PositionalEncoding(hidden_dim, dropout=dropout)

        self.transformer_blocks = nn.ModuleList([
            TemporalAttentionBlock(hidden_dim, num_heads, dropout=dropout)
            for _ in range(num_layers)
        ])

        if use_cross_modal:
            self.fusion = CrossModalFusion(
                pose_dim=hidden_dim,
                shuttle_dim=shuttle_dim,
                fusion_dim=hidden_dim,
                num_heads=num_heads // 2,
            )

        self.norm = nn.LayerNorm(hidden_dim)
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_classes),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(
        self,
        pose_sequence: torch.Tensor,
        shuttle_features: torch.Tensor | None = None,
    ) -> torch.Tensor:
        B, T, _ = pose_sequence.shape

        x = self.input_proj(pose_sequence)

        cls_tokens = self.cls_token.expand(B, -1, -1)
        x = torch.cat([cls_tokens, x], dim=1)  # (B, 1+T, 256)

        x = self.pos_encoding(x)

        for block in self.transformer_blocks:
            x = block(x)

        if self.use_cross_modal and shuttle_features is not None:
            pose_part = x[:, 1:, :]
            cls_part = x[:, :1, :]
            fused = self.fusion(pose_part, shuttle_features)
            x = torch.cat([cls_part, fused], dim=1)

        x = self.norm(x[:, 0, :])  # CLS token
        return self.classifier(x)

    def predict(
        self,
        pose_sequence: torch.Tensor,
        shuttle_features: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        self.eval()
        with torch.no_grad():
            logits = self.forward(pose_sequence, shuttle_features)
            probs = F.softmax(logits, dim=1)
            preds = torch.argmax(probs, dim=1)
        return preds, probs

    def masked_pretrain_forward(
        self, pose_sequence: torch.Tensor, mask_ratio: float = 0.75
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """VideoMAE-style masked pretraining: reconstruct masked frames."""
        B, T, D = pose_sequence.shape
        mask = torch.rand(B, T, 1, device=pose_sequence.device) > mask_ratio
        mask = mask.float()

        x_masked = pose_sequence * mask
        x = self.input_proj(x_masked)
        x = self.pos_encoding(x)

        for block in self.transformer_blocks:
            x = block(x)

        reconstructed = self.reconstruction_head(x)
        return reconstructed, mask

    def add_reconstruction_head(self) -> None:
        self.reconstruction_head = nn.Linear(256, 132)
