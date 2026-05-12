from __future__ import annotations

from typing import Any

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    mp = None


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


class KeypointExtractor:
    NUM_LANDMARKS = 33

    def __init__(
        self,
        static_image_mode: bool = False,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        if mp is None:
            raise ImportError("mediapipe is required — pip install mediapipe")
        self.mp_holistic = mp.solutions.holistic
        self.holistic = self.mp_holistic.Holistic(
            static_image_mode=static_image_mode,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def extract(self, frame: np.ndarray) -> np.ndarray | None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.holistic.process(rgb)
        if results.pose_landmarks is None:
            return None
        landmarks = np.array([
            [lm.x, lm.y, lm.z, lm.visibility]
            for lm in results.pose_landmarks.landmark
        ])
        return landmarks

    def extract_from_video(self, video_path: str) -> list[np.ndarray | None]:
        cap = cv2.VideoCapture(video_path)
        keypoints_sequence: list[np.ndarray | None] = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            kps = self.extract(frame)
            keypoints_sequence.append(kps)
        cap.release()
        return keypoints_sequence

    def close(self) -> None:
        self.holistic.close()

    def __enter__(self) -> "KeypointExtractor":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
