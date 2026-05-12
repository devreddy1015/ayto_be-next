from __future__ import annotations

import torch
import torch.nn as nn


class Attention(nn.Module):
    def __init__(self, hidden_size: int) -> None:
        super().__init__()
        self.attention = nn.Sequential(
            nn.Linear(hidden_size * 2, hidden_size),
            nn.Tanh(),
            nn.Linear(hidden_size, 1),
        )

    def forward(self, lstm_output: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        weights = self.attention(lstm_output).squeeze(-1)
        weights = torch.softmax(weights, dim=1)
        context = torch.bmm(weights.unsqueeze(1), lstm_output).squeeze(1)
        return context, weights


class StrokeClassifier(nn.Module):
    def __init__(
        self,
        input_size: int = 132,
        hidden_size: int = 128,
        num_layers: int = 2,
        num_classes: int = 6,
        dropout: float = 0.3,
    ) -> None:
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
        self.attention = Attention(hidden_size)
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size * 2, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch_size, seq_len, features = x.shape
        x = x.reshape(batch_size * seq_len, features)
        x = self.input_bn(x)
        x = x.reshape(batch_size, seq_len, features)

        lstm_out, _ = self.lstm(x)
        context, attn_weights = self.attention(lstm_out)
        logits = self.classifier(context)
        return logits

    def predict(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            probs = torch.softmax(logits, dim=1)
            preds = torch.argmax(probs, dim=1)
        return preds, probs
