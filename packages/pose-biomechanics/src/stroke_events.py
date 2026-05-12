from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .angles import JointAngleComputer


@dataclass
class StrokeEvent:
    frame_start: int
    frame_peak: int
    frame_end: int
    peak_wrist_velocity: float
    peak_elbow_angle: float
    side: str


class StrokeEventDetector:
    VELOCITY_THRESHOLD = 0.8
    WINDOW_BEFORE = 15
    WINDOW_AFTER = 15
    MIN_GAP_FRAMES = 10

    def __init__(self, fps: float = 60.0) -> None:
        self.fps = fps
        self.angle_computer = JointAngleComputer()

    def detect(
        self,
        keypoints_sequence: list[np.ndarray | None],
        side: str = "right",
    ) -> list[StrokeEvent]:
        velocities = self._compute_wrist_velocities(keypoints_sequence, side)
        peaks = self._find_peaks(velocities)
        events: list[StrokeEvent] = []
        for peak_frame in peaks:
            start = max(0, peak_frame - self.WINDOW_BEFORE)
            end = min(len(keypoints_sequence) - 1, peak_frame + self.WINDOW_AFTER)

            elbow_angle = 0.0
            kps = keypoints_sequence[peak_frame]
            if kps is not None:
                angles = self.angle_computer.compute_all_angles(kps)
                key = f"{side}_elbow"
                elbow_angle = angles.get(key, 0.0)

            events.append(
                StrokeEvent(
                    frame_start=start,
                    frame_peak=peak_frame,
                    frame_end=end,
                    peak_wrist_velocity=velocities[peak_frame],
                    peak_elbow_angle=elbow_angle,
                    side=side,
                )
            )
        return events

    def _compute_wrist_velocities(
        self,
        keypoints_sequence: list[np.ndarray | None],
        side: str,
    ) -> list[float]:
        velocities = [0.0]
        for i in range(1, len(keypoints_sequence)):
            prev = keypoints_sequence[i - 1]
            curr = keypoints_sequence[i]
            if prev is None or curr is None:
                velocities.append(0.0)
            else:
                v = JointAngleComputer.wrist_velocity(prev, curr, self.fps, side)
                velocities.append(v)
        return velocities

    def _find_peaks(self, velocities: list[float]) -> list[int]:
        peaks: list[int] = []
        last_peak = -self.MIN_GAP_FRAMES - 1
        for i in range(1, len(velocities) - 1):
            if (
                velocities[i] > self.VELOCITY_THRESHOLD
                and velocities[i] >= velocities[i - 1]
                and velocities[i] >= velocities[i + 1]
                and (i - last_peak) >= self.MIN_GAP_FRAMES
            ):
                peaks.append(i)
                last_peak = i
        return peaks
