"""Preprocess raw videos into training frames.

Uses PySceneDetect to filter meaningful scenes (>3 seconds),
extracts frames at 30fps using ffmpeg, resizes to 1280x720,
and saves as JPEG quality 90.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

try:
    from scenedetect import detect, ContentDetector
except ImportError:
    detect = None
    ContentDetector = None


def detect_scenes(video_path: Path, min_duration_s: float = 3.0) -> list[tuple[float, float]]:
    """Detect scenes longer than min_duration_s using PySceneDetect.

    Args:
        video_path: Path to the video file.
        min_duration_s: Minimum scene duration in seconds to keep.

    Returns:
        List of (start_time, end_time) tuples in seconds.
    """
    if detect is None:
        # Fallback: treat entire video as one scene
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
        cap.release()
        return [(0.0, total)]

    scene_list = detect(str(video_path), ContentDetector())
    scenes: list[tuple[float, float]] = []
    for scene in scene_list:
        start_s = scene[0].get_seconds()
        end_s = scene[1].get_seconds()
        if (end_s - start_s) >= min_duration_s:
            scenes.append((start_s, end_s))

    # If no scenes found, use entire video
    if not scenes:
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
        cap.release()
        if total >= min_duration_s:
            scenes.append((0.0, total))

    return scenes


def extract_frames_ffmpeg(
    video_path: Path,
    output_dir: Path,
    start_s: float,
    end_s: float,
    target_fps: int = 30,
) -> int:
    """Extract frames from a video segment using ffmpeg.

    Args:
        video_path: Source video path.
        output_dir: Directory to save extracted frames.
        start_s: Start time in seconds.
        end_s: End time in seconds.
        target_fps: Target frame rate for extraction.

    Returns:
        Number of frames extracted.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    duration = end_s - start_s

    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start_s:.3f}",
        "-i", str(video_path),
        "-t", f"{duration:.3f}",
        "-vf", f"fps={target_fps},scale=1280:720",
        "-q:v", "2",  # JPEG quality ~90
        str(output_dir / "%06d.jpg"),
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
        # Fallback: use OpenCV
        return extract_frames_opencv(video_path, output_dir, start_s, end_s, target_fps)

    return len(list(output_dir.glob("*.jpg")))


def extract_frames_opencv(
    video_path: Path,
    output_dir: Path,
    start_s: float = 0.0,
    end_s: float = 0.0,
    target_fps: int = 30,
) -> int:
    """Fallback frame extraction using OpenCV.

    Args:
        video_path: Source video path.
        output_dir: Directory for extracted frames.
        start_s: Start time in seconds.
        end_s: End time in seconds (0 = to end).
        target_fps: Target frame rate.

    Returns:
        Number of frames saved.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"Cannot open {video_path}")
        return 0

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_interval = max(1, int(round(src_fps / target_fps)))
    start_frame = int(start_s * src_fps)
    end_frame = int(end_s * src_fps) if end_s > 0 else int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    output_dir.mkdir(parents=True, exist_ok=True)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    frame_idx = start_frame
    saved = 0
    while frame_idx < end_frame:
        ret, frame = cap.read()
        if not ret:
            break
        if (frame_idx - start_frame) % frame_interval == 0:
            resized = cv2.resize(frame, (1280, 720))
            out_path = output_dir / f"{saved:06d}.jpg"
            cv2.imwrite(str(out_path), resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
            saved += 1
        frame_idx += 1

    cap.release()
    return saved


def preprocess_all(
    input_dir: str | Path,
    output_dir: str | Path,
    target_fps: int = 30,
    min_scene_duration: float = 3.0,
) -> None:
    """Preprocess all videos: scene detect → frame extraction.

    Args:
        input_dir: Directory containing raw video files.
        output_dir: Directory for extracted frames.
        target_fps: Target frame rate for extraction.
        min_scene_duration: Minimum scene length in seconds.
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    video_files = sorted(
        list(input_dir.glob("*.mp4"))
        + list(input_dir.glob("*.mkv"))
        + list(input_dir.glob("*.webm"))
    )
    print(f"Found {len(video_files)} videos to process")

    total_frames = 0
    for vf in tqdm(video_files, desc="Preprocessing"):
        vid_output = output_dir / vf.stem

        # Skip already processed
        if vid_output.exists() and len(list(vid_output.glob("*.jpg"))) > 0:
            existing = len(list(vid_output.glob("*.jpg")))
            print(f"  Skipping {vf.name} ({existing} frames exist)")
            total_frames += existing
            continue

        scenes = detect_scenes(vf, min_scene_duration)
        for scene_idx, (start, end) in enumerate(scenes):
            scene_dir = vid_output / f"scene_{scene_idx:03d}" if len(scenes) > 1 else vid_output
            n = extract_frames_ffmpeg(vf, scene_dir, start, end, target_fps)
            total_frames += n

    print(f"\n✅ Extracted {total_frames} frames to {output_dir}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Preprocess videos into frames")
    parser.add_argument("--input", default="data/raw/videos")
    parser.add_argument("--output", default="data/processed/frames")
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    preprocess_all(args.input, args.output, args.fps)


if __name__ == "__main__":
    main()
