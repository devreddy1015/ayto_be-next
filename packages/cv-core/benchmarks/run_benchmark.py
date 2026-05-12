from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np


def benchmark_detection_rate(
    pipeline,
    video_paths: list[Path],
) -> dict:
    total_frames = 0
    detected_frames = 0
    total_time = 0.0

    for vp in video_paths:
        start = time.time()
        results = pipeline.process_video(vp)
        elapsed = time.time() - start
        total_time += elapsed
        total_frames += len(results)
        detected_frames += sum(1 for r in results if r.shuttle_detected)

    return {
        "total_videos": len(video_paths),
        "total_frames": total_frames,
        "detected_frames": detected_frames,
        "detection_rate": detected_frames / total_frames if total_frames > 0 else 0.0,
        "total_time_s": total_time,
        "fps": total_frames / total_time if total_time > 0 else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark CV pipeline")
    parser.add_argument("--test-dir", required=True, help="Directory containing test videos")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--output", default="benchmarks/results.json")
    args = parser.parse_args()

    from packages.cv_core.src.pipeline import CVPipeline

    video_dir = Path(args.test_dir)
    videos = list(video_dir.glob("*.mp4"))
    if not videos:
        print(f"No .mp4 files found in {video_dir}")
        return

    print(f"Running benchmark on {len(videos)} videos...")
    pipeline = CVPipeline(model_path=args.model)
    results = benchmark_detection_rate(pipeline, videos)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nBenchmark Results:")
    print(f"  Videos:         {results['total_videos']}")
    print(f"  Total frames:   {results['total_frames']}")
    print(f"  Detection rate: {results['detection_rate']:.2%}")
    print(f"  Processing FPS: {results['fps']:.1f}")
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
