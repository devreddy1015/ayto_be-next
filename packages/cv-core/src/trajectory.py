"""Offline shuttle/ball trajectory rectification and flight segmentation.

A detector misses frames (occlusion, blur) and sometimes fires on clutter.
TrackNetV3 fixes both offline with a learned inpainting network; this module
does the same job geometrically, so it works before any rectification model
is trained:

1. Split the track into flights at hit frames, since a hit breaks smoothness.
2. Inside each flight, fit a local quadratic around every frame (a sliding
   LOESS-style window), reject detections far from it (robust MAD threshold),
   and refit.
3. Fill short gaps that have observations on both sides, i.e. interpolate
   only, never extrapolate.

``find_trajectory_turns`` gives shuttle-side hit candidates: frames where the
trajectory sharply reverses. :mod:`pose-biomechanics` fuses them with
wrist-speed peaks.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

OBSERVED, INPAINTED, REPLACED, MISSING = 0, 1, 2, -1


@dataclass
class RectifiedTrack:
    """Result of :func:`rectify_trajectory`.

    Attributes:
        positions: (N, 2) pixel positions; NaN where still unknown.
        status: (N,) per-frame code: OBSERVED, INPAINTED, REPLACED (outlier
            swapped for the fit) or MISSING.
    """

    positions: np.ndarray
    status: np.ndarray

    @property
    def coverage(self) -> float:
        """Fraction of frames with a position after rectification."""
        return float(np.mean(self.status != MISSING)) if len(self.status) else 0.0


def _segments(n: int, breaks: list[int] | None) -> list[tuple[int, int]]:
    cuts = sorted({b for b in (breaks or []) if 0 < b < n})
    edges = [0, *cuts, n]
    return [(a, b) for a, b in zip(edges[:-1], edges[1:]) if b > a]


def _local_fit(t: np.ndarray, p: np.ndarray, at: float) -> np.ndarray:
    deg = 2 if len(t) >= 4 else 1
    tc = t - at
    coeffs = np.polyfit(tc, p, deg)  # (deg+1, 2): one column per coordinate
    return coeffs[-1]


def rectify_trajectory(
    positions: np.ndarray,
    hit_frames: list[int] | None = None,
    window: int = 6,
    max_gap: int = 8,
    min_threshold_px: float = 4.0,
    iterations: int = 2,
) -> RectifiedTrack:
    """Reject outliers and inpaint short gaps in a 2D track.

    Args:
        positions: (N, 2) per-frame detections, NaN where nothing was detected.
        hit_frames: Frames where the object was struck; fits never cross them.
        window: Half-width (frames) of the local quadratic fit.
        max_gap: Longest run of missing frames to fill.
        min_threshold_px: Floor for the outlier threshold, so a near-perfect
            track doesn't flag sub-pixel noise as outliers.
        iterations: Outlier-rejection passes.

    Returns:
        A :class:`RectifiedTrack`.
    """
    pos = np.array(positions, dtype=float, copy=True)
    n = len(pos)
    status = np.where(np.isnan(pos).any(axis=1), MISSING, OBSERVED)
    if n == 0:
        return RectifiedTrack(pos, status)

    for a, b in _segments(n, hit_frames):
        frames = np.arange(a, b)
        valid = status[a:b] == OBSERVED

        for _ in range(iterations):
            idx = frames[valid]
            if len(idx) < 4:
                break
            preds = np.full((len(idx), 2), np.nan)
            for j, f in enumerate(idx):
                near = idx[(np.abs(idx - f) <= window) & (idx != f)]
                if len(near) >= 3:
                    preds[j] = _local_fit(near.astype(float), pos[near], float(f))
            resid = np.linalg.norm(pos[idx] - preds, axis=1)
            finite = np.isfinite(resid)
            if finite.sum() < 3:
                break
            mad = np.median(np.abs(resid[finite] - np.median(resid[finite])))
            thresh = max(min_threshold_px, 3.0 * 1.4826 * mad + np.median(resid[finite]))
            bad = idx[finite & (resid > thresh)]
            if len(bad) == 0:
                break
            valid[bad - a] = False
            status[bad] = REPLACED

        idx = frames[valid]
        if len(idx) < 2:
            continue
        for f in frames:
            if valid[f - a]:
                continue
            before = idx[idx < f]
            after = idx[idx > f]
            if len(before) == 0 or len(after) == 0:
                if status[f] == REPLACED:
                    status[f] = MISSING
                    pos[f] = np.nan
                continue
            gap = after[0] - before[-1] - 1
            if status[f] == MISSING and gap > max_gap:
                continue
            near = idx[np.abs(idx - f) <= max(window, gap)]
            pos[f] = _local_fit(near.astype(float), pos[near], float(f))
            if status[f] == MISSING:
                status[f] = INPAINTED
    return RectifiedTrack(pos, status)


def find_trajectory_turns(
    positions: np.ndarray,
    min_angle_deg: float = 100.0,
    min_speed_px: float = 2.0,
    min_gap: int = 10,
) -> list[int]:
    """Frames where the 2D trajectory sharply changes direction.

    Uses the angle between the mean velocity over the 3 frames before and
    after each frame. A hit reverses the shuttle, so turns above
    ``min_angle_deg`` are hit candidates; slow frames are ignored because
    their direction is noise.
    """
    pos = np.asarray(positions, dtype=float)
    k = 3
    candidates: list[tuple[float, int]] = []
    for i in range(k, len(pos) - k):
        v_in = pos[i] - pos[i - k]
        v_out = pos[i + k] - pos[i]
        if not (np.all(np.isfinite(v_in)) and np.all(np.isfinite(v_out))):
            continue
        s_in, s_out = np.linalg.norm(v_in), np.linalg.norm(v_out)
        if min(s_in, s_out) < min_speed_px * k:
            continue
        cos = float(v_in @ v_out) / (s_in * s_out)
        angle = float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))
        if angle >= min_angle_deg:
            candidates.append((angle, i))
    # Non-maximum suppression: keep the sharpest turn within each min_gap span.
    turns: list[int] = []
    for _, i in sorted(candidates, reverse=True):
        if all(abs(i - j) >= min_gap for j in turns):
            turns.append(i)
    return sorted(turns)
