"""Unit tests for websocket_server — protocol helpers and client management."""

import struct

import numpy as np
import pytest
from src.streaming_pipeline import (
    EventType,
    MetricsSnapshot,
    StreamingEvent,
    StreamingPipeline,
)
from src.websocket_server import (
    BinaryFrameType,
    RealtimeServer,
    _complete_msg,
    _error_msg,
    _error_msg_bin,
    _health_msg,
    _health_msg_bin,
    _json_default,
    _metrics_msg,
    _metrics_msg_bin,
    _pose_msg,
    _pose_msg_bin,
    _progress_msg,
    _progress_msg_bin,
    _shuttle_msg,
    _shuttle_msg_bin,
    _speed_msg,
    _speed_msg_bin,
    _stroke_msg,
    _stroke_msg_bin,
    run_realtime_session,
)

# ============================================================================
# JSON serialisation helpers
# ============================================================================


class TestJsonDefault:
    def test_numpy_float32(self):
        assert _json_default(np.float32(3.14)) == pytest.approx(3.14, rel=0.01)

    def test_numpy_float64(self):
        assert _json_default(np.float64(2.718)) == 2.718

    def test_numpy_int32(self):
        assert _json_default(np.int32(42)) == 42

    def test_numpy_ndarray(self):
        arr = np.array([1, 2, 3])
        result = _json_default(arr)
        assert result == [1, 2, 3]

    def test_unknown_type(self):
        result = _json_default({1, 2, 3})
        assert isinstance(result, str)


# ============================================================================
# JSON message builders
# ============================================================================


class TestJsonMessages:
    def test_shuttle_msg(self):
        ev = StreamingEvent(
            type=EventType.SHUTTLE_DETECTED,
            frame_idx=10,
            data={"x": 320.5, "y": 180.2, "confidence": 0.85},
            latency_ms=2.3,
        )
        msg = _shuttle_msg(ev)
        assert msg["type"] == "shuttle"
        assert msg["frame"] == 10
        assert msg["x"] == 320.5
        assert msg["y"] == 180.2
        assert msg["confidence"] == 0.85
        assert msg["latency_ms"] == 2.3

    def test_speed_msg(self):
        ev = StreamingEvent(
            type=EventType.SPEED_UPDATE,
            frame_idx=10,
            data={"speed_kmh": 250.3},
            latency_ms=1.5,
        )
        msg = _speed_msg(ev)
        assert msg["type"] == "speed"
        assert msg["speed_kmh"] == 250.3

    def test_pose_msg(self):
        ev = StreamingEvent(
            type=EventType.POSE_READY,
            frame_idx=10,
            data={"angles": {"left_elbow": 120.56, "right_elbow": 115.3}},
            latency_ms=5.0,
        )
        msg = _pose_msg(ev)
        assert msg["type"] == "pose"
        assert msg["angles"]["left_elbow"] == 120.6
        assert msg["angles"]["right_elbow"] == 115.3

    def test_pose_msg_empty_angles(self):
        ev = StreamingEvent(
            type=EventType.POSE_READY,
            frame_idx=10,
            data={},
        )
        msg = _pose_msg(ev)
        assert msg["angles"] == {}

    def test_stroke_msg(self):
        ev = StreamingEvent(
            type=EventType.STROKE_DETECTED,
            frame_idx=10,
            data={
                "stroke_type": "smash",
                "confidence": 0.92,
                "frame_start": 5,
                "frame_end": 15,
                "frame_peak": 10,
                "dominant_hand": "right",
            },
            latency_ms=3.0,
        )
        msg = _stroke_msg(ev)
        assert msg["type"] == "stroke"
        assert msg["stroke_type"] == "smash"
        assert msg["confidence"] == 0.92

    def test_metrics_msg(self):
        m = MetricsSnapshot(
            total_frames=100,
            detected_frames=80,
            max_speed_kmh=250.0,
            stroke_count=5,
            frames_dropped=3,
            pipeline_mode="full",
        )
        msg = _metrics_msg(m)
        assert msg["type"] == "metrics"
        assert msg["total_frames"] == 100
        assert msg["pipeline_mode"] == "full"
        assert msg["frames_dropped"] == 3

    def test_error_msg(self):
        ev = StreamingEvent(
            type=EventType.ERROR,
            frame_idx=10,
            data={"msg": "something broke"},
        )
        msg = _error_msg(ev)
        assert msg["msg"] == "something broke"

    def test_progress_msg(self):
        ev = StreamingEvent(
            type=EventType.PROGRESS,
            data={"current": 500, "total": 1000},
        )
        msg = _progress_msg(ev)
        assert msg["current"] == 500
        assert msg["total"] == 1000

    def test_health_msg(self):
        ev = StreamingEvent(
            type=EventType.PIPELINE_HEALTH,
            data={
                "mode": "cv_only",
                "cv_health": "healthy",
                "pose_health": "dead",
                "ml_health": "dead",
                "budget_used_pct": 75.5,
            },
        )
        msg = _health_msg(ev)
        assert msg["mode"] == "cv_only"
        assert msg["cv_health"] == "healthy"

    def test_complete_msg(self):
        m = MetricsSnapshot(total_frames=100, stroke_count=5)
        msg = _complete_msg(m)
        assert msg["type"] == "session_complete"
        assert msg["metrics"]["total_frames"] == 100


# ============================================================================
# Binary message builders
# ============================================================================


class TestBinaryMessages:
    def test_shuttle_binary_has_type_byte(self):
        ev = StreamingEvent(
            type=EventType.SHUTTLE_DETECTED,
            frame_idx=10,
            data={"x": 320.5, "y": 180.2, "confidence": 0.85},
            latency_ms=2.3,
        )
        data = _shuttle_msg_bin(ev)
        assert data[0] == BinaryFrameType.CV
        assert len(data) > 5  # header + payload

    def test_speed_binary(self):
        ev = StreamingEvent(
            type=EventType.SPEED_UPDATE,
            frame_idx=10,
            data={"speed_kmh": 250.3},
        )
        data = _speed_msg_bin(ev)
        assert data[0] == BinaryFrameType.SPEED

    def test_pose_binary(self):
        ev = StreamingEvent(
            type=EventType.POSE_READY,
            frame_idx=10,
            data={"angles": {"left_elbow": 120.5}},
        )
        data = _pose_msg_bin(ev)
        assert data[0] == BinaryFrameType.POSE

    def test_stroke_binary(self):
        ev = StreamingEvent(
            type=EventType.STROKE_DETECTED,
            frame_idx=10,
            data={
                "stroke_type": "smash",
                "confidence": 0.92,
                "frame_start": 5,
                "frame_end": 15,
                "frame_peak": 10,
                "dominant_hand": "right",
            },
        )
        data = _stroke_msg_bin(ev)
        assert data[0] == BinaryFrameType.STROKE

    def test_metrics_binary(self):
        m = MetricsSnapshot(total_frames=100, pipeline_mode="full")
        data = _metrics_msg_bin(m)
        assert data[0] == BinaryFrameType.METRICS

    def test_error_binary(self):
        ev = StreamingEvent(
            type=EventType.ERROR,
            data={"msg": "test error"},
        )
        data = _error_msg_bin(ev)
        assert data[0] == BinaryFrameType.ERROR

    def test_health_binary(self):
        ev = StreamingEvent(
            type=EventType.PIPELINE_HEALTH,
            data={"mode": "full", "cv_health": "healthy"},
        )
        data = _health_msg_bin(ev)
        assert data[0] == BinaryFrameType.HEALTH

    def test_progress_binary(self):
        ev = StreamingEvent(
            type=EventType.PROGRESS,
            data={"current": 500, "total": 1000},
        )
        data = _progress_msg_bin(ev)
        assert data[0] == BinaryFrameType.PROGRESS

    def test_binary_pack_structure(self):
        """Verify packing: 1-byte type + msgpack payload."""
        ev = StreamingEvent(
            type=EventType.SHUTTLE_DETECTED,
            frame_idx=10,
            data={"x": 100.0, "y": 200.0, "confidence": 0.5},
        )
        data = _shuttle_msg_bin(ev)
        ftype = struct.unpack("!B", data[:1])[0]
        assert ftype == BinaryFrameType.CV


# ============================================================================
# RealtimeServer — client management (no network)
# ============================================================================


class _FakeSocket:
    """Minimal fake socket for testing client registration."""

    def sendall(self, data: bytes) -> None:
        pass


class TestRealtimeServer:
    def test_construct(self):
        p = StreamingPipeline()
        s = RealtimeServer(p, host="127.0.0.1", port=9999)
        assert s.host == "127.0.0.1"
        assert s.port == 9999
        assert s.client_count == 0

    def test_register_client(self):
        p = StreamingPipeline()
        s = RealtimeServer(p)
        sock = _FakeSocket()
        cid = s.register_client(sock)
        assert isinstance(cid, int)
        assert s.client_count == 1

    def test_remove_client(self):
        p = StreamingPipeline()
        s = RealtimeServer(p)
        sock = _FakeSocket()
        cid = s.register_client(sock)
        s.remove_client(cid)
        assert s.client_count == 0

    def test_heartbeat_updates(self):
        p = StreamingPipeline()
        s = RealtimeServer(p)
        sock = _FakeSocket()
        cid = s.register_client(sock)
        s.heartbeat_client(cid, "shuttle")
        # No exception = pass

    def test_heartbeat_unknown_client_no_error(self):
        p = StreamingPipeline()
        s = RealtimeServer(p)
        s.heartbeat_client(99999, "all")  # should not raise

    def test_broadcast_no_clients(self):
        p = StreamingPipeline()
        s = RealtimeServer(p)
        s.broadcast({"type": "test"})  # should not raise

    def test_multiple_clients_unique_ids(self):
        p = StreamingPipeline()
        s = RealtimeServer(p)
        c1 = s.register_client(_FakeSocket())
        c2 = s.register_client(_FakeSocket())
        assert c1 != c2
        assert s.client_count == 2

    def test_run_realtime_session_no_video(self):
        """run_realtime_session with no video should return pipeline+server."""
        pipeline, server = run_realtime_session(
            video_path=None,
            use_websockets=False,
        )
        assert isinstance(pipeline, StreamingPipeline)
        assert isinstance(server, RealtimeServer)
        server.stop()
        pipeline.stop()
