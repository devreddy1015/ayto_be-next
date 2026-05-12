"""Pose keypoint extraction using MediaPipe PoseLandmarker.

Supports both legacy mp.solutions API and modern mp.tasks API.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    mp = None

KEY_JOINTS = {
    "nose": 0,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
}

LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

_HAS_SOLUTIONS_API = False
_HAS_TASKS_API = False

if mp is not None:
    _HAS_SOLUTIONS_API = hasattr(mp, "solutions")
    _HAS_TASKS_API = hasattr(mp, "tasks")


class PoseExtractor:
    NUM_LANDMARKS = 33

    def __init__(
        self,
        static_image_mode: bool = False,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        if mp is None:
            raise ImportError("mediapipe is required — pip install mediapipe")

        self._backend: str | None = None
        self._holistic: Any = None
        self._task_detector: Any = None

        if _HAS_SOLUTIONS_API:
            try:
                self._holistic = mp.solutions.holistic.Holistic(
                    static_image_mode=static_image_mode,
                    min_detection_confidence=min_detection_confidence,
                    min_tracking_confidence=min_tracking_confidence,
                )
                self._backend = "solutions"
            except Exception:
                pass

        if self._backend is None and _HAS_TASKS_API:
            try:
                from mediapipe.tasks import python as mp_python
                from mediapipe.tasks.python import vision

                options = vision.PoseLandmarkerOptions(
                    base_options=mp_python.BaseOptions(
                        model_asset_buffer=_get_default_pose_model()
                    ),
                    running_mode=vision.RunningMode.IMAGE,
                    num_poses=1,
                    min_pose_detection_confidence=min_detection_confidence,
                    min_tracking_confidence=min_tracking_confidence,
                )
                self._task_detector = vision.PoseLandmarker.create_from_options(options)
                self._backend = "tasks"
            except Exception:
                pass

        if self._backend is None:
            raise RuntimeError(
                "No MediaPipe backend available. Install mediapipe>=0.10.0 "
                "or mediapipe<0.10.15 for solutions API support."
            )

    def _process_solutions(self, frame: np.ndarray) -> Any:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return self._holistic.process(rgb)

    def _process_tasks(self, frame: np.ndarray) -> Any:
        from mediapipe import Image, ImageFormat
        mp_image = Image(image_format=ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        return self._task_detector.detect(mp_image)

    def extract_from_frame(self, frame: np.ndarray) -> dict[str, dict[str, float]] | None:
        if self._backend == "solutions":
            results = self._process_solutions(frame)
            if results.pose_landmarks is None:
                return None
            keypoints: dict[str, dict[str, float]] = {}
            for joint_name, idx in KEY_JOINTS.items():
                lm = results.pose_landmarks.landmark[idx]
                keypoints[joint_name] = {
                    "x": float(lm.x), "y": float(lm.y),
                    "z": float(lm.z), "visibility": float(lm.visibility),
                }
            return keypoints
        elif self._backend == "tasks":
            results = self._process_tasks(frame)
            if not results.pose_landmarks:
                return None
            landmarks = results.pose_landmarks[0]
            keypoints = {}
            for joint_name, idx in KEY_JOINTS.items():
                lm = landmarks[idx]
                keypoints[joint_name] = {
                    "x": float(lm.x), "y": float(lm.y),
                    "z": float(lm.z), "visibility": float(lm.visibility or 0.0),
                }
            return keypoints
        return None

    def extract_raw(self, frame: np.ndarray) -> np.ndarray | None:
        if self._backend == "solutions":
            results = self._process_solutions(frame)
            if results.pose_landmarks is None:
                return None
            return np.array([
                [lm.x, lm.y, lm.z, lm.visibility]
                for lm in results.pose_landmarks.landmark
            ])
        elif self._backend == "tasks":
            results = self._process_tasks(frame)
            if not results.pose_landmarks:
                return None
            return np.array([
                [lm.x, lm.y, lm.z, lm.visibility or 0.0]
                for lm in results.pose_landmarks[0]
            ])
        return None

    def extract_from_video(self, video_path: str) -> list[dict[str, dict[str, float]] | None]:
        cap = cv2.VideoCapture(video_path)
        sequence: list[dict[str, dict[str, float]] | None] = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            sequence.append(self.extract_from_frame(frame))
        cap.release()
        return sequence

    def close(self) -> None:
        if self._holistic is not None:
            self._holistic.close()
        if self._task_detector is not None:
            self._task_detector.close()

    def __enter__(self) -> "PoseExtractor":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


def _get_default_pose_model() -> bytes:
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
