import json
import tempfile
from pathlib import Path

import pytest

from orchestrator import pipeline_to_json, run_full_pipeline
from schemas import SessionOutput, SessionMetrics, FrameData, ShuttleFrame, StrokeEvent
from session_builder import SessionBuilder


class TestSessionBuilder:
    def test_empty_build(self):
        builder = SessionBuilder()
        output = builder.build()
        assert isinstance(output, SessionOutput)
        assert output.sport == "badminton"
        assert len(output.frames) == 0
        assert output.metrics.total_frames == 0

    def test_add_frames_computes_metrics(self):
        builder = SessionBuilder(fps=60.0)
        from schemas import PoseFrame

        for i in range(10):
            builder.add_frame(
                frame_idx=i,
                timestamp_s=i / 60.0,
                shuttle=ShuttleFrame(
                    detected=True,
                    x=float(i * 10),
                    y=float(i * 5),
                    speed_kmh=100.0 + i * 15.0,
                    confidence=0.9,
                ),
                pose=PoseFrame(
                    detected=True,
                    left_elbow=90.0 + i,
                    right_elbow=92.0 + i,
                    left_knee=140.0,
                    right_knee=142.0,
                ),
            )

        output = builder.build()
        assert output.metrics.total_frames == 10
        assert output.metrics.detected_frames == 10
        assert output.metrics.detection_rate == 1.0
        assert output.metrics.max_speed_kmh == pytest.approx(235.0, 0.1)
        assert output.metrics.avg_speed_kmh > 0
        assert output.metrics.form_score > 0

    def test_add_stroke_events(self):
        builder = SessionBuilder()
        builder.add_stroke_event(
            StrokeEvent(
                stroke_type="smash",
                confidence=0.92,
                frame_start=100,
                frame_peak=107,
                frame_end=114,
                peak_wrist_velocity=2.1,
                peak_elbow_angle=165.0,
                speed_at_peak_kmh=287.0,
            )
        )
        output = builder.build()
        assert len(output.strokes) == 1
        assert output.strokes[0].stroke_type == "smash"
        assert output.metrics.stroke_counts.get("smash", 0) == 1

    def test_generates_drills(self):
        builder = SessionBuilder()
        for i in range(5):
            builder.add_frame(
                frame_idx=i,
                timestamp_s=i / 60.0,
                shuttle=ShuttleFrame(detected=True, x=0.0, y=0.0, speed_kmh=100.0),
            )
        builder.add_stroke_event(
            StrokeEvent(
                stroke_type="smash",
                confidence=0.9,
                frame_start=0,
                frame_peak=2,
                frame_end=4,
                peak_elbow_angle=140.0,
                speed_at_peak_kmh=280.0,
            )
        )
        output = builder.build()
        assert len(output.drills) > 0
        assert any("smash" in d.lower() or "elbow" in d.lower() for d in output.drills)

    def test_json_export(self):
        builder = SessionBuilder()
        builder.add_frame(
            frame_idx=0,
            timestamp_s=0.0,
            shuttle=ShuttleFrame(detected=True, x=100.0, y=200.0, speed_kmh=150.0),
        )
        output = builder.build()
        json_str = output.to_json()
        data = json.loads(json_str)
        assert "session_id" in data
        assert data["sport"] == "badminton"
        assert data["metrics"]["total_frames"] == 1
        assert len(data["frames"]) == 1

    def test_roundtrip(self):
        builder = SessionBuilder(sport="badminton", fps=60)
        for i in range(3):
            builder.add_frame(
                frame_idx=i,
                timestamp_s=i / 60.0,
                shuttle=ShuttleFrame(detected=True, speed_kmh=200.0),
            )
        output = builder.build()
        json_str = output.to_json()
        data = json.loads(json_str)

        from schemas import SessionOutput
        loaded = data
        assert loaded["session_id"] == output.session_id
        assert loaded["metrics"]["total_frames"] == 3


class TestOrchestrator:
    def test_mock_pipeline_runs(self):
        session = run_full_pipeline(
            video_path="/nonexistent/video.mp4",
            use_real_inference=False,
        )
        assert isinstance(session, SessionOutput)
        assert session.sport == "badminton"
        assert session.metrics is not None
        assert len(session.frames) > 0
        assert len(session.strokes) > 0

    def test_mock_pipeline_json_export(self):
        json_str = pipeline_to_json(
            "/nonexistent/video.mp4",
            use_real_inference=False,
        )
        data = json.loads(json_str)
        assert "session_id" in data
        assert "metrics" in data
        assert "strokes" in data
        assert "drills" in data
        assert data["metrics"]["detection_rate"] > 0

    def test_json_writes_file(self):
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            tmp = f.name

        try:
            json_str = pipeline_to_json(
                "/nonexistent/video.mp4",
                output_path=tmp,
                use_real_inference=False,
            )
            assert Path(tmp).exists()
            saved = Path(tmp).read_text()
            assert json.loads(saved)["session_id"] is not None
        finally:
            Path(tmp).unlink(missing_ok=True)
