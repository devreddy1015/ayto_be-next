from __future__ import annotations

from pathlib import Path

import torch

try:
    import onnx
except ImportError:
    onnx = None

from .model import StrokeClassifier


def export_onnx(
    model_path: str | Path,
    output_path: str | Path,
    input_size: int = 132,
    seq_len: int = 30,
    hidden_size: int = 128,
    num_layers: int = 2,
    num_classes: int = 6,
) -> Path:
    model = StrokeClassifier(
        input_size=input_size,
        hidden_size=hidden_size,
        num_layers=num_layers,
        num_classes=num_classes,
    )
    model.load_state_dict(torch.load(model_path, map_location="cpu", weights_only=True))
    model.eval()

    dummy = torch.randn(1, seq_len, input_size)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        dummy,
        str(output),
        input_names=["keypoints"],
        output_names=["logits"],
        dynamic_axes={"keypoints": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=13,
    )

    if onnx is not None:
        onnx_model = onnx.load(str(output))
        onnx.checker.check_model(onnx_model)

    print(f"Exported ONNX model to {output}")
    return output


def export_tflite_via_onnx(
    onnx_path: str | Path,
    output_path: str | Path,
) -> Path:
    try:
        import subprocess

        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["onnx2tf", "-i", str(onnx_path), "-o", str(output.parent / "tf_model")],
            check=True,
        )
        print(f"TFLite conversion initiated. Check {output.parent / 'tf_model'}")
        return output
    except FileNotFoundError:
        print("onnx2tf not found. Install via: pip install onnx2tf")
        raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", default="models/stroke_classifier.onnx")
    parser.add_argument("--format", choices=["onnx", "tflite"], default="onnx")
    args = parser.parse_args()

    if args.format == "onnx":
        export_onnx(args.model, args.output)
    elif args.format == "tflite":
        onnx_out = Path(args.output).with_suffix(".onnx")
        export_onnx(args.model, onnx_out)
        export_tflite_via_onnx(onnx_out, args.output)
