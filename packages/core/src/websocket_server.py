"""WebSocket streaming server — production grade.

Streams per‑frame pipeline data to connected clients for
real‑time dashboards, mobile apps, and broadcast overlays.

Protocol layers:
  1. JSON  — line‑delimited, one message per frame (all clients)
  2. Binary — msgpack‑packed, single‑byte field keys (mobile‑optimised)

Clients negotiate the protocol via the first message they send
after connecting.  If no negotiation message is received within
2 s, the server defaults to JSON.

Subscription channels (client‑side filter):
  * ``all``      — every message type (default)
  * ``shuttle``  — cv / speed updates only
  * ``strokes``  — stroke + metrics events only
  * ``pose``     — pose angle updates only

Architecture:
    StreamingPipeline.on_*_event → RealtimeServer.broadcast()
                                       ├─→ Dashboard UI (browser / JSON)
                                       ├─→ Mobile app   (binary / msgpack)
                                       └─→ OBS overlay  (JSON)
"""

from __future__ import annotations

import asyncio
import json
import struct
import threading
import time
from enum import IntEnum
from typing import Any

import numpy as np
from streaming_pipeline import (
    EventType,
    MetricsSnapshot,
    StreamingEvent,
    StreamingPipeline,
)

# ============================================================================
# Binary protocol frame types
# ============================================================================


class BinaryFrameType(IntEnum):
    CV = 0x01
    SPEED = 0x02
    POSE = 0x03
    STROKE = 0x04
    METRICS = 0x05
    ERROR = 0x06
    PROGRESS = 0x07
    HEALTH = 0x08
    COMPLETE = 0x09


# ============================================================================
# Message builders — JSON
# ============================================================================


def _shuttle_msg(ev: StreamingEvent) -> dict[str, Any]:
    return {
        "type": "shuttle",
        "frame": ev.frame_idx,
        "x": ev.data.get("x"),
        "y": ev.data.get("y"),
        "confidence": round(ev.data.get("confidence", 0), 3),
        "latency_ms": round(ev.latency_ms, 1),
    }


def _speed_msg(ev: StreamingEvent) -> dict[str, Any]:
    return {
        "type": "speed",
        "frame": ev.frame_idx,
        "speed_kmh": round(ev.data.get("speed_kmh", 0), 1),
        "latency_ms": round(ev.latency_ms, 1),
    }


def _pose_msg(ev: StreamingEvent) -> dict[str, Any]:
    angles = ev.data.get("angles", {}) or {}
    return {
        "type": "pose",
        "frame": ev.frame_idx,
        "angles": {k: round(v, 1) for k, v in angles.items()},
        "latency_ms": round(ev.latency_ms, 1),
    }


def _stroke_msg(ev: StreamingEvent) -> dict[str, Any]:
    return {
        "type": "stroke",
        "frame_peak": ev.data.get("frame_peak", 0),
        "stroke_type": ev.data.get("stroke_type", "unknown"),
        "confidence": round(ev.data.get("confidence", 0), 3),
        "dominant_hand": ev.data.get("dominant_hand", "right"),
        "frame_start": ev.data.get("frame_start", 0),
        "frame_end": ev.data.get("frame_end", 0),
        "latency_ms": round(ev.latency_ms, 1),
    }


def _metrics_msg(metrics: MetricsSnapshot) -> dict[str, Any]:
    return {
        "type": "metrics",
        "total_frames": metrics.total_frames,
        "detected_frames": metrics.detected_frames,
        "detection_rate": round(metrics.detection_rate, 3),
        "max_speed_kmh": round(metrics.max_speed_kmh, 1),
        "avg_speed_kmh": round(metrics.avg_speed_kmh, 1),
        "stroke_count": metrics.stroke_count,
        "session_duration_s": round(metrics.session_duration_s, 1),
        "p95_cv_ms": metrics.p95_cv_ms,
        "p95_pose_ms": metrics.p95_pose_ms,
        "cv_queue_depth": metrics.cv_queue_depth,
        "pose_queue_depth": metrics.pose_queue_depth,
        "frames_dropped": metrics.frames_dropped,
        "drop_rate_pct": metrics.drop_rate_pct,
        "pipeline_mode": metrics.pipeline_mode,
    }


def _error_msg(ev: StreamingEvent) -> dict[str, Any]:
    return {
        "type": "error",
        "frame": ev.frame_idx,
        "msg": ev.data.get("msg", "unknown error"),
    }


def _progress_msg(ev: StreamingEvent) -> dict[str, Any]:
    return {
        "type": "progress",
        "current": ev.data.get("current", 0),
        "total": ev.data.get("total", 0),
    }


def _health_msg(ev: StreamingEvent) -> dict[str, Any]:
    return {
        "type": "health",
        "mode": ev.data.get("mode", "full"),
        "cv_health": ev.data.get("cv_health", "healthy"),
        "pose_health": ev.data.get("pose_health", "healthy"),
        "ml_health": ev.data.get("ml_health", "healthy"),
        "budget_pct": ev.data.get("budget_used_pct", 0),
    }


def _complete_msg(metrics: MetricsSnapshot) -> dict[str, Any]:
    return {
        "type": "session_complete",
        "metrics": _metrics_msg(metrics),
    }


# ============================================================================
# Message builders — Binary (msgpack)
# ============================================================================


def _msgpack_encode(data: dict) -> bytes:
    """Encode dict to msgpack bytes; falls back to JSON if unavailable.

    On fallback, converts bytes keys to strings for JSON compatibility.
    """
    try:
        import msgpack
        return msgpack.packb(data, use_bin_type=True)  # type: ignore[no-any-return]
    except ImportError:
        # Convert bytes keys to strings for JSON compatibility
        str_data = {
            (k.decode() if isinstance(k, bytes) else k): (
                v.decode() if isinstance(v, bytes) else
                {k2.decode() if isinstance(k2, bytes) else k2: v2 for k2, v2 in v.items()}
                if isinstance(v, dict) else v
            )
            for k, v in data.items()
        }
        return json.dumps(str_data).encode()


def _pack_binary(ftype: BinaryFrameType, data: dict) -> bytes:
    """Pack as: [1‑byte type][msgpack payload]."""
    payload = _msgpack_encode(data)
    return struct.pack("!B", ftype) + payload


def _shuttle_msg_bin(ev: StreamingEvent) -> bytes:
    return _pack_binary(BinaryFrameType.CV, {
        b"f": ev.frame_idx,
        b"x": ev.data.get("x"),
        b"y": ev.data.get("y"),
        b"c": round(ev.data.get("confidence", 0), 3),
        b"l": round(ev.latency_ms, 1),
    })


def _speed_msg_bin(ev: StreamingEvent) -> bytes:
    return _pack_binary(BinaryFrameType.SPEED, {
        b"f": ev.frame_idx,
        b"s": round(ev.data.get("speed_kmh", 0), 1),
        b"l": round(ev.latency_ms, 1),
    })


def _pose_msg_bin(ev: StreamingEvent) -> bytes:
    angles = ev.data.get("angles", {}) or {}
    return _pack_binary(BinaryFrameType.POSE, {
        b"f": ev.frame_idx,
        b"a": {k.encode(): round(v, 1) for k, v in angles.items()},
        b"l": round(ev.latency_ms, 1),
    })


def _stroke_msg_bin(ev: StreamingEvent) -> bytes:
    return _pack_binary(BinaryFrameType.STROKE, {
        b"p": ev.data.get("frame_peak", 0),
        b"t": ev.data.get("stroke_type", "unknown").encode(),
        b"c": round(ev.data.get("confidence", 0), 3),
        b"h": ev.data.get("dominant_hand", "right").encode(),
        b"s": ev.data.get("frame_start", 0),
        b"e": ev.data.get("frame_end", 0),
        b"l": round(ev.latency_ms, 1),
    })


def _metrics_msg_bin(metrics: MetricsSnapshot) -> bytes:
    return _pack_binary(BinaryFrameType.METRICS, {
        b"tf": metrics.total_frames,
        b"df": metrics.detected_frames,
        b"dr": round(metrics.detection_rate, 3),
        b"mx": round(metrics.max_speed_kmh, 1),
        b"av": round(metrics.avg_speed_kmh, 1),
        b"sc": metrics.stroke_count,
        b"dd": round(metrics.session_duration_s, 1),
        b"fd": metrics.frames_dropped,
        b"dp": metrics.drop_rate_pct,
        b"pm": metrics.pipeline_mode.encode(),
    })


def _error_msg_bin(ev: StreamingEvent) -> bytes:
    return _pack_binary(BinaryFrameType.ERROR, {
        b"f": ev.frame_idx,
        b"m": ev.data.get("msg", "unknown error").encode(),
    })


def _progress_msg_bin(ev: StreamingEvent) -> bytes:
    return _pack_binary(BinaryFrameType.PROGRESS, {
        b"c": ev.data.get("current", 0),
        b"t": ev.data.get("total", 0),
    })


def _health_msg_bin(ev: StreamingEvent) -> bytes:
    return _pack_binary(BinaryFrameType.HEALTH, {
        b"m": ev.data.get("mode", "full").encode(),
        b"cv": ev.data.get("cv_health", "healthy").encode(),
        b"po": ev.data.get("pose_health", "healthy").encode(),
        b"ml": ev.data.get("ml_health", "healthy").encode(),
        b"bp": ev.data.get("budget_used_pct", 0),
    })


# ============================================================================
# Dispatch tables
# ============================================================================

_JSON_BUILDERS: dict[EventType, Any] = {
    EventType.SHUTTLE_DETECTED: _shuttle_msg,
    EventType.SPEED_UPDATE: _speed_msg,
    EventType.POSE_READY: _pose_msg,
    EventType.STROKE_DETECTED: _stroke_msg,
    EventType.ERROR: _error_msg,
    EventType.PROGRESS: _progress_msg,
    EventType.PIPELINE_HEALTH: _health_msg,
    EventType.DEGRADATION: _health_msg,
}

_BINARY_BUILDERS: dict[EventType, Any] = {
    EventType.SHUTTLE_DETECTED: _shuttle_msg_bin,
    EventType.SPEED_UPDATE: _speed_msg_bin,
    EventType.POSE_READY: _pose_msg_bin,
    EventType.STROKE_DETECTED: _stroke_msg_bin,
    EventType.ERROR: _error_msg_bin,
    EventType.PROGRESS: _progress_msg_bin,
    EventType.PIPELINE_HEALTH: _health_msg_bin,
    EventType.DEGRADATION: _health_msg_bin,
}

# Channel → allowed event types
_CHANNEL_FILTERS: dict[str, set[EventType]] = {
    "all": set(_JSON_BUILDERS.keys()),
    "shuttle": {EventType.SHUTTLE_DETECTED, EventType.SPEED_UPDATE},
    "strokes": {EventType.STROKE_DETECTED, EventType.METRICS_UPDATE},
    "pose": {EventType.POSE_READY},
}


# ============================================================================
# Client representation
# ============================================================================


class _Client:
    """Thin wrapper around a WebSocket or TCP socket."""

    __slots__ = ("ws", "protocol", "channel", "last_heartbeat", "connected_at")

    def __init__(self, ws: Any, protocol: str = "json") -> None:
        self.ws = ws
        self.protocol = protocol  # "json" | "binary"
        self.channel = "all"
        self.last_heartbeat = time.monotonic()
        self.connected_at = time.monotonic()


# ============================================================================
# Realtime server
# ============================================================================


class RealtimeServer:
    """WebSocket server that streams pipeline events to clients.

    Production mode (``websockets`` package)::

        pip install websockets

    Dev mode (no extra deps): raw TCP with line‑delimited JSON.

    Optional msgpack for binary protocol (mobile)::

        pip install msgpack
    """

    # --- Config ---
    CLIENT_STALE_TIMEOUT = 30.0   # Drop clients with no heartbeat
    METRICS_INTERVAL = 2.0        # Seconds between metrics pushes
    BROADCAST_MAX_BATCH = 50      # Max clients to process before yielding

    def __init__(
        self,
        pipeline: StreamingPipeline,
        host: str = "0.0.0.0",
        port: int = 8765,
        use_websockets: bool = True,
    ) -> None:
        self.pipeline = pipeline
        self.host = host
        self.port = port
        self.use_websockets = use_websockets

        self._clients: dict[int, _Client] = {}
        self._client_counter = 0
        self._lock = threading.Lock()
        self._server_thread: threading.Thread | None = None
        self._running = False
        self._metrics_timer: threading.Timer | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

        self._wire_callbacks()

    # ==================================================================
    # Lifecycle
    # ==================================================================

    def _wire_callbacks(self) -> None:
        self.pipeline.on_cv_event = self._on_cv_event
        self.pipeline.on_pose_event = self._on_pose_event
        self.pipeline.on_stroke_event = self._on_stroke_event
        self.pipeline.on_error = self._on_error
        self.pipeline.on_progress = self._on_progress
        self.pipeline.on_health_event = self._on_health_event

    def start(self) -> None:
        self._running = True

        if self.use_websockets:
            self._server_thread = threading.Thread(
                target=self._run_websocket_server, daemon=True,
            )
        else:
            self._server_thread = threading.Thread(
                target=self._run_tcp_server, daemon=True,
            )
        self._server_thread.start()
        self._start_metrics_timer()

    def stop(self) -> None:
        self._running = False
        if self._metrics_timer:
            self._metrics_timer.cancel()
        if self._server_thread and self._server_thread.is_alive():
            self._server_thread.join(timeout=3.0)

    # ==================================================================
    # Broadcast
    # ==================================================================

    def broadcast(self, msg: dict) -> None:
        """Broadcast a dict to all connected clients.

        Automatically serialises to JSON or msgpack based on
        each client's negotiated protocol.
        """
        json_str: str | None = None
        binary_data: bytes | None = None

        with self._lock:
            stale_cids: list[int] = []
            now = time.monotonic()

            for cid, client in list(self._clients.items()):
                if now - client.last_heartbeat > self.CLIENT_STALE_TIMEOUT:
                    stale_cids.append(cid)
                    continue

                try:
                    if client.protocol == "binary":
                        if binary_data is None:
                            binary_data = _msgpack_encode(msg)
                        self._send(client, binary_data, is_binary=True)
                    else:
                        if json_str is None:
                            json_str = json.dumps(msg, default=_json_default)
                        self._send(client, json_str, is_binary=False)
                except Exception:
                    stale_cids.append(cid)

            for cid in stale_cids:
                self._clients.pop(cid, None)

    def broadcast_event(self, ev: StreamingEvent) -> None:
        """Broadcast a pipeline event respecting per‑client channels."""
        json_str: str | None = None

        with self._lock:
            stale_cids: list[int] = []
            now = time.monotonic()

            for cid, client in list(self._clients.items()):
                if now - client.last_heartbeat > self.CLIENT_STALE_TIMEOUT:
                    stale_cids.append(cid)
                    continue

                allowed = _CHANNEL_FILTERS.get(client.channel, set())
                if ev.type not in allowed:
                    continue

                try:
                    if client.protocol == "binary":
                        builder = _BINARY_BUILDERS.get(ev.type)
                        if builder:
                            self._send(client, builder(ev), is_binary=True)
                    else:
                        builder = _JSON_BUILDERS.get(ev.type)
                        if builder:
                            if json_str is None:
                                json_str = json.dumps(
                                    builder(ev), default=_json_default,
                                )
                            self._send(client, json_str, is_binary=False)
                except Exception:
                    stale_cids.append(cid)

            for cid in stale_cids:
                self._clients.pop(cid, None)

    def _send(self, client: _Client, data: str | bytes, *,
              is_binary: bool = False) -> None:
        """Send data to a client, handling sync TCP and async WebSocket."""
        if self.use_websockets and self._loop is not None:
            asyncio.run_coroutine_threadsafe(
                _ws_send(client.ws, data, is_binary=is_binary), self._loop,
            )
        else:
            if isinstance(data, str):
                client.ws.sendall((data + "\n").encode())
            else:
                client.ws.sendall(data)

    # ==================================================================
    # Client management
    # ==================================================================

    def register_client(self, ws: Any, protocol: str = "json") -> int:
        with self._lock:
            self._client_counter += 1
            cid = self._client_counter
            self._clients[cid] = _Client(ws, protocol)
            return cid

    def remove_client(self, cid: int) -> None:
        with self._lock:
            self._clients.pop(cid, None)

    def heartbeat_client(self, cid: int, channel: str | None = None) -> None:
        with self._lock:
            client = self._clients.get(cid)
            if client is not None:
                client.last_heartbeat = time.monotonic()
                if channel and channel in _CHANNEL_FILTERS:
                    client.channel = channel

    @property
    def client_count(self) -> int:
        with self._lock:
            self._purge_stale()
            return len(self._clients)

    def _purge_stale(self) -> None:
        now = time.monotonic()
        stale = [
            cid for cid, c in self._clients.items()
            if now - c.last_heartbeat > self.CLIENT_STALE_TIMEOUT
        ]
        for cid in stale:
            self._clients.pop(cid, None)

    # ==================================================================
    # Event handlers
    # ==================================================================

    def _on_cv_event(self, ev: StreamingEvent) -> None:
        self.broadcast_event(ev)

    def _on_pose_event(self, ev: StreamingEvent) -> None:
        self.broadcast_event(ev)

    def _on_stroke_event(self, ev: StreamingEvent) -> None:
        self.broadcast_event(ev)

    def _on_error(self, ev: StreamingEvent) -> None:
        self.broadcast_event(ev)

    def _on_progress(self, ev: StreamingEvent) -> None:
        self.broadcast_event(ev)

    def _on_health_event(self, ev: StreamingEvent) -> None:
        self.broadcast_event(ev)

    # ==================================================================
    # Metrics timer
    # ==================================================================

    def _start_metrics_timer(self) -> None:
        def _push_metrics() -> None:
            if self._running:
                self.broadcast(_metrics_msg(self.pipeline.get_metrics()))
                self._metrics_timer = threading.Timer(
                    self.METRICS_INTERVAL, _push_metrics,
                )
                self._metrics_timer.daemon = True
                self._metrics_timer.start()

        self._metrics_timer = threading.Timer(self.METRICS_INTERVAL, _push_metrics)
        self._metrics_timer.daemon = True
        self._metrics_timer.start()

    # ==================================================================
    # Server implementations
    # ==================================================================

    def _run_websocket_server(self) -> None:
        try:
            import websockets
        except ImportError:
            print("websockets not installed — using TCP fallback")
            self._run_tcp_server()
            return

        async def handler(ws: Any, path: str = "/") -> None:
            cid = self.register_client(ws, "json")

            try:
                # Negotiation: first non‑empty text → channel / protocol
                async for msg in ws:
                    if isinstance(msg, bytes):
                        # Binary client — switch to binary protocol
                        self.heartbeat_client(cid)
                        with self._lock:
                            client = self._clients.get(cid)
                            if client:
                                client.protocol = "binary"
                        continue

                    # Try to parse channel negotiation
                    parts = msg.strip().lower().split()
                    if parts:
                        channel = parts[0] if parts[0] in _CHANNEL_FILTERS else "all"
                        protocol = "binary" if len(parts) > 1 and parts[1] == "binary" else "json"
                        self.heartbeat_client(cid, channel)
                        with self._lock:
                            client = self._clients.get(cid)
                            if client:
                                client.protocol = protocol
                        self.broadcast({
                            "type": "welcome",
                            "client_id": cid,
                            "protocol": protocol,
                            "channel": channel,
                        })
                    break
            finally:
                self.remove_client(cid)

        async def serve() -> None:
            async with websockets.serve(handler, self.host, self.port):
                self._loop = asyncio.get_running_loop()
                await asyncio.Future()

        asyncio.run(serve())

    def _run_tcp_server(self) -> None:
        import socketserver

        _server = self  # capture RealtimeServer ref before shadowing

        class _Handler(socketserver.StreamRequestHandler):
            def handle(self) -> None:  # noqa: N805 (self = handler, _server = server)
                self.request.settimeout(None)
                cid = _server.register_client(self.request, "json")

                try:
                    while _server._running:
                        data = self.rfile.readline()
                        if not data:
                            break

                        # Negotiation
                        msg = data.decode().strip().lower()
                        parts = msg.split()
                        channel = (
                            parts[0]
                            if parts and parts[0] in _CHANNEL_FILTERS
                            else "all"
                        )
                        _server.heartbeat_client(cid, channel)
                        break

                    while _server._running:
                        data = self.rfile.readline()
                        if not data:
                            break
                        _server.heartbeat_client(cid)
                except Exception:
                    pass
                finally:
                    _server.remove_client(cid)

        try:
            server = socketserver.ThreadingTCPServer(
                (self.host, self.port), _Handler,
            )
            server.serve_forever()
        except Exception as e:
            print(f"TCP server error: {e}")


# ============================================================================
# Async helpers
# ============================================================================


async def _ws_send(ws: Any, data: str | bytes, *,
                   is_binary: bool = False) -> None:
    try:
        if is_binary:
            await ws.send(data)
        else:
            await ws.send(data)
    except Exception:
        pass


def _json_default(obj: Any) -> Any:
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)


# ============================================================================
# Convenience runner
# ============================================================================


def run_realtime_session(
    video_path: str | None = None,
    host: str = "0.0.0.0",
    port: int = 8765,
    use_real_cv: bool = False,
    use_real_pose: bool = False,
    use_real_ml: bool = False,
    use_websockets: bool = True,
) -> tuple[StreamingPipeline, RealtimeServer]:
    """One‑shot: create pipeline + server for real‑time analysis.

    Args:
        video_path: Path to video, or None for camera/live feed.
        host: WebSocket listen host.
        port: WebSocket listen port.
        use_real_cv: Use real YOLO detector (requires ultralytics).
        use_real_pose: Use real MediaPipe (requires mediapipe).
        use_real_ml: Use real BiLSTM classifier (requires torch).
        use_websockets: Prefer websockets lib over raw TCP.

    Returns:
        (pipeline, server) tuple.
    """
    pipeline = StreamingPipeline(
        use_real_cv=use_real_cv,
        use_real_pose=use_real_pose,
        use_real_ml=use_real_ml,
    )
    server = RealtimeServer(
        pipeline, host=host, port=port, use_websockets=use_websockets,
    )

    server.start()

    if video_path:
        metrics = pipeline.push_video(video_path)
        print(
            f"\nSession complete: {metrics.total_frames} frames, "
            f"{metrics.stroke_count} strokes, "
            f"max speed {metrics.max_speed_kmh:.0f} km/h"
        )
        server.stop()

    return pipeline, server
