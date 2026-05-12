"""Unit tests for ml-models: BadmintonStrokeClassifier."""
import pytest
import torch

from dataset import normalize_label
from model import BadmintonStrokeClassifier, temporal_difference


class TestBadmintonStrokeClassifier:
    def test_output_shape(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        x = torch.randn(4, 30, 27)
        assert model(x).shape == (4, 6)

    def test_predict_returns_class_and_probs(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        x = torch.randn(2, 30, 27)
        preds, probs = model.predict(x)
        assert preds.shape == (2,)
        assert probs.shape == (2, 6)
        assert torch.allclose(probs.sum(dim=1), torch.ones(2), atol=1e-5)

    def test_different_model_dims(self) -> None:
        for dim, heads in [(64, 4), (128, 4), (192, 6)]:
            model = BadmintonStrokeClassifier(
                input_size=27,
                model_dim=dim,
                num_heads=heads,
                num_classes=6,
            )
            assert model(torch.randn(2, 30, 27)).shape == (2, 6)

    def test_gradient_flow(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        x = torch.randn(2, 30, 27, requires_grad=True)
        loss = model(x).sum()
        loss.backward()
        assert x.grad is not None

    def test_batch_size_one(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        assert model(torch.randn(1, 30, 27)).shape == (1, 6)

    def test_transformer_encoder_present(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        assert hasattr(model, "transformer")
        assert isinstance(model.transformer, torch.nn.TransformerEncoder)

    def test_attention_pooling_present(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        assert hasattr(model, "attention")
        assert isinstance(model.attention, torch.nn.MultiheadAttention)

    def test_motion_streams_present(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=96, num_heads=4, num_classes=6)
        assert hasattr(model, "raw_projection")
        assert hasattr(model, "velocity_projection")
        assert hasattr(model, "acceleration_projection")

    def test_fused_feature_widths_supported(self) -> None:
        model = BadmintonStrokeClassifier(input_size=34, model_dim=96, num_heads=4, num_classes=6)
        assert model(torch.randn(3, 40, 34)).shape == (3, 6)

    def test_seq_len_limit(self) -> None:
        model = BadmintonStrokeClassifier(
            input_size=27,
            model_dim=96,
            num_heads=4,
            num_classes=6,
            max_seq_len=30,
        )
        with pytest.raises(ValueError):
            model(torch.randn(1, 31, 27))

    def test_temporal_difference(self) -> None:
        x = torch.tensor([[[1.0], [3.0], [6.0]]])
        diff = temporal_difference(x)
        assert torch.equal(diff, torch.tensor([[[0.0], [2.0], [3.0]]]))

    def test_label_aliases(self) -> None:
        assert normalize_label("jump smash") == 0
        assert normalize_label("lob") == 2
        assert normalize_label("short service") == 4
        assert normalize_label("block") == 5
