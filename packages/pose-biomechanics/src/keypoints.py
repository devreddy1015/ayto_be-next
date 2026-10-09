"""Pose keypoint extraction: RTMPose (preferred) or MediaPipe BlazePose.

RTMPose is far more accurate than BlazePose on COCO single-person val
(RTMPose-t 72.1 / -s 77.1 / -m 82.4 AP vs BlazePose-Full 35.4 AP) and fast on
phones (RTMPose-s 13.9 ms FP16 on a Snapdragon 865, ncnn). It runs through the
optional ``rtmlib`` package (ONNX Runtime; models download on first use).
BlazePose stays as the fallback when rtmlib isn't installed.

Whatever the backend, frames come out in the 33-landmark BlazePose layout,
``(33, 4)`` rows of ``[x, y, z, visibility]`` with x, y normalised to [0, 1],
because the rest of the stack (angles, normaliser, classifier) indexes
landmarks that way. RTMPose's 17 COCO joints fill their BlazePose slots.
Landmarks COCO lacks (fingers, heels, mouth) get visibility 0 and z = 0.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

KEY_JOINTS = {
    "nose": 0,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
}

NUM_LANDMARKS = 33

# COCO-17 index -> BlazePose-33 index
COCO_TO_BLAZEPOSE = {
    0: 0,    # nose
    1: 2,    # left eye
    2: 5,    # right eye
    3: 7,    # left ear
    4: 8,    # right ear
    5: 11, 6: 12,    # shoulders
    7: 13, 8: 14,    # elbows
    9: 15, 10: 16,   # wrists
    11: 23, 12: 24,  # hips
    13: 25, 14: 26,  # knees
    15: 27, 16: 28,  # ankles
}


def coco17_to_blazepose(
    keypoints: np.ndarray, scores: np.ndarray, image_size: tuple[int, int],
) -> np.ndarray:
    """Convert one person's COCO-17 pixel keypoints to the (33, 4) layout.

    Args:
        keypoints: (17, 2) pixel coordinates.
        scores: (17,) confidences.
        image_size: (width, height) of the frame.

    Returns:
        (33, 4) array; landmarks COCO lacks have visibility 0.
    """
    w, h = image_size
    out = np.zeros((NUM_LANDMARKS, 4), dtype=np.float32)
    src = np.fromiter(COCO_TO_BLAZEPOSE.keys(), dtype=int)
    dst = np.fromiter(COCO_TO_BLAZEPOSE.values(), dtype=int)
    out[dst, 0] = keypoints[src, 0] / w
    out[dst, 1] = keypoints[src, 1] / h
    out[dst, 3] = np.clip(scores[src], 0.0, 1.0)
    return out


def _select_main_person(keypoints: np.ndarray, scores: np.ndarray) -> int:
    """Index of the player to analyse: the largest confident skeleton.

    With the camera behind the near baseline that's the near-court player.
    """
    best, best_area = 0, -1.0
    for i, (kp, sc) in enumerate(zip(keypoints, scores)):
        good = kp[sc > 0.3]
        if len(good) < 5:
            continue
        span = good.max(axis=0) - good.min(axis=0)
        area = float(span[0] * span[1])
        if area > best_area:
            best, best_area = i, area
    return best


class PoseExtractor:
    """Single-player pose extractor with a pluggable backend.

    Args:
        backend: ``"auto"`` (RTMPose if rtmlib is installed, else MediaPipe),
            ``"rtmpose"`` or ``"mediapipe"``.
        rtmpose_mode: rtmlib preset: ``"lightweight"`` (RTMPose-t class),
            ``"balanced"`` (-m class) or ``"performance"``.
        static_image_mode: MediaPipe only; treat frames independently.
        min_detection_confidence: Detector threshold (MediaPipe).
        min_tracking_confidence: Tracker threshold (MediaPipe).
        device: ``"cpu"`` or ``"cuda"`` for rtmlib.
    """

    NUM_LANDMARKS = NUM_LANDMARKS

    def __init__(
        self,
        backend: str = "auto",
        rtmpose_mode: str = "balanced",
        static_image_mode: bool = False,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        device: str = "cpu",
    ) -> None:
        self.backend: str | None = None
        self._impl: Any = None

        if backend in ("auto", "rtmpose"):
            try:
                from rtmlib import Body

                self._impl = Body(mode=rtmpose_mode, backend="onnxruntime", device=device)
                self.backend = "rtmpose"
            except ImportError:
                if backend == "rtmpose":
                    raise ImportError(
                        "rtmlib is required for RTMPose: pip install rtmlib"
                    ) from None

        if self.backend is None and backend in ("auto", "mediapipe"):
            self._init_mediapipe(
                static_image_mode, min_detection_confidence, min_tracking_confidence,
            )

        if self.backend is None:
            raise RuntimeError(
                f"No pose backend available for {backend!r}. "
                "Install rtmlib (RTMPose) or mediapipe>=0.10."
            )

    def _init_mediapipe(self, static: bool, det_conf: float, track_conf: float) -> None:
        try:
            import mediapipe as mp
        except ImportError:
            return
        if hasattr(mp, "solutions"):
            try:
                self._impl = mp.solutions.pose.Pose(
                    static_image_mode=static,
                    min_detection_confidence=det_conf,
                    min_tracking_confidence=track_conf,
                )
                self.backend = "mediapipe"
                return
            except Exception:
                pass
        if hasattr(mp, "tasks"):
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision

            options = vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_buffer=_default_pose_model()),
                running_mode=vision.RunningMode.IMAGE,
                num_poses=1,
                min_pose_detection_confidence=det_conf,
                min_tracking_confidence=track_conf,
            )
            self._impl = vision.PoseLandmarker.create_from_options(options)
            self.backend = "mediapipe-tasks"

    def extract_raw(self, frame: np.ndarray) -> np.ndarray | None:
        """Return the main player's (33, 4) landmarks for a BGR frame, or None."""
        if self.backend == "rtmpose":
            keypoints, scores = self._impl(frame)
            if keypoints is None or len(keypoints) == 0:
                return None
            i = _select_main_person(np.asarray(keypoints), np.asarray(scores))
            h, w = frame.shape[:2]
            return coco17_to_blazepose(np.asarray(keypoints[i]), np.asarray(scores[i]), (w, h))

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if self.backend == "mediapipe":
            result = self._impl.process(rgb)
            landmarks = result.pose_landmarks.landmark if result.pose_landmarks else None
        else:
            from mediapipe import Image, ImageFormat

            result = self._impl.detect(Image(image_format=ImageFormat.SRGB, data=rgb))
            landmarks = result.pose_landmarks[0] if result.pose_landmarks else None
        if landmarks is None:
            return None
        return np.array(
            [[lm.x, lm.y, lm.z, lm.visibility or 0.0] for lm in landmarks], dtype=np.float32,
        )

    def extract_from_frame(self, frame: np.ndarray) -> dict[str, dict[str, float]] | None:
        """Named key joints for one frame (``{"left_elbow": {"x":..}, ...}``) or None."""
        raw = self.extract_raw(frame)
        if raw is None:
            return None
        return {
            name: {"x": float(raw[i, 0]), "y": float(raw[i, 1]),
                   "z": float(raw[i, 2]), "visibility": float(raw[i, 3])}
            for name, i in KEY_JOINTS.items()
        }

    def extract_from_video(self, video_path: str) -> list[np.ndarray | None]:
        """(33, 4) landmarks (or None) for every frame of a video."""
        cap = cv2.VideoCapture(video_path)
        sequence: list[np.ndarray | None] = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            sequence.append(self.extract_raw(frame))
        cap.release()
        return sequence

    def close(self) -> None:
        if hasattr(self._impl, "close"):
            self._impl.close()

    def __enter__(self) -> PoseExtractor:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


def _default_pose_model() -> bytes:
    import os
    import urllib.request

    model_path = os.path.expanduser("~/.cache/mediapipe/pose_landmarker_lite.task")
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    if not os.path.exists(model_path):
        url = (
            "https://storage.googleapis.com/mediapipe-models/"
            "pose_landmarker/pose_landmarker_lite/float16/latest/"
            "pose_landmarker_lite.task"
        )
        urllib.request.urlretrieve(url, model_path)
    with open(model_path, "rb") as f:
        return f.read()
