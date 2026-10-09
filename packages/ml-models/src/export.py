"""Model export: ONNX, TFLite (INT8) and CoreML.

The stroke classifier graph has one input ``keypoints`` of shape
``(batch, seq_len, input_size)`` in the ``[pose | shuttle | position]`` layout
and one output ``logits``. Models trained with ``asf: true`` take a second
input ``adjacent`` ``(batch, 2 * num_classes)`` (zeros for stage 1).

The architecture is always rebuilt from the checkpoint's embedded training
config (or an explicit config for bare state dicts), so export cannot drift
from training.
"""
from __future__ import annotations

import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np
import torch

try:
    import onnx
except ImportError:
    onnx = None

try:
    import yaml
except ImportError:
    yaml = None

try:
    from .model import BadmintonStrokeClassifier, build_model
except ImportError:
    from model import BadmintonStrokeClassifier, build_model

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "default.yaml"
# The dynamo exporter emits opset 18 natively (no lossy down-conversion).
DEFAULT_OPSET = 18

ConfigLike = Mapping[str, Any] | str | Path | None


def load_model(
    model_path: str | Path,
    config: ConfigLike = None,
) -> tuple[BadmintonStrokeClassifier, dict[str, Any]]:
    """Load a trained classifier in eval mode.

    Full checkpoints (``stroke_classifier.ckpt``) carry their config. Bare state
    dicts (``stroke_classifier.pt``) are rebuilt from ``config`` -- a dict or a
    YAML path, defaulting to ``configs/default.yaml``.
    """
    state_dict, checkpoint_config = _load_state_dict(model_path)
    resolved = dict(checkpoint_config) if checkpoint_config else _read_config(config)
    model = build_model(resolved)
    model.load_state_dict(state_dict)
    model.eval()
    return model, resolved


def example_inputs(
    model: BadmintonStrokeClassifier,
    seq_len: int,
    batch_size: int = 2,
) -> tuple[torch.Tensor, ...]:
    """Dummy inputs matching the model's export signature.

    The default batch of 2 keeps ``torch.export`` from specialising the batch
    axis to 1.
    """
    x = torch.randn(batch_size, seq_len, model.input_size)
    if model.asf:
        return x, torch.zeros(batch_size, 2 * model.num_classes)
    return (x,)


def input_names(model: BadmintonStrokeClassifier) -> list[str]:
    return ["keypoints", "adjacent"] if model.asf else ["keypoints"]


def export_module_onnx(
    model: torch.nn.Module,
    inputs: tuple[torch.Tensor, ...],
    output_path: str | Path,
    names: Sequence[str],
    output_names: Sequence[str] = ("logits",),
    opset: int = DEFAULT_OPSET,
) -> Path:
    """Export an in-memory module to a single-file ONNX graph with a dynamic batch axis."""
    model.eval()
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    batch = torch.export.Dim("batch_size", min=1, max=4096)
    torch.onnx.export(
        model,
        inputs,
        str(output),
        input_names=list(names),
        output_names=list(output_names),
        dynamic_shapes=tuple({0: batch} for _ in inputs),
        opset_version=opset,
        dynamo=True,
        external_data=False,
    )
    if onnx is not None:
        onnx.checker.check_model(onnx.load(str(output)))
    return output


def export_classifier_onnx(
    model: BadmintonStrokeClassifier,
    output_path: str | Path,
    seq_len: int,
    opset: int = DEFAULT_OPSET,
) -> Path:
    """Export an in-memory stroke classifier (``keypoints`` [+ ``adjacent``] -> ``logits``)."""
    return export_module_onnx(
        model,
        example_inputs(model, seq_len),
        output_path,
        input_names(model),
        opset=opset,
    )


def export_onnx(
    model_path: str | Path,
    output_path: str | Path,
    config: ConfigLike = None,
    seq_len: int | None = None,
    opset: int | None = None,
) -> Path:
    """Export a saved checkpoint to ONNX.

    Args:
        model_path: ``.ckpt`` checkpoint or ``.pt`` state dict.
        output_path: Destination ``.onnx`` file.
        config: Config for bare state dicts (see :func:`load_model`).
        seq_len: Clip length baked into the graph; defaults to the config's.
        opset: ONNX opset; defaults to the config's ``onnx_opset``.
    """
    model, resolved = load_model(model_path, config)
    output = export_classifier_onnx(
        model,
        output_path,
        int(seq_len or resolved.get("seq_len", 30)),
        int(opset or resolved.get("onnx_opset", DEFAULT_OPSET)),
    )
    print(f"Exported ONNX model to {output}")
    return output


def export_tflite(
    model_path: str | Path,
    output_path: str | Path,
    config: ConfigLike = None,
    quantize_int8: bool = True,
    calibration_data: np.ndarray | None = None,
) -> Path:
    """Export to TFLite via ONNX -> onnx2tf SavedModel -> TFLiteConverter.

    Args:
        model_path: ``.ckpt`` checkpoint or ``.pt`` state dict.
        output_path: Destination ``.tflite`` file.
        config: Config for bare state dicts.
        quantize_int8: Full-integer INT8 quantization for mobile.
        calibration_data: ``(N, seq_len, input_size)`` real clips for INT8
            calibration. Random data is used (with a warning) if omitted, which
            gives poor activation ranges.
    """
    try:
        import tensorflow as tf
    except ImportError:
        raise ImportError(
            "tensorflow and onnx2tf are required for TFLite export — "
            "pip install tensorflow onnx2tf"
        ) from None

    model, resolved = load_model(model_path, config)
    seq_len = int(resolved.get("seq_len", 30))
    onnx_path = export_classifier_onnx(
        model,
        Path(output_path).with_suffix(".onnx"),
        seq_len,
        int(resolved.get("onnx_opset", DEFAULT_OPSET)),
    )
    tf_model_dir = Path(output_path).parent / "tf_saved_model"
    # ``-k`` keeps the (batch, time, features) inputs as-is instead of letting
    # onnx2tf treat them as NCW and transpose them to NWC.
    subprocess.run(
        ["onnx2tf", "-i", str(onnx_path), "-o", str(tf_model_dir), "-k", *input_names(model)],
        check=True,
    )

    converter = tf.lite.TFLiteConverter.from_saved_model(str(tf_model_dir))
    if quantize_int8:
        if calibration_data is None:
            print("WARNING: no calibration data — INT8 ranges calibrated on random inputs")
            calibration_data = np.random.randn(100, seq_len, model.input_size)
        calibration = np.asarray(calibration_data, dtype=np.float32)
        context = np.zeros((1, 2 * model.num_classes), dtype=np.float32)

        def representative_dataset() -> Any:
            for clip in calibration:
                yield [clip[None], context] if model.asf else [clip[None]]

        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = representative_dataset
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(converter.convert())
    print(f"Exported TFLite model to {output} (INT8={quantize_int8})")
    return output


def export_coreml(
    model_path: str | Path,
    output_path: str | Path,
    config: ConfigLike = None,
) -> Path:
    """Export to a CoreML ``mlprogram`` for iOS deployment."""
    try:
        import coremltools as ct
    except ImportError:
        raise ImportError("coremltools is required — pip install coremltools") from None

    model, resolved = load_model(model_path, config)
    inputs = example_inputs(model, int(resolved.get("seq_len", 30)), batch_size=1)
    traced = torch.jit.trace(model, inputs)
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name=name, shape=tuple(tensor.shape))
            for name, tensor in zip(input_names(model), inputs, strict=True)
        ],
        convert_to="mlprogram",
    )

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    mlmodel.save(str(output))
    print(f"Exported CoreML model to {output}")
    return output


def _read_config(config: ConfigLike) -> dict[str, Any]:
    if isinstance(config, Mapping):
        return dict(config)
    if yaml is None:
        raise ImportError("pyyaml is required to read a config file — pip install pyyaml")
    with open(config or DEFAULT_CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _load_state_dict(model_path: str | Path) -> tuple[dict, dict]:
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"], checkpoint.get("config", {})
    if isinstance(checkpoint, dict):
        return checkpoint, {}
    raise ValueError(f"Unsupported checkpoint format: {model_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Export a trained stroke classifier")
    parser.add_argument("--model", required=True, help="Path to .ckpt checkpoint or .pt weights")
    parser.add_argument("--output", default="models/stroke_classifier.onnx")
    parser.add_argument("--format", choices=["onnx", "tflite", "coreml"], default="onnx")
    parser.add_argument("--config", help="Training config for bare .pt state dicts")
    parser.add_argument("--quantize", action="store_true", help="INT8 quantization (TFLite)")
    parser.add_argument("--calibration", help=".npy of (N, seq_len, input_size) clips for INT8")
    args = parser.parse_args()

    if args.format == "onnx":
        export_onnx(args.model, args.output, config=args.config)
    elif args.format == "tflite":
        export_tflite(
            args.model,
            args.output,
            config=args.config,
            quantize_int8=args.quantize,
            calibration_data=np.load(args.calibration) if args.calibration else None,
        )
    elif args.format == "coreml":
        export_coreml(args.model, args.output, config=args.config)
