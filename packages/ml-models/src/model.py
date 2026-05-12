"""BadmintonStrokeClassifier — BiLSTM + MultiheadAttention model.

A bidirectional LSTM with multi-head attention for classifying
badminton stroke types from 30-frame pose sequences.
"""
from __future__ import annotations

import torch
import torch.nn as nn


CLASSES = ["smash", "drop", "clear", "net", "serve", "defensive"]


class BadmintonStrokeClassifier(nn.Module):
    """BiLSTM + MultiheadAttention stroke classifier.

    Architecture:
        - BatchNorm on input features
        - BiLSTM: input=27, hidden=128, layers=2, bidirectional, dropout=0.3
        - MultiheadAttention: embed_dim=256, num_heads=4
        - Classification head: Linear → ReLU → Dropout → Linear → 6 classes

    Input shape: (batch, 30, 27) — 30 frames × 27 features
    Output shape: (batch, 6) — logits for 6 stroke classes
    """

    def __init__(
        self,
        input_size: int = 27,
        hidden_size: int = 128,
        num_layers: int = 2,
        num_classes: int = 6,
        dropout: float = 0.3,
        num_heads: int = 4,
    ) -> None:
        """Initialize the classifier.

        Args:
            input_size: Number of input features per timestep.
            hidden_size: LSTM hidden state size.
            num_layers: Number of stacked LSTM layers.
            num_classes: Number of output stroke classes.
            dropout: Dropout rate.
            num_heads: Number of attention heads.
        """
        super().__init__()
        self.input_bn = nn.BatchNorm1d(input_size)
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        embed_dim = hidden_size * 2  # bidirectional → 256
        self.attention = nn.MultiheadAttention(
            embed_dim=embed_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(embed_dim, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: Input tensor of shape (batch, 30, 27).

        Returns:
            Logits of shape (batch, 6).
        """
        batch_size, seq_len, features = x.shape
        # BatchNorm across features
        x = x.reshape(batch_size * seq_len, features)
        x = self.input_bn(x)
        x = x.reshape(batch_size, seq_len, features)
        # BiLSTM
        lstm_out, _ = self.lstm(x)  # (batch, seq, hidden*2)
        # Multi-head self-attention
        attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
        # Mean pool over sequence
        context = attn_out.mean(dim=1)  # (batch, hidden*2)
        logits = self.classifier(context)
        return logits

    def predict(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Run inference and return class predictions and probabilities.

        Args:
            x: Input tensor of shape (batch, 30, 27).

        Returns:
            Tuple of (predictions, probabilities).
        """
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            probs = torch.softmax(logits, dim=1)
            preds = torch.argmax(probs, dim=1)
        return preds, probs


# Backward-compatible alias
StrokeClassifier = BadmintonStrokeClassifier


if __name__ == "__main__":
    print("BadmintonStrokeClassifier Demo")
    print("=" * 40)
    model = BadmintonStrokeClassifier(input_size=27, hidden_size=128, num_classes=6)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Total parameters: {total_params:,}")
    x = torch.randn(4, 30, 27)
    out = model(x)
    print(f"Input shape:  {tuple(x.shape)}")
    print(f"Output shape: {tuple(out.shape)}")
    preds, probs = model.predict(x)
    print(f"Predictions: {[CLASSES[p] for p in preds.tolist()]}")
    print(f"Probabilities sum: {probs.sum(dim=1).tolist()}")
