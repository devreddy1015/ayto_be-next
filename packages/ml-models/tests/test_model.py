"""Unit tests for ml-models: BadmintonStrokeClassifier."""
import pytest
import torch

from model import BadmintonStrokeClassifier


class TestBadmintonStrokeClassifier:
    def test_output_shape(self) -> None:
        """(batch=4, seq=30, feat=27) → (4, 6)."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        x = torch.randn(4, 30, 27)
        assert model(x).shape == (4, 6)

    def test_predict_returns_class_and_probs(self) -> None:
        """predict() returns integer labels and valid probability distributions."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        x = torch.randn(2, 30, 27)
        preds, probs = model.predict(x)
        assert preds.shape == (2,)
        assert probs.shape == (2, 6)
        assert torch.allclose(probs.sum(dim=1), torch.ones(2), atol=1e-5)

    def test_different_hidden_sizes(self) -> None:
        """Model works with various hidden sizes."""
        for hs in [64, 128, 256]:
            model = BadmintonStrokeClassifier(input_size=27, hidden_size=hs, num_classes=6)
            assert model(torch.randn(2, 30, 27)).shape == (2, 6)

    def test_single_layer(self) -> None:
        """Single-layer LSTM variant works."""
        model = BadmintonStrokeClassifier(input_size=27, num_layers=1, num_classes=6)
        assert model(torch.randn(2, 30, 27)).shape == (2, 6)

    def test_gradient_flow(self) -> None:
        """Gradients flow through the entire model."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        x = torch.randn(2, 30, 27, requires_grad=True)
        loss = model(x).sum()
        loss.backward()
        assert x.grad is not None

    def test_batch_size_one(self) -> None:
        """Works with a single sample."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        assert model(torch.randn(1, 30, 27)).shape == (1, 6)

    def test_multihead_attention_present(self) -> None:
        """Model uses nn.MultiheadAttention."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        assert hasattr(model, "attention")
        assert isinstance(model.attention, torch.nn.MultiheadAttention)

    def test_bidirectional_lstm(self) -> None:
        """LSTM is bidirectional."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        assert model.lstm.bidirectional is True

    def test_six_classes(self) -> None:
        """Output has exactly 6 classes."""
        model = BadmintonStrokeClassifier(input_size=27, num_classes=6)
        x = torch.randn(3, 30, 27)
        out = model(x)
        assert out.shape[-1] == 6
