"""Benchmark the CV pipeline's detection rate and throughput on a folder of videos."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from pipeline import CVPipeline  # noqa: E402


def benchmark(pipeline: CVPipeline, video_paths: list[Path]) -> dict:
    total_frames = detected_frames = 0
    total_time = 0.0
    for vp in video_paths:
        start = time.perf_counter()
        pipeline.process_video(vp)
        total_time += time.perf_counter() - start
        summary = pipeline.get_summary()
        total_frames += summary["total_frames"]
        detected_frames += summary["detected_frames"]
    return {
        "total_videos": len(video_paths),
        "total_frames": total_frames,
        "detected_frames": detected_frames,
        "detection_rate": detected_frames / total_frames if total_frames else 0.0,
        "total_time_s": total_time,
        "fps": total_frames / total_time if total_time > 0 else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark CV pipeline")
    parser.add_argument("--test-dir", required=True, help="Directory containing test videos")
    parser.add_argument("--model", default="yolov8n.pt", help="YOLO fallback weights")
    parser.add_argument("--tracknet", default="models/tracknet.pt")
    parser.add_argument("--sport", default="badminton")
    parser.add_argument("--output", default="benchmarks/results.json")
    args = parser.parse_args()

    videos = sorted(Path(args.test_dir).glob("*.mp4"))
    if not videos:
        print(f"No .mp4 files found in {args.test_dir}")
        return

    pipeline = CVPipeline(model_path=args.model, tracknet_path=args.tracknet, sport=args.sport)
    results = benchmark(pipeline, videos)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
