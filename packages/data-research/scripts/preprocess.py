from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm


def extract_frames(
    video_path: Path,
    output_dir: Path,
    target_fps: int = 30,
    max_frames: int | None = None,
) -> int:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"Cannot open {video_path}")
        return 0

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_interval = max(1, int(round(src_fps / target_fps)))
    video_id = video_path.stem
    vid_output = output_dir / video_id
    vid_output.mkdir(parents=True, exist_ok=True)

    frame_idx = 0
    saved = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval == 0:
            frame_resized = cv2.resize(frame, (640, 360))
            out_path = vid_output / f"{frame_idx:06d}.jpg"
            cv2.imwrite(str(out_path), frame_resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
            saved += 1
            if max_frames and saved >= max_frames:
                break
        frame_idx += 1

    cap.release()
    return saved


def preprocess_all(
    input_dir: str | Path,
    output_dir: str | Path,
    target_fps: int = 30,
) -> None:
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    video_files = list(input_dir.glob("*.mp4"))
    print(f"Found {len(video_files)} videos to process")

    total_frames = 0
    for vf in tqdm(video_files, desc="Preprocessing"):
        n = extract_frames(vf, output_dir, target_fps)
        total_frames += n

    print(f"Extracted {total_frames} frames to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Preprocess match videos into frames")
    parser.add_argument("--input", default="data/raw/videos")
    parser.add_argument("--output", default="data/processed/frames")
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    preprocess_all(args.input, args.output, args.fps)


if __name__ == "__main__":
    main()
