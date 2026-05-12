from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

from schemas import FrameData, ProComparison, SessionOutput, ShuttleFrame
from session_builder import SessionBuilder


def _ensure_paths() -> None:
    base = Path(__file__).resolve().parent.parent.parent
    for pkg in ["cv-core", "pose-biomechanics", "ml-models"]:
        src = base / pkg / "src"
        if src.is_dir() and str(src) not in sys.path:
            sys.path.insert(0, str(src))


def run_full_pipeline(
    video_path: str | Path,
    model_path: str = "yolov8n.pt",
    sport: str = "badminton",
    use_real_inference: bool = False,
) -> SessionOutput:
    _ensure_paths()

    video_path = Path(video_path)

    if use_real_inference:
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        import cv2
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
    else:
        fps = 60.0
        total_frames = 1800

    builder = SessionBuilder(sport=sport, fps=fps)

    if use_real_inference:
        cv_results, kps_seq, angles_seq, strokes, comparisons = _run_real_pipeline(
            video_path, model_path, fps
        )
    else:
        cv_results, kps_seq, angles_seq, strokes, comparisons = _generate_mock_data(
            total_frames, fps
        )

    from integration import merge_pipeline_outputs
    frames, strokes_mapped, comparisons_mapped = merge_pipeline_outputs(
        cv_results, kps_seq, angles_seq, strokes, comparisons, fps
    )

    for i, (shuttle, pose) in enumerate(frames):
        builder.add_frame(
            frame_idx=i,
            timestamp_s=i / fps,
            shuttle=shuttle,
            pose=pose,
        )

    for s in strokes_mapped:
        builder.add_stroke_event(s)

    for c in comparisons_mapped:
        builder.add_comparison(c)

    return builder.build()


def _run_real_pipeline(
    video_path: Path,
    model_path: str,
    fps: float,
) -> tuple:
    try:
        from pipeline import CVPipeline
        cv_pipe = CVPipeline(model_path=model_path)
        cv_results = cv_pipe.process_video(video_path)
    except ImportError as e:
        print(f"CV pipeline unavailable: {e}")
        cv_results = []

    try:
        from keypoints import KeypointExtractor
        from angles import JointAngleComputer
        from normalizer import PoseNormalizer
        from stroke_events import StrokeEventDetector

        angle_comp = JointAngleComputer()
        normalizer = PoseNormalizer()

        with KeypointExtractor() as extractor:
            kps_seq = extractor.extract_from_video(str(video_path))

        kps_seq = normalizer.normalize_sequence(kps_seq)
        angles_seq = angle_comp.compute_angle_sequence(kps_seq)

        detector = StrokeEventDetector(fps=fps)
        stroke_events = detector.detect(kps_seq)
    except ImportError as e:
        print(f"Pose pipeline unavailable: {e}")
        kps_seq = []
        angles_seq = []
        stroke_events = []

    try:
        from comparison import ProComparisonEngine
        engine = ProComparisonEngine()
        comparisons: list[Any] = []
        for ev in stroke_events[:10]:
            if ev.frame_peak < len(kps_seq) and kps_seq[ev.frame_peak] is not None:
                angles = angle_comp.compute_all_angles(kps_seq[ev.frame_peak])
                from integration import generate_mock_comparison
                label = getattr(ev, "stroke_label", "smash")
                comp = generate_mock_comparison(angles, stroke_type=label)
                comparisons.append(comp)
    except ImportError:
        comparisons = []

    return cv_results, kps_seq, angles_seq, stroke_events, comparisons


def _generate_mock_data(
    total_frames: int,
    fps: float,
) -> tuple:
    import random

    random.seed(42)
    np.random.seed(42)

    class MockCVResult:
        def __init__(self, i: int):
            self.frame_idx = i
            self.timestamp_s = i / fps
            detected = i % 3 != 0
            self.shuttle_detected = detected
            base_x = 320 + np.sin(i * 0.05) * 200
            base_y = 180 + np.cos(i * 0.05) * 100 + i * 0.02
            self.raw_position = (base_x, base_y) if detected else None
            self.tracked_position = (base_x + random.uniform(-5, 5), base_y + random.uniform(-5, 5)) if detected else None
            speed = np.abs(np.sin(i * 0.05)) * 250 + random.uniform(20, 60) if detected else None
            self.speed_kmh = round(speed, 1) if speed else None
            self.confidence = 0.75 + random.uniform(0, 0.2) if detected else 0.0

    cv_results = [MockCVResult(i) for i in range(total_frames)]

    kps_seq: list[np.ndarray | None] = []
    angles_seq: list[dict[str, float] | None] = []

    for i in range(total_frames):
        if i % 2 == 0:
            landmarks = np.random.normal(0.5, 0.15, (33, 4)).astype(np.float32)
            landmarks[23, :3] = [-0.1, 0.0, 0.0]
            landmarks[24, :3] = [0.1, 0.0, 0.0]
            landmarks[:, 3] = np.clip(np.abs(landmarks[:, 3]), 0.5, 1.0)
            kps_seq.append(landmarks)

            swing_phase = np.sin(i * 0.1)
            elbow_angle = 60 + abs(swing_phase) * 100
            angles_seq.append({
                "left_elbow": elbow_angle + random.uniform(-5, 5),
                "right_elbow": elbow_angle + random.uniform(-5, 5) + 5,
                "left_shoulder": 90 + random.uniform(-10, 10),
                "right_shoulder": 95 + random.uniform(-10, 10),
                "left_knee": 140 + random.uniform(-5, 5),
                "right_knee": 142 + random.uniform(-5, 5),
            })
        else:
            kps_seq.append(None)
            angles_seq.append(None)

    class MockStrokeEvent:
        def __init__(self, i: int, label: str):
            self.frame_start = max(0, i - 15)
            self.frame_peak = i
            self.frame_end = min(total_frames - 1, i + 15)
            self.stroke_label = label
            self.confidence = 0.75 + random.uniform(0, 0.2)
            self.peak_wrist_velocity = 1.5 + random.uniform(0, 1.5)
            self.peak_elbow_angle = 140 + random.uniform(0, 40)
            self.side = "right"

    stroke_types = ["smash", "clear", "drop", "net", "serve", "defensive"]
    strokes = [
        MockStrokeEvent(int(total_frames * 0.1 + i * total_frames * 0.08), random.choice(stroke_types))
        for i in range(12)
    ]

    from integration import generate_mock_comparison
    comparisons = [
        generate_mock_comparison(
            {"left_elbow": 152, "right_elbow": 155, "left_knee": 130, "right_knee": 135},
            pro_name="Viktor Axelsen",
            stroke_type="smash",
        ),
        generate_mock_comparison(
            {"left_elbow": 148, "right_elbow": 150, "left_knee": 135, "right_knee": 138},
            pro_name="Viktor Axelsen",
            stroke_type="clear",
        ),
    ]

    return cv_results, kps_seq, angles_seq, strokes, comparisons


def pipeline_to_json(video_path: str, output_path: str | None = None, use_real_inference: bool = False) -> str:
    session = run_full_pipeline(video_path, use_real_inference=use_real_inference)
    json_str = session.to_json()

    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json_str)
        print(f"Session saved to {out}")

    return json_str
