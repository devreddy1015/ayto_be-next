"""HitNet: tiny learned hit detector plus sequence-optimised decoding.

Follows MonoTrack (arXiv 2204.01899): a ~16K-parameter network over shuttle,
pose and court features predicts, per frame, *no hit* vs *hit by side k*, and
a sequence-optimisation step turns those scores into a consistent list of
hits. MonoTrack reports hit F1 0.946 with the optimisation step vs 0.866
without it and 0.699 for a velocity-peak detector on the same test set.

Decoding (:func:`decode_hits`) is exact dynamic programming, not greedy:

1. candidates are local maxima of ``P(hit)`` (peak picking);
2. a semi-Markov Viterbi pass picks the subset of candidates and the hitting
   side of each that maximises the summed hit log-odds, subject to a minimum
   gap between hits and a penalty whenever two consecutive hits in the same
   rally come from the same side (sides must alternate).
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn

_EPS = 1e-6


class HitNet(nn.Module):
    """Per-frame hit classifier: ``(B, T, input_size)`` -> logits ``(B, T, 1 + num_sides)``.

    Two small temporal convolutions (local shuttle direction changes) feed a
    bidirectional GRU (rally context). Class 0 is *no hit*; class ``1 + k`` is
    *hit by court side k* (0 = near camera, 1 = far). Being bidirectional, it
    runs on buffered windows rather than strictly causally.

    Args:
        input_size: Per-frame features, by default the 5-channel shuttle block
            ``[x, y, visibility, dx, dy]`` optionally followed by pose (e.g.
            wrists) and court-position channels.
        conv_channels: Width of the temporal convolutions.
        hidden_size: GRU hidden size per direction.
        num_sides: Number of hitting sides (2 for singles / doubles sides).
        dropout: Dropout before the GRU.
    """

    def __init__(
        self,
        input_size: int = 5,
        conv_channels: int = 32,
        hidden_size: int = 32,
        num_sides: int = 2,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.input_size = input_size
        self.num_outputs = 1 + num_sides
        self.conv = nn.Sequential(
            nn.Conv1d(input_size, conv_channels, kernel_size=3, padding=1),
            nn.GELU(),
            nn.Conv1d(conv_channels, conv_channels, kernel_size=3, padding=2, dilation=2),
            nn.GELU(),
            nn.Dropout(dropout),
        )
        self.gru = nn.GRU(conv_channels, hidden_size, batch_first=True, bidirectional=True)
        self.head = nn.Linear(2 * hidden_size, self.num_outputs)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Return per-frame logits ``(batch, seq_len, 1 + num_sides)``."""
        hidden = self.conv(x.transpose(1, 2)).transpose(1, 2)
        hidden, _ = self.gru(hidden)
        return self.head(hidden)

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Per-frame class probabilities; ``1 - probs[..., 0]`` is ``P(hit)``."""
        self.eval()
        with torch.no_grad():
            return torch.softmax(self.forward(x), dim=-1)


@dataclass(frozen=True)
class HitEvent:
    """A decoded hit: frame index, hitting side and that side's probability."""

    frame: int
    side: int
    probability: float


def find_peaks(signal: np.ndarray, radius: int, floor: float = 0.0) -> np.ndarray:
    """Indices where ``signal`` is the maximum of its ``±radius`` neighbourhood.

    Flat plateaus keep only their first frame. Values below ``floor`` are dropped.
    """
    signal = np.asarray(signal, dtype=np.float64)
    if signal.size == 0:
        return np.zeros(0, dtype=np.int64)
    radius = max(1, int(radius))
    padded = np.pad(signal, radius, mode="constant", constant_values=-np.inf)
    windows = np.lib.stride_tricks.sliding_window_view(padded, 2 * radius + 1)
    left_max = windows[:, :radius].max(axis=1)
    is_peak = (signal >= windows.max(axis=1)) & (signal > left_max) & (signal >= floor)
    return np.flatnonzero(is_peak)


def decode_hits(
    probs: np.ndarray | torch.Tensor,
    fps: float = 30.0,
    min_gap_s: float = 0.3,
    min_prob: float = 0.5,
    same_side_penalty: float = 6.0,
    rally_gap_s: float = 3.0,
    candidate_floor: float = 0.05,
) -> list[HitEvent]:
    """Decode per-frame HitNet probabilities into an alternating hit sequence.

    Each candidate frame ``t`` hit by side ``k`` scores
    ``log P(k, t) - log P(none, t) - logit(min_prob)``, so a lone hit is kept
    iff its side-vs-no-hit odds beat ``min_prob``. The DP maximises the total
    score over chains of hits at least ``min_gap_s`` apart, paying
    ``same_side_penalty`` (in log-odds) each time consecutive hits less than
    ``rally_gap_s`` apart share a side. It can therefore keep a weak peak or
    re-assign a side to restore alternation, instead of greedily taking the
    strongest peaks.

    Args:
        probs: ``(T, 1 + num_sides)`` softmax output, column 0 = no hit.
        fps: Frame rate of ``probs``.
        min_gap_s: Minimum time between hits (0.3 s is below the fastest
            badminton exchanges; lower it for table tennis).
        min_prob: Acceptance threshold for an isolated hit.
        same_side_penalty: Cost of two consecutive same-side hits; ``inf``
            makes alternation a hard constraint. Ignored for one side.
        rally_gap_s: Hits further apart than this start a new rally, where
            either side may serve.
        candidate_floor: Minimum ``P(hit)`` for a peak to become a candidate.
    """
    if isinstance(probs, torch.Tensor):
        probs = probs.detach().cpu().numpy()
    probs = np.asarray(probs, dtype=np.float64)
    if probs.ndim != 2 or probs.shape[1] < 2:
        raise ValueError(f"Expected probs of shape (T, 1 + num_sides), got {probs.shape}")
    num_sides = probs.shape[1] - 1
    min_gap = max(1, int(round(min_gap_s * fps)))
    rally_gap = max(min_gap, int(round(rally_gap_s * fps)))
    penalty = same_side_penalty if num_sides > 1 else 0.0

    frames = find_peaks(1.0 - probs[:, 0], radius=max(1, min_gap // 2), floor=candidate_floor)
    if frames.size == 0:
        return []
    bias = np.log(min_prob / (1.0 - min_prob))
    scores = (
        np.log(probs[frames, 1:] + _EPS) - np.log(probs[frames, :1] + _EPS) - bias
    )  # (K, num_sides)

    count = len(frames)
    best = np.full((count, num_sides), -np.inf)
    back = np.full((count, num_sides, 2), -1, dtype=np.int64)
    # Running max over candidates more than ``rally_gap`` before the current one:
    # no alternation constraint applies across rallies.
    far_value, far_ref, far_ptr = 0.0, (-1, -1), 0
    for k in range(count):
        while far_ptr < k and frames[k] - frames[far_ptr] > rally_gap:
            j = far_ptr
            side = int(np.argmax(best[j]))
            if best[j, side] > far_value:
                far_value, far_ref = best[j, side], (j, side)
            far_ptr += 1
        for side in range(num_sides):
            prev_value, prev_ref = far_value, far_ref
            for j in range(far_ptr, k):
                if frames[k] - frames[j] < min_gap:
                    break
                for prev_side in range(num_sides):
                    value = best[j, prev_side] - (penalty if prev_side == side else 0.0)
                    if value > prev_value:
                        prev_value, prev_ref = value, (j, prev_side)
            best[k, side] = scores[k, side] + prev_value
            back[k, side] = prev_ref

    last = np.unravel_index(int(np.argmax(best)), best.shape)
    if best[last] <= 0.0:
        return []
    events: list[HitEvent] = []
    k, side = int(last[0]), int(last[1])
    while k >= 0:
        frame = int(frames[k])
        events.append(HitEvent(frame, side, float(probs[frame, 1 + side])))
        k, side = (int(v) for v in back[k, side])
    return events[::-1]


def hit_f1(
    predicted: Sequence[int],
    actual: Sequence[int],
    tolerance: int = 2,
) -> tuple[float, float, float]:
    """Event-level ``(precision, recall, f1)``, matching hits one-to-one within ``tolerance``."""
    predicted = sorted(int(f) for f in predicted)
    remaining = sorted(int(f) for f in actual)
    matched = 0
    for frame in predicted:
        candidates = [a for a in remaining if abs(a - frame) <= tolerance]
        if candidates:
            remaining.remove(min(candidates, key=lambda a: abs(a - frame)))
            matched += 1
    precision = matched / len(predicted) if predicted else 0.0
    recall = matched / len(actual) if len(actual) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall > 0 else 0.0
    return precision, recall, f1
