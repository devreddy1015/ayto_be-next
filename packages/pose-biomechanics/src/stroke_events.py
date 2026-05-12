"""Stroke event detection from pose sequences.

Uses wrist velocity analysis with a 2-sigma threshold to detect
stroke events in a sequence of pose keypoints, identifying the
start, peak, and end frames of each stroke.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

try:
    from .angles import JointAngleComputer
except ImportError:
    from angles import JointAngleComputer


@dataclass
class StrokeEvent:
    """A detected stroke event with timing and biomechanics data.

    Attributes:
        start_frame: Frame index where the stroke preparation begins.
        peak_frame: Frame index of maximum wrist velocity.
        end_frame: Frame index where the stroke follow-through ends.
        peak_wrist_speed: Maximum wrist velocity during the stroke.
        dominant_hand: 'right' or 'left' based on which wrist was faster.
    """
    start_frame: int
    peak_frame: int
    end_frame: int
    peak_wrist_speed: float
    dominant_hand: str


class StrokeDetector:
    """Detects stroke events from a pose keypoint sequence.

    Uses a 2-sigma threshold on wrist velocity to identify strokes,
    with a minimum gap of 15 frames between events.
    """

    WINDOW_BEFORE = 15
    WINDOW_AFTER = 15
    MIN_GAP_FRAMES = 15

    def __init__(self, fps: float = 60.0) -> None:
        """Initialize the stroke detector.

        Args:
            fps: Video frame rate for velocity computation.
        """
        self.fps = fps
        self.angle_computer = JointAngleComputer()

    def detect(
        self,
        pose_sequence: list[np.ndarray | None],
    ) -> list[StrokeEvent]:
        """Detect stroke events in a pose sequence.

        Computes wrist velocities for both hands, determines the
        dominant hand, then finds peaks using a 2-sigma threshold
        with a minimum gap of 15 frames between events.

        Args:
            pose_sequence: List of (33, 4) landmark arrays, or None
                for frames with no detected pose.

        Returns:
            List of StrokeEvent objects sorted by peak_frame.
        """
        right_vel = self._compute_wrist_velocities(pose_sequence, "right")
        left_vel = self._compute_wrist_velocities(pose_sequence, "left")

        # Determine dominant hand per-peak by comparing velocities
        combined_vel = [max(r, l) for r, l in zip(right_vel, left_vel)]
        dominant_per_frame = [
            "right" if r >= l else "left"
            for r, l in zip(right_vel, left_vel)
        ]

        peaks = self._find_peaks_2sigma(combined_vel)
        events: list[StrokeEvent] = []

        for peak_frame in peaks:
            start = max(0, peak_frame - self.WINDOW_BEFORE)
            end = min(len(pose_sequence) - 1, peak_frame + self.WINDOW_AFTER)

            events.append(
                StrokeEvent(
                    start_frame=start,
                    peak_frame=peak_frame,
                    end_frame=end,
                    peak_wrist_speed=combined_vel[peak_frame],
                    dominant_hand=dominant_per_frame[peak_frame],
                )
            )
        return events

    def _compute_wrist_velocities(
        self,
        keypoints_sequence: list[np.ndarray | None],
        side: str,
    ) -> list[float]:
        """Compute per-frame wrist velocity for one side.

        Args:
            keypoints_sequence: Sequence of (33,4) arrays or None.
            side: 'right' or 'left'.

        Returns:
            List of velocity values, one per frame.
        """
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

    def _find_peaks_2sigma(self, velocities: list[float]) -> list[int]:
        """Find velocity peaks using a 2-sigma threshold.

        A peak must:
        - Exceed mean + 2*std of all velocities
        - Be a local maximum (higher than both neighbors)
        - Be at least MIN_GAP_FRAMES from the previous peak

        Args:
            velocities: Per-frame velocity values.

        Returns:
            List of peak frame indices.
        """
        arr = np.array(velocities)
        mean_v = float(np.mean(arr))
        std_v = float(np.std(arr))
        threshold = mean_v + 2.0 * std_v

        peaks: list[int] = []
        last_peak = -self.MIN_GAP_FRAMES - 1

        for i in range(1, len(velocities) - 1):
            if (
                velocities[i] > threshold
                and velocities[i] >= velocities[i - 1]
                and velocities[i] >= velocities[i + 1]
                and (i - last_peak) >= self.MIN_GAP_FRAMES
            ):
                peaks.append(i)
                last_peak = i
        return peaks


# Keep backward compatibility alias
StrokeEventDetector = StrokeDetector


if __name__ == "__main__":
    print("StrokeDetector Demo")
    print("=" * 40)

    # Generate synthetic pose sequence with velocity spikes
    np.random.seed(42)
    n_frames = 120
    sequence: list[np.ndarray | None] = []
    for i in range(n_frames):
        lm = np.random.rand(33, 4).astype(np.float32) * 0.01
        # Add baseline position
        lm[16, :3] = [0.5 + i * 0.001, 0.5, 0.0]
        # Inject velocity spikes at frames 30 and 80
        if i in (30, 31):
            lm[16, :3] = [0.5 + i * 0.001 + 0.3, 0.5, 0.0]
        if i in (80, 81):
            lm[16, :3] = [0.5 + i * 0.001 + 0.25, 0.5, 0.0]
        sequence.append(lm)

    detector = StrokeDetector(fps=60.0)
    events = detector.detect(sequence)

    print(f"Detected {len(events)} stroke events:")
    for e in events:
        print(f"  frames [{e.start_frame}-{e.peak_frame}-{e.end_frame}], "
              f"speed={e.peak_wrist_speed:.2f}, hand={e.dominant_hand}")
