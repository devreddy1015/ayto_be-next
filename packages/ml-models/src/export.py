"""Model export: ONNX, TFLite, and CoreML with INT8 quantization.

Provides functions to export the trained BadmintonStrokeClassifier
to mobile-friendly formats for on-device inference.
"""
from __future__ import annotations

from pathlib import Path

import torch

try:
    import onnx
except ImportError:
    onnx = None

try:
    from .model import BadmintonStrokeClassifier
except ImportError:
    from model import BadmintonStrokeClassifier


def export_onnx(
    model_path: str | Path,
    output_path: str | Path,
    input_size: int = 27,
    seq_len: int = 30,
    hidden_size: int = 128,
    model_dim: int | None = None,
    num_layers: int = 2,
    num_classes: int = 6,
    num_heads: int = 4,
) -> Path:
    """Export model to ONNX format.

    Args:
        model_path: Path to the saved .pt model state dict.
        output_path: Destination path for the .onnx file.
        input_size: Number of input features per timestep.
        seq_len: Sequence length.
        hidden_size: Backward-compatible model dimension fallback.
        model_dim: Transformer embedding size.
        num_layers: Number of Transformer encoder layers.
        num_classes: Number of output classes.

    Returns:
        Path to the exported ONNX model.
    """
    state_dict, checkpoint_config = _load_state_dict(model_path)
    input_size = int(checkpoint_config.get("input_size", input_size))
    seq_len = int(checkpoint_config.get("seq_len", seq_len))
    hidden_size = int(checkpoint_config.get("hidden_size", hidden_size))
    model_dim = int(checkpoint_config.get("model_dim", model_dim or hidden_size))
    num_layers = int(checkpoint_config.get("num_layers", num_layers))
    num_classes = int(checkpoint_config.get("num_classes", num_classes))
    num_heads = int(checkpoint_config.get("num_heads", num_heads))

    model = BadmintonStrokeClassifier(
        input_size=input_size,
        model_dim=model_dim,
        hidden_size=hidden_size,
        num_layers=num_layers,
        num_classes=num_classes,
        num_heads=num_heads,
    )
    model.load_state_dict(state_dict)
    model.eval()

    dummy = torch.randn(1, seq_len, input_size)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model, dummy, str(output),
        input_names=["keypoints"], output_names=["logits"],
        dynamic_axes={"keypoints": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=13,
    )

    if onnx is not None:
        onnx_model = onnx.load(str(output))
        onnx.checker.check_model(onnx_model)

    print(f"Exported ONNX model to {output}")
    return output


def export_tflite(
    model_path: str | Path,
    output_path: str | Path,
    input_size: int = 27,
    seq_len: int = 30,
    quantize_int8: bool = True,
) -> Path:
    """Export model to TFLite format with optional INT8 quantization.

    Converts PyTorch → ONNX → TensorFlow → TFLite.

    Args:
        model_path: Path to the saved .pt model.
        output_path: Destination path for .tflite file.
        input_size: Input feature dimension.
        seq_len: Sequence length.
        quantize_int8: If True, apply INT8 quantization for mobile.

    Returns:
        Path to the exported TFLite model.
    """
    try:
        import numpy as np
        import tensorflow as tf
    except ImportError:
        raise ImportError("tensorflow is required for TFLite export — pip install tensorflow")

    # Step 1: Export to ONNX first
    onnx_path = Path(output_path).with_suffix(".onnx")
    export_onnx(model_path, onnx_path, input_size=input_size, seq_len=seq_len)

    # Step 2: Convert ONNX to TF SavedModel via onnx2tf or onnx_tf
    try:
        from onnx_tf.backend import prepare
        onnx_model = onnx.load(str(onnx_path))
        tf_rep = prepare(onnx_model)
        tf_model_dir = Path(output_path).parent / "tf_saved_model"
        tf_rep.export_graph(str(tf_model_dir))
    except ImportError:
        # Fallback: try onnx2tf CLI
        import subprocess
        tf_model_dir = Path(output_path).parent / "tf_saved_model"
        subprocess.run(
            ["onnx2tf", "-i", str(onnx_path), "-o", str(tf_model_dir)],
            check=True,
        )

    # Step 3: Convert to TFLite
    converter = tf.lite.TFLiteConverter.from_saved_model(str(tf_model_dir))
    if quantize_int8:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        # Representative dataset for quantization
        def representative_dataset():
            for _ in range(100):
                yield [np.random.randn(1, seq_len, input_size).astype(np.float32)]
        converter.representative_dataset = representative_dataset
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8

    tflite_model = converter.convert()
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(tflite_model)
    print(f"Exported TFLite model to {output} (INT8={quantize_int8})")
    return output


def export_coreml(
    model_path: str | Path,
    output_path: str | Path,
    input_size: int = 27,
    seq_len: int = 30,
) -> Path:
    """Export model to CoreML format for iOS deployment.

    Args:
        model_path: Path to the saved .pt model.
        output_path: Destination path for .mlmodel file.
        input_size: Input feature dimension.
        seq_len: Sequence length.

    Returns:
        Path to the exported CoreML model.
    """
    try:
        import coremltools as ct
    except ImportError:
        raise ImportError("coremltools is required — pip install coremltools")

    state_dict, checkpoint_config = _load_state_dict(model_path)
    input_size = int(checkpoint_config.get("input_size", input_size))
    seq_len = int(checkpoint_config.get("seq_len", seq_len))
    model = BadmintonStrokeClassifier(
        input_size=input_size,
        model_dim=checkpoint_config.get("model_dim"),
        hidden_size=checkpoint_config.get("hidden_size", 128),
        num_layers=checkpoint_config.get("num_layers", 3),
        num_heads=checkpoint_config.get("num_heads", 4),
    )
    model.load_state_dict(state_dict)
    model.eval()

    dummy = torch.randn(1, seq_len, input_size)
    traced = torch.jit.trace(model, dummy)

    mlmodel = ct.convert(
        traced,
        inputs=[ct.TensorType(name="keypoints", shape=(1, seq_len, input_size))],
        convert_to="mlprogram",
    )

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    mlmodel.save(str(output))
    print(f"Exported CoreML model to {output}")
    return output


def _load_state_dict(model_path: str | Path) -> tuple[dict, dict]:
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"], checkpoint.get("config", {})
    if isinstance(checkpoint, dict):
        return checkpoint, {}
    raise ValueError(f"Unsupported checkpoint format: {model_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Export trained model")
    parser.add_argument("--model", required=True, help="Path to .pt model")
    parser.add_argument("--output", default="models/stroke_classifier.onnx")
    parser.add_argument("--format", choices=["onnx", "tflite", "coreml"], default="onnx")
    parser.add_argument("--quantize", action="store_true", help="INT8 quantization")
    args = parser.parse_args()

    if args.format == "onnx":
        export_onnx(args.model, args.output)
    elif args.format == "tflite":
        export_tflite(args.model, args.output, quantize_int8=args.quantize)
    elif args.format == "coreml":
        export_coreml(args.model, args.output)
