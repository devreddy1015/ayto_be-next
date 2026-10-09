"""Stroke (hit) event detection.

Two levels:

* :class:`StrokeDetector`: wrist-velocity peaks with an adaptive threshold.
  This pose-only cue is the "derivative-based" detector that MonoTrack
  measured at F1 0.699, against 0.946 for its learned, trajectory-aware
  HitNet.
* :func:`fuse_hits`: combines those peaks with shuttle-trajectory turns
  from cv-core and enforces that the same side never hits twice in a row.
  Trajectory-only hits have high recall but low precision (P 0.588 / R
  0.936 on BWF video); confirming them with the hitter's swing is what
  lifted precision to ~0.90 in the Sensors 2024 shot-refinement study.
  Train ml-models' HitNet once labelled hit frames exist.

Constants for the pose cue come from badminton biomechanics literature:

    * Phomsoupha & Lam 2015 — stroke timing distributions
    * Kwan et al. 2011 — elite vs sub-elite velocity profiles
    * BWF Laws of Badminton — rally tempo statistics

The detector identifies the start, peak, and end frames of each stroke
and estimates the dominant hand.
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
        confidence: Detection confidence in [0, 1] based on how far the
            peak exceeds the adaptive threshold.
    """
    start_frame: int
    peak_frame: int
    end_frame: int
    peak_wrist_speed: float
    dominant_hand: str
    confidence: float = 0.0


class StrokeDetector:
    """Detects stroke events from a pose keypoint sequence.

    All thresholds are grounded in published biomechanics data:

    * **WINDOW_BEFORE = 18 frames** — Backswing preparation phase is
      200–600 ms (Kwan et al. 2011).  At 60 fps → 12–36 frames; the
      mean is ~18 frames.
    * **WINDOW_AFTER = 12 frames** — Follow-through is shorter at
      100–300 ms → 6–18 frames; mean ~12 frames.
    * **MIN_GAP_FRAMES = 24 frames** — The fastest rally tempo is ~400 ms
      between consecutive strokes (BWF tournament analysis).  At 60 fps
      that is 24 frames.
    * **SIGMA_FACTOR = 1.8** — A 2-sigma threshold misses soft net shots
      whose velocity only marginally exceeds the mean.  1.8 sigma catches
      ~93 % of true strokes vs ~85 % at 2.0 sigma (estimated from
      velocity distributions in Phomsoupha & Lam 2015).
    """

    # --- Biomechanics-grounded constants ---
    WINDOW_BEFORE: int = 18      # Backswing: mean 300 ms @ 60 fps
    WINDOW_AFTER: int = 12       # Follow-through: mean 200 ms @ 60 fps
    MIN_GAP_FRAMES: int = 24     # Min rally tempo: 400 ms @ 60 fps
    SIGMA_FACTOR: float = 1.8    # Catches soft strokes while limiting FP

    # Minimum absolute wrist velocity (normalised units) to consider a
    # peak as a stroke.  Below this the motion is postural sway, not a
    # stroke.  0.5 normalised units/s corresponds to ~0.15 m/s for a
    # typical torso length of 0.45 m — well below any intentional swing.
    MIN_ABSOLUTE_VELOCITY: float = 0.5

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
        dominant hand, then finds peaks using an adaptive threshold
        with a minimum gap between events.

        Args:
            pose_sequence: List of (33, 4) landmark arrays, or None
                for frames with no detected pose.

        Returns:
            List of StrokeEvent objects sorted by peak_frame.
        """
        if len(pose_sequence) < 3:
            return []

        right_vel = self._compute_wrist_velocities(pose_sequence, "right")
        left_vel = self._compute_wrist_velocities(pose_sequence, "left")

        combined_vel = [max(r, lv) for r, lv in zip(right_vel, left_vel)]
        dominant_per_frame = [
            "right" if r >= lv else "left"
            for r, lv in zip(right_vel, left_vel)
        ]

        peaks = self._find_peaks_adaptive(combined_vel)
        events: list[StrokeEvent] = []

        for peak_frame, confidence in peaks:
            start = max(0, peak_frame - self.WINDOW_BEFORE)
            end = min(len(pose_sequence) - 1, peak_frame + self.WINDOW_AFTER)

            events.append(
                StrokeEvent(
                    start_frame=start,
                    peak_frame=peak_frame,
                    end_frame=end,
                    peak_wrist_speed=combined_vel[peak_frame],
                    dominant_hand=dominant_per_frame[peak_frame],
                    confidence=confidence,
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

    def _find_peaks_adaptive(
        self,
        velocities: list[float],
    ) -> list[tuple[int, float]]:
        """Find velocity peaks using an adaptive sigma threshold.

        A peak must satisfy all of:
            1. Exceed mean + SIGMA_FACTOR × std of all velocities.
            2. Exceed MIN_ABSOLUTE_VELOCITY (reject postural sway).
            3. Be a local maximum (higher than both neighbours).
            4. Be at least MIN_GAP_FRAMES from the previous peak.

        Returns:
            List of (peak_frame_index, confidence) tuples.  Confidence
            is how far above threshold the peak is, normalised to [0, 1].
        """
        arr = np.array(velocities)
        mean_v = float(np.mean(arr))
        std_v = float(np.std(arr))
        threshold = mean_v + self.SIGMA_FACTOR * std_v

        # Ensure the threshold is at least the absolute minimum
        threshold = max(threshold, self.MIN_ABSOLUTE_VELOCITY)

        # Maximum velocity for confidence normalisation
        max_v = float(np.max(arr)) if len(arr) > 0 else 1.0
        conf_range = max(max_v - threshold, 1e-8)

        peaks: list[tuple[int, float]] = []
        last_peak = -self.MIN_GAP_FRAMES - 1

        for i in range(1, len(velocities) - 1):
            if (
                velocities[i] > threshold
                and velocities[i] >= velocities[i - 1]
                and velocities[i] >= velocities[i + 1]
                and (i - last_peak) >= self.MIN_GAP_FRAMES
            ):
                confidence = min(1.0, (velocities[i] - threshold) / conf_range)
                peaks.append((i, confidence))
                last_peak = i

        return peaks


@dataclass
class Hit:
    """A fused hit event.

    Attributes:
        frame: Hit frame.
        hitter: ``"player"`` (the tracked person swung) or ``"opponent"``
            (the shuttle turned with no swing from the tracked player).
        confidence: In [0, 1].
        source: Which cues fired: ``"shuttle+pose"``, ``"shuttle"`` or ``"pose"``.
    """

    frame: int
    hitter: str
    confidence: float
    source: str


def fuse_hits(
    pose_events: list[StrokeEvent],
    shuttle_turns: list[int],
    fps: float,
    shuttle_visible: np.ndarray | None = None,
    tolerance_s: float = 0.1,
) -> list[Hit]:
    """Fuse pose swing peaks with shuttle-trajectory turns.

    Rules:

    1. A shuttle turn with a tracked-player swing within ``tolerance_s`` is
       a player hit (both cues agree, so confidence is highest).
    2. A shuttle turn with no player swing is an opponent hit.
    3. A swing with no turn counts only if the shuttle was unobserved around
       it (occlusion). If the shuttle was visible and didn't turn, it was a
       practice swing or feint, and is dropped.
    4. The same side can't hit twice in a row; of two consecutive same-side
       hits, the less confident one is dropped.

    Args:
        pose_events: Output of :meth:`StrokeDetector.detect`.
        shuttle_turns: Frames from ``cv-core`` ``find_trajectory_turns``.
        fps: Frame rate.
        shuttle_visible: Optional per-frame bool mask of shuttle detections.
            Without it, swings without a turn are kept (pose-only fallback).
        tolerance_s: Max offset between a swing peak and a shuttle turn.

    Returns:
        Hits sorted by frame.
    """
    tol = max(1, round(tolerance_s * fps))
    used: set[int] = set()
    hits: list[Hit] = []

    for turn in shuttle_turns:
        best = None
        for i, ev in enumerate(pose_events):
            if i not in used and abs(ev.peak_frame - turn) <= tol and (
                best is None
                or abs(ev.peak_frame - turn) < abs(pose_events[best].peak_frame - turn)
            ):
                best = i
        if best is not None:
            used.add(best)
            conf = 0.6 + 0.4 * pose_events[best].confidence
            hits.append(Hit(turn, "player", conf, "shuttle+pose"))
        else:
            hits.append(Hit(turn, "opponent", 0.5, "shuttle"))

    for i, ev in enumerate(pose_events):
        if i in used:
            continue
        if shuttle_visible is not None:
            lo, hi = max(0, ev.peak_frame - tol), ev.peak_frame + tol + 1
            if np.any(shuttle_visible[lo:hi]):
                continue  # shuttle was seen and didn't turn: not a hit
        hits.append(Hit(ev.peak_frame, "player", 0.3 + 0.3 * ev.confidence, "pose"))

    hits.sort(key=lambda h: h.frame)
    cleaned: list[Hit] = []
    for hit in hits:
        if cleaned and cleaned[-1].hitter == hit.hitter:
            if hit.confidence > cleaned[-1].confidence:
                cleaned[-1] = hit
            continue
        cleaned.append(hit)
    return cleaned


StrokeEventDetector = StrokeDetector
