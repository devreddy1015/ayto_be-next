from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np

from .schemas import SessionOutput
from .session_builder import SessionBuilder


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
    corners_px: list[tuple[float, float]] | None = None,
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
            video_path, model_path, fps, sport, corners_px
        )
    else:
        cv_results, kps_seq, angles_seq, strokes, comparisons = _generate_mock_data(
            total_frames, fps
        )

    from .integration import merge_pipeline_outputs
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
    sport: str = "badminton",
    corners_px: list[tuple[float, float]] | None = None,
) -> tuple:
    """Pose -> fused hits -> CV flights -> technique, on a real video.

    Order matters: pose gives swing peaks and the hitter's feet; the CV pass
    gives shuttle turns; the fused hits then segment the shuttle track into
    flights anchored at the hitter's ground position.
    """
    from types import SimpleNamespace

    kps_seq: list[np.ndarray | None] = []
    angles_seq: list[dict[str, float] | None] = []
    pose_events: list[Any] = []
    try:
        from angles import JointAngleComputer
        from keypoints import PoseExtractor
        from normalize import normalize_and_smooth
        from stroke_events import StrokeDetector

        with PoseExtractor() as extractor:
            raw_kps = extractor.extract_from_video(str(video_path))
        kps_seq = normalize_and_smooth(raw_kps, fps=fps)
        angles_seq = JointAngleComputer().compute_angle_sequence(kps_seq)
        pose_events = StrokeDetector(fps=fps).detect(kps_seq)
    except (ImportError, RuntimeError) as e:
        print(f"Pose pipeline unavailable: {e}")
        raw_kps = []

    cv_results: list[Any] = []
    hits: list[Any] = []
    try:
        from pipeline import CVPipeline
        from stroke_events import fuse_hits

        cv_pipe = CVPipeline(model_path=model_path, sport=sport)
        cv_pipe.process_video(video_path, corners_px=corners_px)
        frames = cv_pipe.results
        turns = [r.frame for r in frames if r.stroke_detected]
        visible = np.array([r.confidence > 0 for r in frames])
        hits = fuse_hits(pose_events, turns, fps, shuttle_visible=visible)

        anchors: dict[int, tuple[float, float]] = {}
        if cv_pipe.camera is not None and cv_pipe.frame_size is not None:
            w, h = cv_pipe.frame_size
            for hit in hits:
                kp = raw_kps[hit.frame] if hit.frame < len(raw_kps) else None
                if hit.hitter == "player" and kp is not None and kp[[27, 28], 3].min() > 0.3:
                    feet = kp[[27, 28], :2].mean(axis=0) * (w, h)
                    anchors[hit.frame] = tuple(cv_pipe.camera.image_to_ground(feet[None])[0])
        cv_pipe.reanalyse(hit_frames=[hit.frame for hit in hits], anchors=anchors)
        cv_results = [
            SimpleNamespace(
                shuttle_detected=bool(np.isfinite(r.shuttle_x)),
                tracked_position=(r.shuttle_x, r.shuttle_y),
                speed_kmh=None if not np.isfinite(r.speed_kmh) else round(r.speed_kmh, 1),
                confidence=r.confidence,
            )
            for r in cv_pipe.results
        ]
        launch = {f.start_frame: f.launch_speed_kmh for f in cv_pipe.flights}
    except ImportError as e:
        print(f"CV pipeline unavailable: {e}")
        launch = {}
        if not hits:
            hits = [SimpleNamespace(frame=ev.peak_frame, hitter="player", confidence=ev.confidence)
                    for ev in pose_events]

    window = round(0.25 * fps)
    stroke_events = []
    for hit in hits:
        if hit.hitter != "player":
            continue
        angles = angles_seq[hit.frame] if hit.frame < len(angles_seq) else None
        elbow = None
        if angles:
            elbow = angles.get("right_elbow") or angles.get("left_elbow")
        stroke_events.append(SimpleNamespace(
            frame_start=max(0, hit.frame - window),
            frame_peak=hit.frame,
            frame_end=hit.frame + window,
            stroke_label="unknown",  # set by a trained classifier (ml-models)
            confidence=hit.confidence,
            peak_wrist_velocity=_wrist_speed(kps_seq, hit.frame, fps),
            peak_elbow_angle=elbow,
            side="right",
            launch_speed_kmh=launch.get(hit.frame),
        ))

    comparisons: list[Any] = []
    from .comparison import ProComparisonEngine

    engine = ProComparisonEngine()
    for ev in stroke_events[:10]:
        angles = angles_seq[ev.frame_peak] if ev.frame_peak < len(angles_seq) else None
        # Pro references are per stroke type: comparing an unclassified
        # stroke against, say, a smash profile would be misleading.
        if angles and ev.stroke_label != "unknown":
            comparisons.append(engine.best_match(angles, stroke_type=ev.stroke_label))

    return cv_results, kps_seq, angles_seq, stroke_events, comparisons


def _wrist_speed(kps_seq: list[np.ndarray | None], frame: int, fps: float) -> float:
    if 0 < frame < len(kps_seq) and kps_seq[frame] is not None and kps_seq[frame - 1] is not None:
        cur, prev = kps_seq[frame], kps_seq[frame - 1]
        return float(max(np.linalg.norm(cur[i, :3] - prev[i, :3]) for i in (15, 16)) * fps)
    return 0.0


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
            self.tracked_position = (
                (base_x + random.uniform(-5, 5), base_y + random.uniform(-5, 5))
                if detected else None
            )
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
        MockStrokeEvent(
            int(total_frames * 0.1 + i * total_frames * 0.08),
            random.choice(stroke_types),
        )
        for i in range(12)
    ]

    from .integration import generate_mock_comparison
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


def pipeline_to_json(
    video_path: str,
    output_path: str | None = None,
    use_real_inference: bool = False,
    sport: str = "badminton",
    corners_px: list[tuple[float, float]] | None = None,
) -> str:
    session = run_full_pipeline(
        video_path, sport=sport, use_real_inference=use_real_inference, corners_px=corners_px,
    )
    json_str = session.to_json()

    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json_str)
        print(f"Session saved to {out}")

    return json_str
