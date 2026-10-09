"""Unit tests for ml-models: BadmintonStrokeClassifier."""
from pathlib import Path

import pytest
import torch
import torch.nn as nn
import yaml
from dataset import normalize_label
from model import (
    BadmintonStrokeClassifier,
    StrokeClassifier,
    adjacent_context,
    build_model,
    resolve_input_layout,
    temporal_difference,
    two_stage_predict,
)
from stroke_taxonomy import get_classes


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


CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "default.yaml"


def _default_config(**overrides: object) -> dict:
    with open(CONFIG_PATH) as f:
        config = yaml.safe_load(f)
    config.update(overrides)
    return config


def _multimodal(**kwargs: object) -> BadmintonStrokeClassifier:
    params = {"pose_dim": 27, "shuttle_dim": 5, "position_dim": 4, "model_dim": 64, "num_heads": 4}
    params.update(kwargs)
    return BadmintonStrokeClassifier(**params).eval()


class TestMultimodalFusion:
    def test_pose_only_has_no_trajectory_stream(self) -> None:
        model = BadmintonStrokeClassifier(input_size=27, model_dim=64, num_heads=4)
        assert model.trajectory_encoder is None and model.cross_fusion is None
        assert model(torch.randn(2, 30, 27)).shape == (2, 6)

    def test_pose_shuttle_position_forward_shape(self) -> None:
        model = _multimodal()
        assert model.input_size == 36
        assert model(torch.randn(3, 45, 36)).shape == (3, 6)
        assert model.extract_features(torch.randn(3, 45, 36)).shape == (3, 4 * 64)

    def test_shuttle_without_position(self) -> None:
        model = _multimodal(position_dim=0)
        assert model(torch.randn(2, 30, 32)).shape == (2, 6)

    def test_position_without_shuttle(self) -> None:
        model = _multimodal(shuttle_dim=0, shuttle_conf_index=None)
        assert model(torch.randn(2, 30, 31)).shape == (2, 6)

    def test_core_pipeline_call_still_works(self) -> None:
        # packages/core builds StrokeClassifier(input_size=132, num_classes=6) and
        # calls predict on a single (1, T, F) tensor.
        model = StrokeClassifier(input_size=132, num_classes=6)
        preds, probs = model.predict(torch.randn(1, 30, 132))
        assert preds.shape == (1,) and probs.shape == (1, 6)
        assert model.pose_dim == 132 and model.shuttle_dim == 0

    def test_all_zero_shuttle_is_finite(self) -> None:
        model = _multimodal()
        x = torch.randn(4, 45, 36)
        x[..., 27:32] = 0.0
        _, probs = model.predict(x)
        assert torch.isfinite(probs).all()
        assert torch.allclose(probs.sum(dim=1), torch.ones(4), atol=1e-5)

    def test_unobserved_shuttle_values_are_ignored(self) -> None:
        model = _multimodal()
        x = torch.randn(2, 45, 36)
        x[..., 29] = 0.0  # visibility channel: shuttle never observed
        garbage = x.clone()
        garbage[..., 27:29] = torch.randn(2, 45, 2) * 100.0
        garbage[..., 30:32] = torch.randn(2, 45, 2) * 100.0
        with torch.no_grad():
            assert torch.allclose(model(x), model(garbage), atol=1e-5)

    def test_observed_shuttle_changes_prediction(self) -> None:
        model = _multimodal()
        x = torch.randn(2, 45, 36)
        x[..., 29] = 1.0
        moved = x.clone()
        moved[..., 27:29] += 0.5
        with torch.no_grad():
            assert not torch.allclose(model(x), model(moved))

    def test_input_width_mismatch_raises(self) -> None:
        with pytest.raises(ValueError):
            _multimodal()(torch.randn(1, 30, 27))

    def test_inconsistent_layout_raises(self) -> None:
        with pytest.raises(ValueError):
            resolve_input_layout(input_size=30, pose_dim=27, shuttle_dim=5)
        with pytest.raises(ValueError):
            BadmintonStrokeClassifier(input_size=5, shuttle_dim=5)

    def test_layout_defaults(self) -> None:
        assert resolve_input_layout() == (27, 0, 0)
        assert resolve_input_layout(input_size=36, shuttle_dim=5, position_dim=4) == (27, 5, 4)
        assert resolve_input_layout(pose_dim=27, shuttle_dim=5) == (27, 5, 0)


class TestAdjacentStrokeFusion:
    def test_zero_context_equals_stage_one(self) -> None:
        model = _multimodal(asf=True)
        x = torch.randn(3, 30, 36)
        with torch.no_grad():
            assert torch.allclose(model(x), model(x, torch.zeros(3, 12)), atol=1e-6)

    def test_adjacent_context_layout(self) -> None:
        probs = torch.tensor([[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]])
        context = adjacent_context(probs)
        assert context.shape == (3, 4)
        assert torch.equal(context[0], torch.tensor([0.0, 0.0, 0.0, 1.0]))
        assert torch.equal(context[1], torch.tensor([1.0, 0.0, 0.5, 0.5]))
        assert torch.equal(context[2], torch.tensor([0.0, 1.0, 0.0, 0.0]))
        explicit = adjacent_context(probs, torch.tensor([2, -1, -1]), torch.tensor([-1, 0, -1]))
        assert torch.equal(explicit[0], torch.tensor([0.5, 0.5, 0.0, 0.0]))
        assert torch.equal(explicit[1], torch.tensor([0.0, 0.0, 1.0, 0.0]))
        assert torch.equal(explicit[2], torch.zeros(4))

    def test_two_stage_predict(self) -> None:
        model = _multimodal(asf=True)
        nn.init.normal_(model.asf_projection[-1].weight)  # make stage 2 non-trivial
        clips = torch.randn(5, 30, 36)
        preds, probs = two_stage_predict(model, clips)
        assert preds.shape == (5,) and probs.shape == (5, 6)
        assert torch.allclose(probs.sum(dim=1), torch.ones(5), atol=1e-5)
        stage_one = model.predict(clips)[1]
        assert not torch.allclose(probs, stage_one)

    def test_two_stage_without_asf_is_stage_one(self) -> None:
        model = _multimodal()
        clips = torch.randn(4, 30, 36)
        assert torch.allclose(two_stage_predict(model, clips)[1], model.predict(clips)[1])

    def test_context_requires_asf(self) -> None:
        with pytest.raises(ValueError):
            _multimodal()(torch.randn(1, 30, 36), torch.zeros(1, 12))


class TestConfigBuild:
    def test_default_config_is_multimodal_and_within_budget(self) -> None:
        for asf in (False, True):
            model = build_model(_default_config(asf=asf))
            assert model.shuttle_dim > 0 and model.position_dim > 0
            assert sum(p.numel() for p in model.parameters()) < 2_000_000
            seq_len = _default_config()["seq_len"]
            assert model(torch.randn(2, seq_len, model.input_size)).shape == (2, 6)

    def test_sport_selects_class_count(self) -> None:
        model = build_model({"sport": "tennis", "input_size": 27, "model_dim": 32, "num_heads": 4})
        assert model.num_classes == len(get_classes("tennis"))
        assert model(torch.randn(1, 30, 27)).shape == (1, model.num_classes)

    def test_num_classes_must_match_sport(self) -> None:
        with pytest.raises(ValueError):
            build_model({"sport": "squash", "num_classes": 6})

    def test_onnx_export_default_config(self, tmp_path: Path) -> None:
        onnx = pytest.importorskip("onnx")
        pytest.importorskip("onnxscript")
        from export import export_classifier_onnx

        model = build_model(_default_config()).eval()
        seq_len = _default_config()["seq_len"]
        path = export_classifier_onnx(model, tmp_path / "stroke.onnx", seq_len)
        graph = onnx.load(str(path)).graph
        assert [i.name for i in graph.input] == ["keypoints"]
        assert not {node.op_type for node in graph.node} & {"If", "Loop", "ScatterND"}

        from onnx.reference import ReferenceEvaluator

        x = torch.randn(3, seq_len, model.input_size)  # batch differs from the export example
        got = ReferenceEvaluator(str(path)).run(None, {"keypoints": x.numpy()})[0]
        with torch.no_grad():
            assert torch.allclose(torch.from_numpy(got), model(x), atol=1e-4)
