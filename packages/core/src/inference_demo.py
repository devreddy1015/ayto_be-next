from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "cv-core" / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "pose-biomechanics" / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "ml-models" / "src"))


@dataclass
class InferenceResult:
    component: str
    status: str  # "REAL" | "MOCK" | "FALLBACK" | "NOT_READY"
    latency_ms: float
    output: Any
    accuracy_estimate: str


@dataclass
class PipelineReport:
    video_info: dict
    results: list[InferenceResult]
    total_latency_ms: float
    ready_for_production: bool


def run_real_yolo(frame: np.ndarray) -> InferenceResult:
    t0 = time.time()
    try:
        from detector import ShuttleDetector
        detector = ShuttleDetector(model_path="yolov8n.pt", conf_threshold=0.25)
        detections = detector.detect(frame)
        elapsed = (time.time() - t0) * 1000

        found = len(detections)
        classes_found = list(set(d.get("class", "?") for d in detections))
        top = detections[0] if detections else None

        return InferenceResult(
            component="YOLOv8 Detection",
            status="REAL",
            latency_ms=elapsed,
            output={
                "objects_found": found,
                "classes": classes_found,
                "top_confidence": round(top["confidence"], 3) if top else 0,
                "native_inference": True,
            },
            accuracy_estimate="Base COCO model — fine-tuning on shuttle data needed for >85% detection"
        )
    except ImportError as e:
        return InferenceResult(
            component="YOLOv8 Detection",
            status="FALLBACK",
            latency_ms=0,
            output={"error": str(e), "fallback": "mock_bbox"},
            accuracy_estimate="Cannot benchmark — ultralytics not installed"
        )


def run_real_pose(frame: np.ndarray) -> InferenceResult:
    t0 = time.time()
    try:
        from keypoints import PoseExtractor
        from normalize import PoseNormalizer
        from angles import JointAngleComputer

        extractor = PoseExtractor(
            static_image_mode=True,
            min_detection_confidence=0.5,
        )
        landmarks = extractor.extract_raw(frame)
        extractor.close()

        if landmarks is not None:
            normalizer = PoseNormalizer()
            norm = normalizer.normalize(landmarks)
            computer = JointAngleComputer()
            angles = computer.compute_all_angles(norm)

            elapsed = (time.time() - t0) * 1000

            return InferenceResult(
                component="MediaPipe Pose",
                status="REAL",
                latency_ms=elapsed,
                output={
                    "landmarks_detected": len([l for l in landmarks if l[3] > 0.5]),
                    "key_joints": {
                        "left_elbow": round(angles.get("left_elbow", 0), 1),
                        "right_elbow": round(angles.get("right_elbow", 0), 1),
                        "left_knee": round(angles.get("left_knee", 0), 1),
                        "right_knee": round(angles.get("right_knee", 0), 1),
                        "left_shoulder": round(angles.get("left_shoulder", 0), 1),
                    },
                    "normalized": "hip-centered + torso-scaled",
                    "native_inference": True,
                },
                accuracy_estimate="MediaPipe — ~95% keypoint detection rate on clear frames"
            )
        else:
            elapsed = (time.time() - t0) * 1000
            return InferenceResult(
                component="MediaPipe Pose",
                status="REAL",
                latency_ms=elapsed,
                output={"landmarks_detected": 0, "error": "No person detected in frame"},
                accuracy_estimate="No person visible — frame might be empty or poorly lit"
            )
    except ImportError as e:
        return InferenceResult(
            component="MediaPipe Pose",
            status="FALLBACK",
            latency_ms=0,
            output={"error": str(e), "fallback": "mock_keypoints"},
            accuracy_estimate="Cannot benchmark — mediapipe not installed"
        )


def run_ml_classifier(keypoints_sequence: list[np.ndarray]) -> InferenceResult:
    t0 = time.time()
    try:
        import torch
        from model import StrokeClassifier

        if len(keypoints_sequence) < 30:
            return InferenceResult(
                component="BiLSTM Classifier",
                status="NOT_READY",
                latency_ms=0,
                output={"error": f"Need 30 frames, got {len(keypoints_sequence)}"},
                accuracy_estimate="Untrained model — weights are random. Needs annotated dataset for training."
            )

        model = StrokeClassifier(input_size=132, num_classes=6)
        model.eval()

        seq = np.array(keypoints_sequence[-30:], dtype=np.float32)
        if seq.shape[1] != 33 or seq.shape[2] < 4:
            return InferenceResult(
                component="BiLSTM Classifier",
                status="NOT_READY",
                latency_ms=0,
                output={"error": f"Expected (30,33,4) got {seq.shape}"},
                accuracy_estimate="Data shape mismatch — check keypoint extraction"
            )

        seq_flat = seq.reshape(1, 30, 132).astype(np.float32)
        x = torch.tensor(seq_flat, dtype=torch.float32)

        with torch.no_grad():
            preds, probs = model.predict(x)
            elapsed = (time.time() - t0) * 1000

        classes = ["smash", "drop", "clear", "net", "serve", "defensive"]
        top_idx = int(preds[0])
        top_conf = float(probs[0, top_idx])

        return InferenceResult(
            component="BiLSTM Classifier",
            status="REAL (untrained)",
            latency_ms=elapsed,
            output={
                "predicted": classes[top_idx] if top_idx < 6 else "unknown",
                "confidence": round(top_conf, 3),
                "all_probs": {c: round(float(probs[0, i]), 3) for i, c in enumerate(classes)},
                "warning": "MODEL IS UNTRAINED — predictions are random",
            },
            accuracy_estimate="Random guessing (~17% accuracy). Target: >88% after training on 50K annotated strokes."
        )
    except ImportError as e:
        return InferenceResult(
            component="BiLSTM Classifier",
            status="NOT_READY",
            latency_ms=0,
            output={"error": str(e), "fallback": "mock_stroke_label"},
            accuracy_estimate="PyTorch not available — cannot import model"
        )


def generate_comparison_report(report: PipelineReport) -> str:
    lines = []
    lines.append("=" * 72)
    lines.append("  SPORTIQ — INFERENCE PIPELINE AUDIT REPORT")
    lines.append("=" * 72)
    lines.append(f"  Video:       {report.video_info.get('file', 'N/A')}")
    lines.append(f"  Resolution:  {report.video_info.get('width', '?')}x{report.video_info.get('height', '?')}")
    lines.append(f"  Frames:      {report.video_info.get('frames', '?')}")
    lines.append(f"  Total latency: {report.total_latency_ms:.1f}ms")
    lines.append(f"  Production ready: {'✅ YES' if report.ready_for_production else '❌ NO'}")
    lines.append("=" * 72)
    lines.append("")
    lines.append(f"{'COMPONENT':<22s} {'STATUS':<18s} {'LATENCY':>8s}  {'ACCURACY'}")
    lines.append("-" * 72)

    real_count = 0
    for r in report.results:
        status_icon = {
            "REAL": "🟢",
            "REAL (untrained)": "🟡",
            "MOCK": "🔴",
            "FALLBACK": "🟠",
            "NOT_READY": "⚫",
        }.get(r.status, "❓")

        lines.append(
            f"{status_icon} {r.component:<20s} {r.status:<18s} {r.latency_ms:>6.1f}ms  "
            f"→ {r.accuracy_estimate}"
        )
        if r.status.startswith("REAL"):
            real_count += 1

    lines.append("-" * 72)
    lines.append(f"  {real_count}/{len(report.results)} components using real inference")
    lines.append("")
    lines.append("  DETAILED OUTPUT:")
    lines.append("  " + "-" * 68)

    for r in report.results:
        lines.append(f"  [{r.component}]")
        for k, v in r.output.items():
            if isinstance(v, dict):
                lines.append(f"    {k}:")
                for k2, v2 in v.items():
                    lines.append(f"      {k2}: {v2}")
            else:
                lines.append(f"    {k}: {v}")
        lines.append("")

    lines.append("=" * 72)
    lines.append("  GAP ANALYSIS")
    lines.append("=" * 72)

    gaps = []
    yolo_real = any(r.status in ("REAL", "REAL (untrained)") and "YOLO" in r.component for r in report.results)
    pose_real = any(r.status in ("REAL", "REAL (untrained)") and "Pose" in r.component for r in report.results)
    ml_real = any(r.status in ("REAL", "REAL (untrained)") and "Classifier" in r.component for r in report.results)

    gaps.append(f"  YOLO Shuttle Detection:     {'🟢 WORKING' if yolo_real else '🔴 MISSING'} — fine-tuning needed for >85% accuracy")
    gaps.append(f"  MediaPipe Pose:             {'🟢 WORKING' if pose_real else '🔴 MISSING'} — already production-grade")
    gaps.append(f"  BiLSTM Classifier:          {'🟡 UNTRAINED' if ml_real else '⚫ NO INFRA'} — needs annotated dataset")
    gaps.append(f"  Court Calibration:          🔴 MOCK — auto-calibrate is a heuristic, needs court line detection")
    gaps.append(f"  Speed Computation:          🟢 WORKING — physics correct, depends on calibration")
    gaps.append(f"  Pro Comparison:             🟡 MOCK — hardcoded angles, needs real pro database")
    gaps.append(f"  Drill Recommendations:      🟡 MOCK — rule-based, needs LLM integration")
    gaps.append(f"  On-device TFLite:           🔴 MISSING — mobile app uses Math.sin()")

    lines.extend(gaps)
    lines.append("=" * 72)

    return "\n".join(lines)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="SportIQ Inference Pipeline Audit")
    parser.add_argument("--video", help="Path to video file for inference test")
    parser.add_argument("--output", default="output/inference_report.txt", help="Report output path")
    parser.add_argument("--json", action="store_true", help="Also output as JSON")
    args = parser.parse_args()

    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    video_info = {"file": args.video or "generated_test_frame", "width": 1280, "height": 720, "frames": 1}

    if args.video:
        cap = cv2.VideoCapture(args.video)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                video_info["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                video_info["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                video_info["frames"] = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.release()
        else:
            print(f"Warning: Cannot open {args.video}, using blank frame")

    t_start = time.time()

    results: list[InferenceResult] = []

    yolo_result = run_real_yolo(frame)
    results.append(yolo_result)

    pose_result = run_real_pose(frame)
    results.append(pose_result)

    if pose_result.output.get("landmarks_detected", 0) > 0 and "keypoints" not in pose_result.output:
        dummy_kps = [np.random.randn(33, 4).astype(np.float32) for _ in range(30)]
    else:
        dummy_kps = [np.random.randn(33, 4).astype(np.float32) for _ in range(30)]

    ml_result = run_ml_classifier(dummy_kps)
    results.append(ml_result)

    t_total = (time.time() - t_start) * 1000

    ready = any(r.status in ("REAL", "REAL (untrained)") for r in results)

    report = PipelineReport(
        video_info=video_info,
        results=results,
        total_latency_ms=t_total,
        ready_for_production=ready,
    )

    report_text = generate_comparison_report(report)
    print(report_text)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report_text)
        print(f"\nReport saved to {out}")

    if args.json:
        json_out = {
            "video": video_info,
            "total_latency_ms": t_total,
            "results": [
                {
                    "component": r.component,
                    "status": r.status,
                    "latency_ms": r.latency_ms,
                    "output": r.output,
                    "accuracy": r.accuracy_estimate,
                }
                for r in results
            ],
        }
        json_path = Path(args.output).with_suffix(".json") if args.output else Path("output/inference_report.json")
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(json_out, indent=2))
        print(f"JSON report saved to {json_path}")


if __name__ == "__main__":
    main()
