"""Pose keypoint extraction using MediaPipe Holistic.

Provides PoseExtractor class that extracts 13 key body joints from
video frames using MediaPipe's Holistic solution, returning structured
keypoint dictionaries with {x, y, z, visibility} for each joint.
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    mp = None


# MediaPipe landmark indices for our 13 key joints
KEY_JOINTS = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
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


class PoseExtractor:
    """Extracts body keypoints using MediaPipe Holistic.

    Returns 13 key joints (both wrists, elbows, shoulders, hips,
    knees, ankles, and nose), each with {x, y, z, visibility}.

    Usage:
        with PoseExtractor() as extractor:
            keypoints = extractor.extract_from_frame(frame)
            sequence = extractor.extract_from_video("video.mp4")
    """

    NUM_LANDMARKS = 33

    def __init__(
        self,
        static_image_mode: bool = False,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        """Initialize the pose extractor.

        Args:
            static_image_mode: If True, treats each frame independently.
            min_detection_confidence: Minimum confidence for person detection.
            min_tracking_confidence: Minimum confidence for landmark tracking.

        Raises:
            ImportError: If mediapipe is not installed.
        """
        if mp is None:
            raise ImportError("mediapipe is required — pip install mediapipe")
        self.mp_holistic = mp.solutions.holistic
        self.holistic = self.mp_holistic.Holistic(
            static_image_mode=static_image_mode,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def extract_from_frame(self, frame: np.ndarray) -> dict[str, dict[str, float]] | None:
        """Extract 13 key joint keypoints from a single frame.

        Args:
            frame: BGR image as numpy array (H, W, 3).

        Returns:
            Dict mapping joint names to {x, y, z, visibility} dicts,
            or None if no pose detected. Contains all 13 key joints:
            nose, left/right shoulder, elbow, wrist, hip, knee, ankle.
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.holistic.process(rgb)
        if results.pose_landmarks is None:
            return None

        keypoints: dict[str, dict[str, float]] = {}
        for joint_name, landmark_idx in KEY_JOINTS.items():
            lm = results.pose_landmarks.landmark[landmark_idx]
            keypoints[joint_name] = {
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(lm.visibility),
            }
        return keypoints

    def extract_raw(self, frame: np.ndarray) -> np.ndarray | None:
        """Extract all 33 landmarks as a raw numpy array.

        Args:
            frame: BGR image as numpy array (H, W, 3).

        Returns:
            Array of shape (33, 4) with [x, y, z, visibility] per landmark,
            or None if no pose detected.
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.holistic.process(rgb)
        if results.pose_landmarks is None:
            return None
        landmarks = np.array([
            [lm.x, lm.y, lm.z, lm.visibility]
            for lm in results.pose_landmarks.landmark
        ])
        return landmarks

    def extract_from_video(self, video_path: str) -> list[dict[str, dict[str, float]] | None]:
        """Extract keypoints from all frames in a video.

        Args:
            video_path: Path to the video file.

        Returns:
            List of keypoint dicts (one per frame), with None for
            frames where no pose was detected.
        """
        cap = cv2.VideoCapture(video_path)
        keypoints_sequence: list[dict[str, dict[str, float]] | None] = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            kps = self.extract_from_frame(frame)
            keypoints_sequence.append(kps)
        cap.release()
        return keypoints_sequence

    def close(self) -> None:
        """Release MediaPipe resources."""
        self.holistic.close()

    def __enter__(self) -> "PoseExtractor":
        """Context manager entry."""
        return self

    def __exit__(self, *args: Any) -> None:
        """Context manager exit — releases resources."""
        self.close()


if __name__ == "__main__":
    print("PoseExtractor Demo")
    print("=" * 40)
    print(f"Tracking {len(KEY_JOINTS)} key joints:")
    for name, idx in KEY_JOINTS.items():
        print(f"  {name} (MediaPipe landmark {idx})")

    print("\nExpected output format per joint:")
    print("  {'x': 0.52, 'y': 0.31, 'z': -0.08, 'visibility': 0.99}")

    # Demo with synthetic data
    print("\nGenerating synthetic keypoints...")
    dummy_keypoints: dict[str, dict[str, float]] = {}
    for joint_name in KEY_JOINTS:
        dummy_keypoints[joint_name] = {
            "x": float(np.random.rand()),
            "y": float(np.random.rand()),
            "z": float(np.random.randn() * 0.1),
            "visibility": float(np.random.uniform(0.8, 1.0)),
        }

    for name, kp in list(dummy_keypoints.items())[:5]:
        print(f"  {name}: x={kp['x']:.3f}, y={kp['y']:.3f}, "
              f"z={kp['z']:.3f}, vis={kp['visibility']:.3f}")
    print(f"  ... ({len(dummy_keypoints)} joints total)")
