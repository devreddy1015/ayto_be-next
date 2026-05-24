"""Unit tests for streaming_pipeline — real-time pipeline components."""

import time

import numpy as np
import pytest
from src.streaming_pipeline import (
    CVFrameOutput,
    DeviceCapability,
    EventType,
    FrameBudget,
    MetricsSnapshot,
    MonitoredQueue,
    PipelineMode,
    PipelineStats,
    StageHealth,
    StreamingEvent,
    StreamingPipeline,
    WorkerMonitor,
)

# ============================================================================
# DeviceCapability
# ============================================================================


class TestDeviceCapability:
    def test_detect_returns_tier(self):
        cap = DeviceCapability.detect()
        assert cap.tier in ("low", "mid", "high")
        assert cap.cpu_cores >= 1
        assert cap.memory_gb > 0

    def test_tier_configs(self):
        low = DeviceCapability(cpu_cores=2, memory_gb=1.5, tier="low")
        mid = DeviceCapability(cpu_cores=6, memory_gb=4.0, tier="mid")
        high = DeviceCapability(cpu_cores=8, memory_gb=8.0, tier="high")

        assert low.pose_skip_interval == 3
        assert mid.pose_skip_interval == 2
        assert high.pose_skip_interval == 1

        assert low.ml_stride == 12
        assert mid.ml_stride == 8
        assert high.ml_stride == 5

        assert low.max_queue_size == 60
        assert mid.max_queue_size == 90
        assert high.max_queue_size == 120


# ============================================================================
# MonitoredQueue
# ============================================================================


class TestMonitoredQueue:
    def test_drop_newest_policy(self):
        q = MonitoredQueue(maxsize=2, drop_policy=MonitoredQueue.DROP_NEWEST)
        assert q.put(1)
        assert q.put(2)
        assert not q.put(3)  # dropped
        assert q.drops == 1
        assert q.get(timeout=0.1) == 1
        assert q.get(timeout=0.1) == 2

    def test_drop_oldest_policy(self):
        q = MonitoredQueue(maxsize=2, drop_policy=MonitoredQueue.DROP_OLDEST)
        assert q.put(1)
        assert q.put(2)
        assert q.put(3)  # 1 dropped, 3 enqueued
        assert q.drops == 1
        assert q.get(timeout=0.1) == 2
        assert q.get(timeout=0.1) == 3

    def test_depth_tracking(self):
        q = MonitoredQueue(maxsize=10)
        for i in range(5):
            q.put(i)
        assert q.depth == 5

    def test_put_nowait_always_enqueues(self):
        q = MonitoredQueue(maxsize=1)
        q.put(1)
        # put_nowait drops oldest to make room (unconditional enqueue)
        q.put_nowait(2)
        assert q.get(timeout=0.1) == 2  # 1 was evicted
        assert q.empty()

    def test_empty_full(self):
        q = MonitoredQueue(maxsize=1)
        assert q.empty()
        assert not q.full()
        q.put(1)
        assert not q.empty()
        assert q.full()


# ============================================================================
# WorkerMonitor
# ============================================================================


class _DummyWorkerTarget:
    """Callable that tracks invocation count for monitor tests."""

    def __init__(self) -> None:
        self.calls = 0
        self.running = True

    def __call__(self) -> None:
        self.calls += 1


class TestWorkerMonitor:
    def test_heartbeat_keeps_healthy(self):
        m = WorkerMonitor()
        m.register("cv", lambda: None, None)
        m.heartbeat("cv")
        assert m.check() == []

    def test_stall_detection(self, monkeypatch):
        m = WorkerMonitor()
        m.register("cv", lambda: None, None)
        m.STALL_TIMEOUT = -1.0  # force stall
        stalled = m.check()
        assert "cv" in stalled
        assert m.stage_health["cv"] == StageHealth.STALLED

    def test_recover_restarts(self):
        target = _DummyWorkerTarget()
        m = WorkerMonitor()
        m.register("cv", target, None)
        m.STALL_TIMEOUT = -1.0
        m.check()
        recovered = m.recover("cv")
        assert recovered
        assert m.restart_count["cv"] == 1

    def test_max_restarts(self):
        target = _DummyWorkerTarget()
        m = WorkerMonitor()
        m.register("cv", target, None)
        m.MAX_RESTARTS = 0
        m.STALL_TIMEOUT = -1.0
        m.check()
        recovered = m.recover("cv")
        assert not recovered
        assert m.stage_health["cv"] == StageHealth.DEAD

    def test_mark_degraded(self):
        m = WorkerMonitor()
        m.register("cv", lambda: None, None)
        assert m.stage_health["cv"] == StageHealth.HEALTHY
        m.mark_degraded("cv")
        assert m.stage_health["cv"] == StageHealth.DEGRADED

    def test_multiple_workers_independent(self):
        m = WorkerMonitor()
        m.register("cv", lambda: None, None)
        m.register("pose", lambda: None, None)
        m.heartbeat("cv")
        # Force pose to appear very stale — simulate no heartbeat
        m._heartbeats["pose"] = 0.0
        stalled = m.check()
        assert "cv" not in stalled  # heartbeated
        assert "pose" in stalled    # forced stale


# ============================================================================
# FrameBudget
# ============================================================================


class TestFrameBudget:
    def test_initial_budget(self):
        b = FrameBudget(fps=60)
        assert b.budget_ms == pytest.approx(16.666, rel=0.01)

    def test_can_afford(self):
        b = FrameBudget(fps=60)
        assert b.can_afford(10.0)  # 10 ms < 16.67 ms
        b.spend("cv", 12.0)
        assert b.can_afford(4.0)   # 12 + 4 < 16.67
        assert not b.can_afford(5.0)  # 12 + 5 > 16.67

    def test_spent_pct(self):
        b = FrameBudget(fps=60)
        b.spend("cv", 8.33)
        assert b.spent_pct() == pytest.approx(0.5, rel=0.01)

    def test_reset(self):
        b = FrameBudget(fps=60)
        b.spend("cv", 20.0)
        b.reset()
        assert b.can_afford(16.0)


# ============================================================================
# PipelineStats
# ============================================================================


class TestPipelineStats:
    def test_percentiles_empty(self):
        s = PipelineStats()
        assert s.p50_cv() == 0.0
        assert s.p95_cv() == 0.0

    def test_percentiles_with_data(self):
        s = PipelineStats()
        for v in range(1, 101):
            s.latency_cv_ms.append(float(v))
        assert s.p50_cv() == pytest.approx(50.5, rel=0.1)
        assert s.p95_cv() == pytest.approx(95.05, rel=0.1)

    def test_p99_cv(self):
        s = PipelineStats()
        for v in range(1, 101):
            s.latency_cv_ms.append(float(v))
        assert s.p99_cv() == pytest.approx(99.01, rel=0.1)


# ============================================================================
# StreamingPipeline — lifecycle
# ============================================================================


class TestStreamingPipeline:
    def test_construct_default(self):
        p = StreamingPipeline()
        assert p.fps == 60.0
        assert not p.use_real_cv
        assert p.mode == PipelineMode.FULL

    def test_construct_low_device(self):
        cap = DeviceCapability(cpu_cores=2, memory_gb=1.5, tier="low")
        p = StreamingPipeline(device_capability=cap)
        assert p._ml_stride == 12
        assert p._pose_skip == 3

    def test_start_stop(self):
        p = StreamingPipeline()
        p.start()
        assert p._running
        p.stop()
        assert not p._running

    def test_push_frame_enqueues(self):
        p = StreamingPipeline()
        p.start()
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        p.push_frame(frame, 0)
        time.sleep(0.1)
        assert p._total_frames == 1
        p.stop()

    def test_push_frame_produces_cv_output(self):
        p = StreamingPipeline()
        p.start()
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        p.push_frame(frame, 0)
        time.sleep(0.3)  # let worker process
        p.stop()
        assert 0 in p._cv_outputs
        cv_out = p._cv_outputs[0]
        assert isinstance(cv_out, CVFrameOutput)
        assert cv_out.frame_idx == 0

    def test_metrics_populated(self):
        p = StreamingPipeline(fps=60)
        p.start()
        for i in range(10):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            p.push_frame(frame, i)
        time.sleep(0.5)
        p.stop()

        m = p.get_metrics()
        assert m.total_frames >= 10
        assert isinstance(m.session_duration_s, float)

    def test_strokes_list_accessible(self):
        p = StreamingPipeline()
        strokes = p.get_strokes()
        assert isinstance(strokes, list)

    def test_export_json(self):
        p = StreamingPipeline()
        p.start()
        p.push_frame(np.zeros((480, 640, 3), dtype=np.uint8), 0)
        time.sleep(0.2)
        p.stop()
        j = p.export_json()
        assert "metrics" in j
        assert "strokes" in j
        assert "frames" in j
        assert isinstance(j, str)

    def test_device_capability_passthrough(self):
        cap = DeviceCapability(cpu_cores=8, memory_gb=8.0, tier="high")
        p = StreamingPipeline(device_capability=cap)
        assert p.device_cap.tier == "high"


# ============================================================================
# StreamingEvent
# ============================================================================


class TestStreamingEvent:
    def test_default_values(self):
        ev = StreamingEvent(type=EventType.FRAME_PROCESSED)
        assert ev.frame_idx == 0
        assert ev.timestamp_s == 0.0
        assert ev.data == {}
        assert ev.latency_ms == 0.0

    def test_custom_values(self):
        ev = StreamingEvent(
            type=EventType.STROKE_DETECTED,
            frame_idx=42,
            timestamp_s=0.7,
            data={"stroke_type": "smash"},
            latency_ms=3.5,
        )
        assert ev.type == EventType.STROKE_DETECTED
        assert ev.frame_idx == 42
        assert ev.data["stroke_type"] == "smash"
        assert ev.latency_ms == 3.5


# ============================================================================
# MetricsSnapshot
# ============================================================================


class TestMetricsSnapshot:
    def test_defaults(self):
        m = MetricsSnapshot()
        assert m.total_frames == 0
        assert m.cv_health == "healthy"
        assert m.pipeline_mode == "full"
        assert m.drop_rate_pct == 0.0

    def test_full_snapshot(self):
        m = MetricsSnapshot(
            total_frames=100,
            detected_frames=80,
            detection_rate=0.8,
            max_speed_kmh=220.0,
            avg_speed_kmh=150.0,
            stroke_count=5,
            session_duration_s=1.67,
            p50_cv_ms=3.2,
            p95_cv_ms=8.1,
            frames_dropped=5,
            drop_rate_pct=5.0,
            pipeline_mode="cv_only",
        )
        assert m.total_frames == 100
        assert m.pipeline_mode == "cv_only"
        assert m.drop_rate_pct == 5.0
