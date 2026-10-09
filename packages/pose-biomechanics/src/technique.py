"""Technique comparison over whole strokes, not single frames.

The previous comparison took one frame's joint angles and diffed them
against a pro's. That ignores timing, and is very sensitive to which frame
was picked. This module compares joint-angle *trajectories*:

1. **Crop around the hit** (±0.6 s) in both sequences. Plain DTW fails when
   the informative part is a small slice of a long clip, because filler
   frames dominate the cost. Drop-DTW's fix is to discard outlier frames;
   cropping to the stroke does the same job cheaply.
2. **Global DTW** on all joints (angles plus scaled angular velocity, as
   in Morel et al.'s cost) gives the whole-body alignment.
3. **Per-joint DTW** for each joint, as in Morel et al.'s 2-level DTW
   (VISAPP 2016), gives each joint's *spatial* error along its own
   alignment, and its *timing* offset (e.g. "elbow extends 60 ms late").
   The offset is measured against the per-frame median of all joints'
   alignments, not the global path, because one off-tempo joint with a
   large range of motion would otherwise drag the global path halfway to
   itself and split its lag across every joint.

A Sakoe-Chiba band keeps alignments plausible (no 3x time-warps) and costs
O(N·M) at stroke lengths of ~40-80 frames.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

DERIVATIVE_WEIGHT_S = 0.1  # angular velocity (deg/s) x 0.1 s ~ comparable to degrees
ERROR_SCALE_DEG = 25.0     # similarity = exp(-mean error / 25 deg)
FEEDBACK_ERROR_DEG = 10.0
FEEDBACK_TIMING_MS = 50.0


@dataclass
class JointDeviation:
    """How one joint differs from the reference.

    Attributes:
        mean_error_deg: Mean absolute angle difference along the joint's own
            DTW alignment.
        timing_offset_ms: Positive when the joint runs late relative to the
            player's whole-body timing, negative when early.
    """

    mean_error_deg: float
    timing_offset_ms: float


@dataclass
class TechniqueComparison:
    similarity: float
    per_joint: dict[str, JointDeviation]
    feedback: list[str] = field(default_factory=list)
    path: list[tuple[int, int]] = field(default_factory=list)


def dtw_path(
    a: np.ndarray, b: np.ndarray, band: float | None = 0.25,
) -> tuple[list[tuple[int, int]], float]:
    """Dynamic time warping between (N, D) and (M, D) sequences.

    Args:
        a: First sequence.
        b: Second sequence.
        band: Sakoe-Chiba band as a fraction of the longer length (None = unconstrained).

    Returns:
        ``(path, cost)``: index pairs from (0, 0) to (N-1, M-1), and the
        summed Euclidean cost along the path.
    """
    a = np.atleast_2d(np.asarray(a, dtype=float).T).T
    b = np.atleast_2d(np.asarray(b, dtype=float).T).T
    n, m = len(a), len(b)
    cost = np.linalg.norm(a[:, None, :] - b[None, :, :], axis=-1)
    width = n + m if band is None else max(int(math.ceil(band * max(n, m))), abs(n - m) + 1)

    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, 0] = 0.0
    for i in range(1, n + 1):
        center = round(i * m / n)
        lo, hi = max(1, center - width), min(m, center + width)
        for j in range(lo, hi + 1):
            acc[i, j] = cost[i - 1, j - 1] + min(acc[i - 1, j], acc[i - 1, j - 1], acc[i, j - 1])

    path = [(n - 1, m - 1)]
    i, j = n, m
    while (i, j) != (1, 1):
        steps = [(i - 1, j - 1), (i - 1, j), (i, j - 1)]
        i, j = min((s for s in steps if s[0] >= 1 and s[1] >= 1), key=lambda s: acc[s])
        path.append((i - 1, j - 1))
    return path[::-1], float(acc[n, m])


def _fill_gaps(x: np.ndarray) -> np.ndarray:
    """Linearly interpolate NaNs per column; all-NaN columns stay NaN."""
    x = np.array(x, dtype=float, copy=True)
    idx = np.arange(len(x))
    for col in range(x.shape[1]):
        ok = np.isfinite(x[:, col])
        if ok.any() and not ok.all():
            x[~ok, col] = np.interp(idx[~ok], idx[ok], x[ok, col])
    return x


def _crop(x: np.ndarray, hit: int | None, half: int) -> np.ndarray:
    if hit is None:
        return x
    return x[max(0, hit - half): hit + half + 1]


def _features(x: np.ndarray, fps: float) -> np.ndarray:
    velocity = np.gradient(x, axis=0) * fps if len(x) > 1 else np.zeros_like(x)
    return np.concatenate([x, velocity * DERIVATIVE_WEIGHT_S], axis=1)


def compare_technique(
    player: np.ndarray,
    reference: np.ndarray,
    joints: list[str],
    fps: float,
    player_hit: int | None = None,
    reference_hit: int | None = None,
    reference_fps: float | None = None,
    window_s: float = 0.6,
    band: float = 0.25,
) -> TechniqueComparison:
    """Compare a player's stroke with a reference stroke (pro or coach).

    Args:
        player: (N, J) joint angles in degrees (NaN where unknown).
        reference: (M, J) joint angles, same joint order.
        joints: The J joint names.
        fps: Player clip frame rate.
        player_hit: Hit frame in ``player`` (crops to ±window_s around it).
        reference_hit: Hit frame in ``reference``.
        reference_fps: Reference frame rate if it differs (resampled to ``fps``).
        window_s: Half-window kept around each hit.
        band: Sakoe-Chiba band fraction.

    Returns:
        A :class:`TechniqueComparison`.
    """
    ref = np.asarray(reference, dtype=float)
    if reference_fps and reference_fps != fps:
        src_t = np.arange(len(ref)) / reference_fps
        dst_t = np.arange(0, src_t[-1] + 1e-9, 1 / fps)
        ref = np.column_stack([np.interp(dst_t, src_t, ref[:, j]) for j in range(ref.shape[1])])
        if reference_hit is not None:
            reference_hit = round(reference_hit * fps / reference_fps)

    half = round(window_s * fps)
    a = _fill_gaps(_crop(np.asarray(player, dtype=float), player_hit, half))
    b = _fill_gaps(_crop(ref, reference_hit, half))
    usable = [j for j in range(len(joints))
              if np.isfinite(a[:, j]).all() and np.isfinite(b[:, j]).all()]
    if not usable or len(a) < 2 or len(b) < 2:
        return TechniqueComparison(similarity=0.0, per_joint={})

    a_use, b_use = a[:, usable], b[:, usable]
    global_path, _ = dtw_path(_features(a_use, fps), _features(b_use, fps), band)

    errors, maps = [], []
    for col in range(len(usable)):
        path, _ = dtw_path(_features(a_use[:, [col]], fps), _features(b_use[:, [col]], fps), band)
        pi, pj = np.array(path).T
        errors.append(float(np.mean(np.abs(a_use[pi, col] - b_use[pj, col]))))
        maps.append(_mean_match(path, len(a)))
    body_timing = np.median(np.array(maps), axis=0)
    per_joint = {
        joints[j]: JointDeviation(
            mean_error_deg=round(errors[col], 1),
            timing_offset_ms=round(float(np.mean(body_timing - maps[col])) / fps * 1000.0, 1),
        )
        for col, j in enumerate(usable)
    }

    mean_error = float(np.mean([d.mean_error_deg for d in per_joint.values()]))
    return TechniqueComparison(
        similarity=round(math.exp(-mean_error / ERROR_SCALE_DEG), 3),
        per_joint=per_joint,
        feedback=_feedback(per_joint),
        path=global_path,
    )


def _mean_match(path: list[tuple[int, int]], n: int) -> np.ndarray:
    """For each first-sequence index, the mean matched second-sequence index."""
    sums, counts = np.zeros(n), np.zeros(n)
    for i, j in path:
        sums[i] += j
        counts[i] += 1
    return sums / np.maximum(counts, 1)


def _feedback(per_joint: dict[str, JointDeviation]) -> list[str]:
    tips: list[str] = []
    ranked = sorted(per_joint.items(), key=lambda kv: kv[1].mean_error_deg, reverse=True)
    for name, dev in ranked[:3]:
        label = name.replace("_", " ").capitalize()
        if dev.mean_error_deg >= FEEDBACK_ERROR_DEG:
            tips.append(f"{label}: {dev.mean_error_deg:.0f}° off the reference through the stroke")
    for name, dev in sorted(per_joint.items(), key=lambda kv: -abs(kv[1].timing_offset_ms)):
        if abs(dev.timing_offset_ms) >= FEEDBACK_TIMING_MS and len(tips) < 5:
            when = "late" if dev.timing_offset_ms > 0 else "early"
            label = name.replace("_", " ").capitalize()
            tips.append(f"{label}: moves {abs(dev.timing_offset_ms):.0f} ms {when} "
                        "relative to your body")
    return tips
