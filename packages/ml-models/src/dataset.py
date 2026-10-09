"""Dataset utilities for racket-sport stroke classification and hit detection.

Per-frame feature layout (matches ``BadmintonStrokeClassifier``)::

    [pose (pose_dim) | shuttle (shuttle_dim) | court position (position_dim)]

with the default 5-channel shuttle block ``[x, y, visibility, dx, dy]`` built by
:func:`shuttle_features`. Missing modalities are zero-filled, which the model
reads as "shuttle not observed".

Accepted inputs (``.npz`` unless noted):

* **clip archives** -- ``features``/``x``/``keypoints``/``pose`` of shape
  ``(T, F)``, ``(N, T, F)`` or ``(N, T, J, C)`` plus ``labels``/``y``/``label``/
  ``stroke_type``. Optional aligned ``shuttle`` and ``position`` arrays.
* **rally archives** -- per-frame ``pose`` (+ optional ``shuttle``/``position``)
  for a whole rally with ``hit_frames`` ``(H,)`` and one label per hit. Strokes
  are cut with :func:`clip_around_hits` and linked to their neighbours, which
  the Adjacent-Stroke Fusion head trains on. Optional ``fps`` key; HitNet
  also reads ``hit_sides`` (court side of each hitter).
* **parquet** rows of flattened clip features (pandas required).
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

try:
    import torch
    from torch.utils.data import Dataset
except ImportError:
    torch = None
    Dataset = object

try:
    from .stroke_taxonomy import DEFAULT_SPORT, get_classes, normalize_label
except ImportError:
    from stroke_taxonomy import DEFAULT_SPORT, get_classes, normalize_label

__all__ = [
    "SHUTTLE_FEATURES",
    "BadmintonDataset",
    "HitSequenceDataset",
    "SequenceAugmenter",
    "StrokeDataset",
    "clip_around_hits",
    "hit_window_bounds",
    "normalize_label",
    "shuttle_features",
]

SHUTTLE_FEATURES = ("x", "y", "visibility", "dx", "dy")

_FEATURE_KEYS = ["features", "x", "keypoints", "pose"]
_LABEL_KEYS = ["labels", "y", "label", "stroke_type"]
_SHUTTLE_KEYS = ["shuttle", "shuttle_features"]
_POSITION_KEYS = ["position", "positions", "court_position"]


def shuttle_features(track: np.ndarray, visibility: np.ndarray | None = None) -> np.ndarray:
    """Build the ``(T, 5)`` shuttle block ``[x, y, visibility, dx, dy]``.

    Args:
        track: ``(T, 2)`` normalised image coordinates, or ``(T, 3)`` with the
            visibility / detection confidence as the third column.
        visibility: ``(T,)`` confidence in ``[0, 1]`` when ``track`` is ``(T, 2)``.
            Defaults to "visible wherever x or y is non-zero".

    Coordinates of unobserved frames are zeroed, and ``dx``/``dy`` are only
    non-zero when both the frame and its predecessor are observed, so a
    detection gap never shows up as a huge spurious velocity.
    """
    track = np.asarray(track, dtype=np.float32)
    if track.ndim != 2 or track.shape[1] not in (2, 3):
        raise ValueError(f"Expected shuttle track of shape (T, 2) or (T, 3), got {track.shape}")
    xy = track[:, :2]
    if track.shape[1] == 3:
        vis = track[:, 2]
    elif visibility is not None:
        vis = np.asarray(visibility, dtype=np.float32).reshape(-1)
    else:
        vis = np.any(xy != 0, axis=1).astype(np.float32)
    vis = np.clip(vis, 0.0, 1.0)
    observed = vis > 0
    xy = np.where(observed[:, None], xy, 0.0)
    delta = np.zeros_like(xy)
    if len(xy) > 1:
        both = (observed[1:] & observed[:-1])[:, None]
        delta[1:] = np.where(both, xy[1:] - xy[:-1], 0.0)
    return np.concatenate([xy, vis[:, None], delta], axis=1).astype(np.float32)


def hit_window_bounds(
    hit_frames: Sequence[int],
    num_frames: int,
    fps: float,
    half_window_s: float = 0.5,
    max_window_s: float = 1.5,
) -> list[tuple[int, int]]:
    """Return inclusive ``(start, end)`` frame bounds of each hit-centred window.

    Each window spans ``round(fps * half_window_s)`` frames either side of the
    hit (BST's ~0.5 s), never reaches past the neighbouring hits, is clipped to
    the video and is at most ``max_window_s`` long (trimmed around the hit).
    ``hit_frames`` must be strictly increasing and inside ``[0, num_frames)``.
    """
    hits = [int(h) for h in hit_frames]
    if any(b <= a for a, b in zip(hits, hits[1:], strict=False)):
        raise ValueError("hit_frames must be strictly increasing")
    if hits and (hits[0] < 0 or hits[-1] >= num_frames):
        raise ValueError(f"hit_frames must lie in [0, {num_frames})")
    if fps <= 0:
        raise ValueError("fps must be positive")

    half = int(fps * half_window_s + 0.5)
    max_len = max(1, int(fps * max_window_s + 0.5))
    bounds: list[tuple[int, int]] = []
    for i, hit in enumerate(hits):
        start = max(0, hit - half, hits[i - 1] if i > 0 else 0)
        end = min(num_frames - 1, hit + half, hits[i + 1] if i + 1 < len(hits) else hit + half)
        if end - start + 1 > max_len:
            before = min(hit - start, max_len // 2)
            after = min(end - hit, max_len - 1 - before)
            before = min(hit - start, max_len - 1 - after)
            start, end = hit - before, hit + after
        bounds.append((start, end))
    return bounds


def clip_around_hits(
    sequence: np.ndarray,
    hit_frames: Sequence[int],
    fps: float,
    seq_len: int,
    half_window_s: float = 0.5,
    max_window_s: float = 1.5,
) -> tuple[np.ndarray, np.ndarray]:
    """Cut fixed-length stroke clips centred on hit frames.

    The window from :func:`hit_window_bounds` is placed so the hit lands on
    index ``seq_len // 2``; frames beyond the window are edge-padded (a still
    player rather than a jump to zero). Windows longer than ``seq_len`` are
    trimmed symmetrically around the hit.

    Returns:
        ``(clips, valid)`` with shapes ``(H, seq_len, F)`` and ``(H, seq_len)``;
        ``valid`` is ``False`` on padded frames.
    """
    if seq_len < 1:
        raise ValueError("seq_len must be positive")
    sequence = np.asarray(sequence, dtype=np.float32)
    if sequence.ndim != 2:
        raise ValueError(f"Expected (num_frames, features), got {sequence.shape}")
    bounds = hit_window_bounds(hit_frames, len(sequence), fps, half_window_s, max_window_s)
    clips = np.zeros((len(bounds), seq_len, sequence.shape[1]), dtype=np.float32)
    valid = np.zeros((len(bounds), seq_len), dtype=bool)
    centre = seq_len // 2
    for i, (hit, (start, end)) in enumerate(zip(hit_frames, bounds, strict=True)):
        before = min(int(hit) - start, centre)
        after = min(end - int(hit), seq_len - 1 - centre)
        lo, hi = centre - before, centre + after + 1
        clips[i, lo:hi] = sequence[int(hit) - before : int(hit) + after + 1]
        clips[i, :lo] = clips[i, lo]
        clips[i, hi:] = clips[i, hi - 1]
        valid[i, lo:hi] = True
    return clips, valid


class SequenceAugmenter:
    """Lightweight augmentations for fused pose/shuttle/position sequences.

    Gaussian noise and feature dropout only touch the first ``pose_dim``
    channels (keypoint jitter); ``shuttle_dropout_prob`` blanks the shuttle
    block over a random span so the model learns to degrade gracefully when
    the shuttle detector misses it.
    """

    def __init__(
        self,
        noise_std: float = 0.01,
        temporal_mask_prob: float = 0.0,
        feature_dropout_prob: float = 0.0,
        shuttle_dropout_prob: float = 0.0,
        pose_dim: int | None = None,
        shuttle_slice: tuple[int, int] | None = None,
    ) -> None:
        self.noise_std = noise_std
        self.temporal_mask_prob = temporal_mask_prob
        self.feature_dropout_prob = feature_dropout_prob
        self.shuttle_dropout_prob = shuttle_dropout_prob
        self.pose_dim = pose_dim
        self.shuttle_slice = shuttle_slice

    def __call__(self, keypoints: np.ndarray) -> np.ndarray:
        x = keypoints.copy()
        pose = x[:, : self.pose_dim] if self.pose_dim is not None else x
        if self.noise_std > 0:
            pose += np.random.normal(0.0, self.noise_std, size=pose.shape).astype(np.float32)
        if self.feature_dropout_prob > 0:
            pose *= (np.random.random(pose.shape[-1]) >= self.feature_dropout_prob).astype(
                np.float32
            )
        if self.temporal_mask_prob > 0 and np.random.random() < self.temporal_mask_prob:
            n_frames = max(1, int(round(len(x) * 0.1)))
            start = np.random.randint(0, max(1, len(x) - n_frames + 1))
            replacement = x[start - 1] if start > 0 else x[min(start + n_frames, len(x) - 1)]
            x[start : start + n_frames] = replacement
        if (
            self.shuttle_slice is not None
            and self.shuttle_dropout_prob > 0
            and np.random.random() < self.shuttle_dropout_prob
        ):
            span = np.random.randint(max(1, int(0.3 * len(x))), len(x) + 1)
            start = np.random.randint(0, len(x) - span + 1)
            x[start : start + span, self.shuttle_slice[0] : self.shuttle_slice[1]] = 0.0
        return x.astype(np.float32)


class BadmintonDataset(Dataset):
    """PyTorch Dataset of fixed-length stroke clips for any supported sport.

    Args:
        data_path: Directory with ``.npz`` / ``.parquet`` files (optionally in
            a ``split`` sub-directory).
        split: ``train`` / ``val`` / ``test``.
        seq_len: Frames per clip.
        expected_features: Total features per frame
            (``pose_dim + shuttle_dim + position_dim``).
        shuttle_dim: Width of the shuttle block (0 = pose-only).
        position_dim: Width of the court-position block.
        sport: Taxonomy used to normalise labels.
        fps: Frame rate assumed for rally archives without an ``fps`` key.
        return_adjacent: Also return the ASF context built from the ground-truth
            labels of the neighbouring strokes (rally archives only; zeros
            elsewhere): items become ``(x, label, adjacent)``.
        augment: Enable :class:`SequenceAugmenter`.
    """

    SEQ_LEN = 30
    NUM_FEATURES = 27

    def __init__(
        self,
        data_path: str | Path,
        split: str = "train",
        seq_len: int = SEQ_LEN,
        expected_features: int = NUM_FEATURES,
        augment: bool = False,
        noise_std: float = 0.01,
        temporal_mask_prob: float = 0.0,
        feature_dropout_prob: float = 0.0,
        shuttle_dropout_prob: float = 0.0,
        shuttle_dim: int = 0,
        position_dim: int = 0,
        sport: str = DEFAULT_SPORT,
        fps: float = 30.0,
        return_adjacent: bool = False,
    ) -> None:
        self.data_path = Path(data_path)
        self.split = split
        self.seq_len = seq_len
        self.expected_features = expected_features
        self.shuttle_dim = shuttle_dim
        self.position_dim = position_dim
        self.pose_dim = expected_features - shuttle_dim - position_dim
        if self.pose_dim <= 0:
            raise ValueError("expected_features must exceed shuttle_dim + position_dim")
        self.sport = sport
        self.classes = get_classes(sport)
        self.num_classes = len(self.classes)
        self.fps = fps
        self.return_adjacent = return_adjacent
        shuttle_slice = (self.pose_dim, self.pose_dim + shuttle_dim) if shuttle_dim else None
        self.augmenter = (
            SequenceAugmenter(
                noise_std=noise_std,
                temporal_mask_prob=temporal_mask_prob,
                feature_dropout_prob=feature_dropout_prob,
                shuttle_dropout_prob=shuttle_dropout_prob,
                pose_dim=self.pose_dim,
                shuttle_slice=shuttle_slice,
            )
            if augment
            else None
        )
        self.samples: list[dict[str, Any]] = []
        self._rally_slots: dict[tuple[str, int], int] = {}
        self._load()
        self.prev_index, self.next_index = self._link_neighbours()

    def _load(self) -> None:
        split_dir = self.data_path / self.split
        if split_dir.is_dir():
            for path in sorted(split_dir.glob("*.npz")):
                self._load_npz(path)
            for path in sorted(split_dir.glob("*.parquet")):
                self._load_parquet(path)
        if not self.data_path.is_dir():
            return
        if not split_dir.is_dir():
            # Flat layout: root archives carry no split information.
            for path in sorted(self.data_path.glob("*.npz")):
                self._load_npz(path)
        for path in sorted(self.data_path.glob("*.parquet")):
            if self.split in path.stem:
                self._load_parquet(path)

    def _load_npz(self, path: Path) -> None:
        data = np.load(path, allow_pickle=True)
        feature_key = _first_available(data, _FEATURE_KEYS)
        label_key = _first_available(data, _LABEL_KEYS)
        if feature_key is None or label_key is None:
            return
        shuttle_key = _first_available(data, _SHUTTLE_KEYS)
        position_key = _first_available(data, _POSITION_KEYS)
        shuttle = data[shuttle_key] if shuttle_key else None
        position = data[position_key] if position_key else None

        if "hit_frames" in data:
            self._load_rally(path, data, feature_key, label_key, shuttle, position)
            return

        features = np.asarray(data[feature_key])
        labels = np.asarray(data[label_key])
        if features.ndim == 2:
            self._append_sample(self._assemble(features, shuttle, position), labels)
            return
        if features.ndim not in (3, 4):
            return
        if labels.ndim == 0:
            labels = np.repeat(labels.reshape(1), features.shape[0])
        for i, (sequence, label) in enumerate(zip(features, labels, strict=False)):
            fused = self._assemble(
                sequence,
                None if shuttle is None else shuttle[i],
                None if position is None else position[i],
            )
            self._append_sample(fused, label)

    def _load_rally(
        self,
        path: Path,
        data: Any,
        feature_key: str,
        label_key: str,
        shuttle: np.ndarray | None,
        position: np.ndarray | None,
    ) -> None:
        fused = self._assemble(np.asarray(data[feature_key]), shuttle, position)
        fps = float(data["fps"]) if "fps" in data else self.fps
        clips, valid = clip_around_hits(fused, data["hit_frames"], fps, self.seq_len)
        if self.shuttle_dim:
            # Padded frames are "not observed" for the shuttle stream.
            clips[..., self.pose_dim : self.pose_dim + self.shuttle_dim] *= valid[..., None]
        labels = np.asarray(data[label_key]).reshape(-1)
        for order, (clip, label) in enumerate(zip(clips, labels, strict=False)):
            self._append_sample(clip, label, rally=(str(path), order))

    def _load_parquet(self, path: Path) -> None:
        pd = _import_pandas()
        if pd is None:
            return
        df = pd.read_parquet(path)
        label_col = _first_column(df, ["label", "stroke_type", "class"])
        if label_col is None:
            return
        ignore = {label_col, "frame", "video_id", "clip_id", "split"}
        feature_cols = [c for c in df.columns if c not in ignore]
        for _, row in df.iterrows():
            features = row[feature_cols].values.astype(np.float32)
            if features.size % self.expected_features == 0:
                features = features.reshape(-1, self.expected_features)
            else:
                features = features.reshape(1, -1)
            self._append_sample(features, row[label_col])

    def _assemble(
        self,
        features: np.ndarray,
        shuttle: np.ndarray | None,
        position: np.ndarray | None,
    ) -> np.ndarray:
        """Return ``(T, expected_features)`` in ``[pose | shuttle | position]`` order.

        Without separate modality arrays ``features`` is taken as already fused
        (legacy archives); narrower inputs are zero-padded, which leaves the
        shuttle block "unobserved".
        """
        features = _flatten_frames(features)
        if shuttle is None and position is None:
            return _fit_width(features, self.expected_features)
        length = len(features)
        parts = [_fit_width(features, self.pose_dim)]
        if self.shuttle_dim:
            block = np.zeros((length, self.shuttle_dim), dtype=np.float32)
            if shuttle is not None:
                shuttle = _flatten_frames(shuttle)
                if shuttle.shape[1] in (2, 3) and self.shuttle_dim == len(SHUTTLE_FEATURES):
                    shuttle = shuttle_features(shuttle)
                block = _fit_width(shuttle, self.shuttle_dim)
                length = min(length, len(block))
            parts.append(block)
        if self.position_dim:
            block = np.zeros((length, self.position_dim), dtype=np.float32)
            if position is not None:
                block = _fit_width(_flatten_frames(position), self.position_dim)
                length = min(length, len(block))
            parts.append(block)
        return np.concatenate([part[:length] for part in parts], axis=1)

    def _append_sample(
        self,
        keypoints: np.ndarray,
        label: Any,
        rally: tuple[str, int] | None = None,
    ) -> None:
        label_idx = normalize_label(label, self.sport)
        if label_idx is None:
            return
        keypoints = _fit_width(_flatten_frames(keypoints), self.expected_features)
        if rally is not None:
            self._rally_slots[rally] = len(self.samples)
        self.samples.append({"keypoints": self._pad_or_crop(keypoints), "label": label_idx})

    def _pad_or_crop(self, keypoints: np.ndarray) -> np.ndarray:
        if len(keypoints) == 0:
            return np.zeros((self.seq_len, self.expected_features), dtype=np.float32)
        if len(keypoints) < self.seq_len:
            pad_len = self.seq_len - len(keypoints)
            keypoints = np.pad(keypoints, ((0, pad_len), (0, 0)), mode="edge")
        elif len(keypoints) > self.seq_len:
            start = (len(keypoints) - self.seq_len) // 2
            keypoints = keypoints[start : start + self.seq_len]
        return keypoints.astype(np.float32)

    def _link_neighbours(self) -> tuple[np.ndarray, np.ndarray]:
        """Index of each sample's previous / next stroke in the same rally (-1 = none)."""
        prev_index = np.full(len(self.samples), -1, dtype=np.int64)
        next_index = np.full(len(self.samples), -1, dtype=np.int64)
        for (rally, order), idx in self._rally_slots.items():
            prev_index[idx] = self._rally_slots.get((rally, order - 1), -1)
            next_index[idx] = self._rally_slots.get((rally, order + 1), -1)
        return prev_index, next_index

    def adjacent_labels(self, idx: int) -> np.ndarray:
        """One-hot ``[previous | next]`` ground-truth context for sample ``idx``."""
        context = np.zeros(2 * self.num_classes, dtype=np.float32)
        for slot, neighbour in enumerate((self.prev_index[idx], self.next_index[idx])):
            if neighbour >= 0:
                context[slot * self.num_classes + self.samples[neighbour]["label"]] = 1.0
        return context

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[Any, ...]:
        sample = self.samples[idx]
        kps = sample["keypoints"]
        if self.augmenter is not None:
            kps = self.augmenter(kps)
        x = torch.tensor(kps, dtype=torch.float32) if torch is not None else kps
        if self.return_adjacent:
            adjacent = self.adjacent_labels(idx)
            if torch is not None:
                adjacent = torch.from_numpy(adjacent)
            return x, int(sample["label"]), adjacent
        return x, int(sample["label"])

    def get_class_weights(self) -> list[float]:
        counts = Counter(s["label"] for s in self.samples)
        total = len(self.samples) if self.samples else 1
        return [
            total / (self.num_classes * max(counts.get(i, 0), 1)) for i in range(self.num_classes)
        ]

    def get_sample_weights(self) -> list[float]:
        class_weights = self.get_class_weights()
        return [class_weights[int(sample["label"])] for sample in self.samples]


StrokeDataset = BadmintonDataset


class HitSequenceDataset(Dataset):
    """Per-frame hit-detection windows cut from rally archives (for ``HitNet``).

    Each rally archive provides ``shuttle`` ``(N, 2|3|5)`` and ``hit_frames``;
    optional ``pose`` / ``wrists`` (fitted to ``pose_dim``), ``position``
    (fitted to ``position_dim``) and ``hit_sides`` (court side of each hitter,
    0 = near, 1 = far; ``hit_players`` is accepted too). Without them, sides
    are assumed to alternate from ``first_hitter`` (default 0) -- true for
    singles and for sides in doubles.

    Per-frame targets: 0 = no hit, ``1 + side`` = hit by that side, dilated by
    ``label_radius`` frames; padding uses ``-100`` (``ignore_index``).
    Frame features are ``[shuttle (5) | pose | position]``.
    """

    IGNORE_INDEX = -100

    def __init__(
        self,
        data_path: str | Path,
        split: str = "train",
        window: int = 90,
        stride: int | None = None,
        pose_dim: int = 0,
        position_dim: int = 0,
        label_radius: int = 1,
    ) -> None:
        self.window = window
        self.stride = stride or max(1, window // 2)
        self.pose_dim = pose_dim
        self.position_dim = position_dim
        self.label_radius = label_radius
        self.input_size = len(SHUTTLE_FEATURES) + pose_dim + position_dim
        self.rallies: list[dict[str, np.ndarray]] = []
        root = Path(data_path)
        directory = root / split if (root / split).exists() else root
        for path in sorted(directory.glob("*.npz")) if directory.exists() else []:
            self._load(path)
        self.windows: list[tuple[int, int]] = []
        for r, rally in enumerate(self.rallies):
            last_start = max(1, len(rally["features"]) - window + self.stride)
            self.windows.extend((r, start) for start in range(0, last_start, self.stride))

    def _load(self, path: Path) -> None:
        data = np.load(path, allow_pickle=True)
        shuttle_key = _first_available(data, _SHUTTLE_KEYS)
        if shuttle_key is None or "hit_frames" not in data:
            return
        shuttle = _flatten_frames(data[shuttle_key])
        if shuttle.shape[1] in (2, 3):
            shuttle = shuttle_features(shuttle)
        parts = [_fit_width(shuttle, len(SHUTTLE_FEATURES))]
        extras = ((["pose", "wrists"], self.pose_dim), (_POSITION_KEYS, self.position_dim))
        for keys, width in extras:
            if width:
                key = _first_available(data, keys)
                parts.append(
                    _fit_width(_flatten_frames(data[key]), width)
                    if key
                    else np.zeros((len(shuttle), width), dtype=np.float32)
                )
        length = min(len(part) for part in parts)
        features = np.concatenate([part[:length] for part in parts], axis=1)

        hits = np.asarray(data["hit_frames"], dtype=np.int64).reshape(-1)
        side_key = _first_available(data, ["hit_sides", "hit_players"])
        if side_key is not None:
            sides = np.asarray(data[side_key], dtype=np.int64).reshape(-1)
        else:
            first = int(data["first_hitter"]) if "first_hitter" in data else 0
            sides = (first + np.arange(len(hits))) % 2
        targets = np.zeros(length, dtype=np.int64)
        for hit, side in zip(hits, sides, strict=False):
            if 0 <= hit < length:
                lo, hi = max(0, hit - self.label_radius), min(length, hit + self.label_radius + 1)
                targets[lo:hi] = 1 + int(side)
        self.rallies.append(
            {"features": features, "targets": targets, "hits": hits, "sides": sides}
        )

    def get_class_weights(self) -> list[float]:
        """Inverse-frequency weights for ``[no hit, side 0, side 1]``."""
        counts = np.bincount(
            np.concatenate([r["targets"] for r in self.rallies]) if self.rallies else [0],
            minlength=3,
        ).astype(np.float64)
        total = counts.sum()
        return [float(total / (3 * max(c, 1.0))) for c in counts[:3]]

    def __len__(self) -> int:
        return len(self.windows)

    def __getitem__(self, idx: int) -> tuple[Any, Any]:
        rally_idx, start = self.windows[idx]
        rally = self.rallies[rally_idx]
        features = np.zeros((self.window, self.input_size), dtype=np.float32)
        targets = np.full(self.window, self.IGNORE_INDEX, dtype=np.int64)
        chunk = rally["features"][start : start + self.window]
        features[: len(chunk)] = chunk
        targets[: len(chunk)] = rally["targets"][start : start + self.window]
        if torch is not None:
            return torch.from_numpy(features), torch.from_numpy(targets)
        return features, targets


def _flatten_frames(array: Any) -> np.ndarray:
    array = np.asarray(array, dtype=np.float32)
    if array.ndim == 1:
        return array.reshape(-1, 1)
    return array.reshape(array.shape[0], -1)


def _fit_width(features: np.ndarray, width: int) -> np.ndarray:
    current = features.shape[-1]
    if current == width:
        return features
    if current > width:
        return features[:, :width]
    return np.pad(features, ((0, 0), (0, width - current)), mode="constant")


def _first_available(data: Any, keys: list[str]) -> str | None:
    for key in keys:
        if key in data:
            return key
    return None


def _first_column(df: Any, keys: list[str]) -> str | None:
    for key in keys:
        if key in df.columns:
            return key
    return None


def _import_pandas() -> Any | None:
    try:
        import pandas as pd
    except Exception:
        return None
    return pd
