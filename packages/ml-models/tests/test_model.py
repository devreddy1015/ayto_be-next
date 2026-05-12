import pytest
import torch

from model import StrokeClassifier


class TestStrokeClassifier:
    def test_output_shape(self):
        model = StrokeClassifier(input_size=132, num_classes=6)
        x = torch.randn(4, 30, 132)
        out = model(x)
        assert out.shape == (4, 6)

    def test_predict_returns_class_and_probs(self):
        model = StrokeClassifier(input_size=132, num_classes=6)
        x = torch.randn(2, 30, 132)
        preds, probs = model.predict(x)
        assert preds.shape == (2,)
        assert probs.shape == (2, 6)
        assert torch.allclose(probs.sum(dim=1), torch.ones(2), atol=1e-5)

    def test_different_hidden_sizes(self):
        for hs in [64, 128, 256]:
            model = StrokeClassifier(input_size=132, hidden_size=hs, num_classes=6)
            x = torch.randn(2, 30, 132)
            out = model(x)
            assert out.shape == (2, 6)

    def test_single_layer(self):
        model = StrokeClassifier(input_size=132, num_layers=1, num_classes=6)
        x = torch.randn(2, 30, 132)
        out = model(x)
        assert out.shape == (2, 6)

    def test_gradient_flow(self):
        model = StrokeClassifier(input_size=132, num_classes=6)
        x = torch.randn(2, 30, 132, requires_grad=True)
        out = model(x)
        loss = out.sum()
        loss.backward()
        assert x.grad is not None

    def test_batch_size_one(self):
        model = StrokeClassifier(input_size=132, num_classes=6)
        x = torch.randn(1, 30, 132)
        out = model(x)
        assert out.shape == (1, 6)
