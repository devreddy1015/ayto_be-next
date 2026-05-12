"""Annotation pipeline — runs PoseExtractor + CVPipeline on extracted frames.

Merges pose keypoints and shuttle tracking data into one parquet file
per video, saving to data/processed/annotations/.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from tqdm import tqdm

# Add package paths for imports
_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_root / "cv-core" / "src"))
sys.path.insert(0, str(_root / "pose-biomechanics" / "src"))

from angles import JointAngleComputer, compute_trunk_lean
from normalize import normalize_keypoints

try:
    from keypoints import PoseExtractor
except ImportError:
    PoseExtractor = None

try:
    from stroke_events import StrokeDetector
except ImportError:
    StrokeDetector = None


# 13 key joints to extract (matching keypoints.py KEY_JOINTS)
KEY_JOINT_INDICES = {
    "nose": 0,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
}


def annotate_video_frames(
    frames_dir: Path,
    output_path: Path,
    fps: float = 30.0,
) -> pd.DataFrame | None:
    """Run pose extraction and angle computation on a directory of frames.

    Args:
        frames_dir: Directory containing JPEG frame files.
        output_path: Path for the output parquet file.
        fps: Frame rate of the source video.

    Returns:
        DataFrame with per-frame annotations, or None if no frames found.
    """
    frame_files = sorted(frames_dir.glob("*.jpg"))
    if not frame_files:
        frame_files = sorted(frames_dir.glob("*.png"))
    if not frame_files:
        return None

    angle_computer = JointAngleComputer()
    records: list[dict] = []

    # Process frames with progress bar
    prev_landmarks: np.ndarray | None = None
    raw_landmarks_seq: list[np.ndarray | None] = []

    for frame_idx, frame_path in enumerate(tqdm(
        frame_files, desc=f"  {frames_dir.name}", leave=False
    )):
        frame = cv2.imread(str(frame_path))
        if frame is None:
            raw_landmarks_seq.append(None)
            records.append(_empty_record(frame_idx, fps))
            continue

        # Extract pose landmarks using MediaPipe (if available)
        landmarks = _extract_landmarks_simple(frame)
        raw_landmarks_seq.append(landmarks)

        record: dict = {"frame": frame_idx, "timestamp_s": frame_idx / fps}

        if landmarks is not None:
            # Normalize keypoints
            normalized = normalize_keypoints(landmarks)

            # Extract 13 key joints (x, y, z)
            for joint_name, idx in KEY_JOINT_INDICES.items():
                record[f"{joint_name}_x"] = float(normalized[idx, 0])
                record[f"{joint_name}_y"] = float(normalized[idx, 1])
                record[f"{joint_name}_z"] = float(normalized[idx, 2])

            # Compute joint angles
            angles = angle_computer.compute_all_angles(landmarks)
            for angle_name, angle_val in angles.items():
                record[f"angle_{angle_name}"] = angle_val

            # Trunk lean
            shoulder_mid = (landmarks[11, :3] + landmarks[12, :3]) / 2
            hip_mid = (landmarks[23, :3] + landmarks[24, :3]) / 2
            record["trunk_lean"] = compute_trunk_lean(shoulder_mid, hip_mid)

            # Wrist velocity
            if prev_landmarks is not None:
                record["right_wrist_velocity"] = JointAngleComputer.wrist_velocity(
                    prev_landmarks, landmarks, fps, "right"
                )
                record["left_wrist_velocity"] = JointAngleComputer.wrist_velocity(
                    prev_landmarks, landmarks, fps, "left"
                )
            else:
                record["right_wrist_velocity"] = 0.0
                record["left_wrist_velocity"] = 0.0

            prev_landmarks = landmarks
        else:
            record.update(_empty_pose_fields())
            prev_landmarks = None

        records.append(record)

    if not records:
        return None

    df = pd.DataFrame(records)

    # Detect stroke events if possible
    if StrokeDetector is not None and raw_landmarks_seq:
        try:
            detector = StrokeDetector(fps=fps)
            events = detector.detect(raw_landmarks_seq)
            df["stroke_detected"] = False
            for event in events:
                df.loc[df["frame"] == event.peak_frame, "stroke_detected"] = True
                df.loc[df["frame"] == event.peak_frame, "dominant_hand"] = event.dominant_hand
        except Exception:
            df["stroke_detected"] = False

    # Save to parquet
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)

    return df


def _extract_landmarks_simple(frame: np.ndarray) -> np.ndarray | None:
    """Extract landmarks using MediaPipe or return synthetic data.

    Args:
        frame: BGR image as numpy array.

    Returns:
        (33, 4) landmark array or None.
    """
    try:
        import mediapipe as mp_lib
        holistic = mp_lib.solutions.holistic.Holistic(
            static_image_mode=True,
            min_detection_confidence=0.5,
        )
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = holistic.process(rgb)
        holistic.close()
        if results.pose_landmarks is None:
            return None
        return np.array([
            [lm.x, lm.y, lm.z, lm.visibility]
            for lm in results.pose_landmarks.landmark
        ])
    except ImportError:
        return None


def _empty_record(frame_idx: int, fps: float) -> dict:
    """Create an empty annotation record for a missing frame."""
    record = {"frame": frame_idx, "timestamp_s": frame_idx / fps}
    record.update(_empty_pose_fields())
    return record


def _empty_pose_fields() -> dict:
    """Return NaN-filled pose fields."""
    fields: dict = {}
    for joint_name in KEY_JOINT_INDICES:
        fields[f"{joint_name}_x"] = float("nan")
        fields[f"{joint_name}_y"] = float("nan")
        fields[f"{joint_name}_z"] = float("nan")
    fields["trunk_lean"] = float("nan")
    fields["right_wrist_velocity"] = 0.0
    fields["left_wrist_velocity"] = 0.0
    return fields


def annotate_all(
    input_dir: str | Path,
    output_dir: str | Path,
    fps: float = 30.0,
) -> None:
    """Run annotation pipeline on all video frame directories.

    Args:
        input_dir: Directory containing per-video frame subdirectories.
        output_dir: Directory for output parquet files.
        fps: Frame rate assumption.
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Find all video frame directories
    video_dirs = sorted([d for d in input_dir.iterdir() if d.is_dir()])
    if not video_dirs:
        print(f"No video frame directories found in {input_dir}")
        return

    print(f"Found {len(video_dirs)} videos to annotate")
    total_frames = 0

    for vid_dir in tqdm(video_dirs, desc="Annotating"):
        output_path = output_dir / f"{vid_dir.name}.parquet"

        # Skip already processed
        if output_path.exists():
            existing_df = pd.read_parquet(output_path)
            print(f"  Skipping {vid_dir.name} ({len(existing_df)} frames exist)")
            total_frames += len(existing_df)
            continue

        df = annotate_video_frames(vid_dir, output_path, fps)
        if df is not None:
            total_frames += len(df)
            print(f"  {vid_dir.name}: {len(df)} frames annotated")

    print(f"\n✅ Annotated {total_frames} total frames → {output_dir}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Annotate video frames with pose + tracking data")
    parser.add_argument("--input", default="data/processed/frames",
                        help="Input directory with per-video frame subdirectories")
    parser.add_argument("--output", default="data/processed/annotations",
                        help="Output directory for parquet files")
    parser.add_argument("--fps", type=float, default=30.0,
                        help="Frame rate assumption")
    args = parser.parse_args()
    annotate_all(args.input, args.output, args.fps)


if __name__ == "__main__":
    main()
