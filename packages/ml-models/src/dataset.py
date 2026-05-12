"""Dataset utilities for badminton stroke classification.

The loader accepts both simple one-sample ``.npz`` files and batched archives,
plus parquet rows produced by preprocessing jobs. Labels are normalized into
Ayto's six mobile-product classes.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

try:
    import torch
    from torch.utils.data import Dataset
except ImportError:
    torch = None
    Dataset = object


STROKE_CLASSES = ["smash", "drop", "clear", "net", "serve", "defensive"]
STROKE_TO_IDX = {s: i for i, s in enumerate(STROKE_CLASSES)}
IDX_TO_STROKE = {i: s for s, i in STROKE_TO_IDX.items()}

LABEL_ALIASES = {
    "smash": "smash",
    "jump smash": "smash",
    "drop": "drop",
    "drop shot": "drop",
    "clear": "clear",
    "lob": "clear",
    "net": "net",
    "net shot": "net",
    "serve": "serve",
    "short service": "serve",
    "long service": "serve",
    "service": "serve",
    "defensive": "defensive",
    "defense": "defensive",
    "block": "defensive",
    "drive": "defensive",
    "push/rush": "defensive",
}


class SequenceAugmenter:
    """Lightweight augmentations for pose/shuttle feature sequences."""

    def __init__(
        self,
        noise_std: float = 0.01,
        temporal_mask_prob: float = 0.0,
        feature_dropout_prob: float = 0.0,
    ) -> None:
        self.noise_std = noise_std
        self.temporal_mask_prob = temporal_mask_prob
        self.feature_dropout_prob = feature_dropout_prob

    def __call__(self, keypoints: np.ndarray) -> np.ndarray:
        x = keypoints.copy()
        if self.noise_std > 0:
            x += np.random.normal(0.0, self.noise_std, size=x.shape).astype(np.float32)
        if self.temporal_mask_prob > 0 and np.random.random() < self.temporal_mask_prob:
            n_frames = max(1, int(round(len(x) * 0.1)))
            start = np.random.randint(0, max(1, len(x) - n_frames + 1))
            replacement = x[start - 1] if start > 0 else x[min(start + n_frames, len(x) - 1)]
            x[start: start + n_frames] = replacement
        if self.feature_dropout_prob > 0:
            mask = np.random.random(x.shape[-1]) >= self.feature_dropout_prob
            x *= mask.astype(np.float32)
        return x.astype(np.float32)


class BadmintonDataset(Dataset):
    """PyTorch Dataset for badminton stroke sequences."""

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
    ) -> None:
        self.data_path = Path(data_path)
        self.split = split
        self.seq_len = seq_len
        self.expected_features = expected_features
        self.augmenter = (
            SequenceAugmenter(
                noise_std=noise_std,
                temporal_mask_prob=temporal_mask_prob,
                feature_dropout_prob=feature_dropout_prob,
            )
            if augment
            else None
        )
        self.samples: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        split_dir = self.data_path / self.split
        candidate_dirs = [split_dir] if split_dir.exists() else []
        if self.data_path.exists():
            candidate_dirs.append(self.data_path)

        for directory in candidate_dirs:
            for npz_path in sorted(directory.glob("*.npz")):
                self._load_npz(npz_path)
            for pq_path in sorted(directory.glob("*.parquet")):
                if self.split in pq_path.stem or directory.name == self.split:
                    self._load_parquet(pq_path)

    def _load_npz(self, path: Path) -> None:
        data = np.load(path, allow_pickle=True)
        feature_key = _first_available(data, ["features", "x", "keypoints", "pose"])
        label_key = _first_available(data, ["labels", "y", "label", "stroke_type"])
        if feature_key is None or label_key is None:
            return

        features = data[feature_key]
        labels = data[label_key]
        if features.ndim == 2:
            self._append_sample(features, labels)
            return

        if features.ndim == 3:
            labels_arr = np.asarray(labels)
            if labels_arr.ndim == 0:
                labels_arr = np.repeat(labels_arr.reshape(1), features.shape[0])
            for sequence, label in zip(features, labels_arr, strict=False):
                self._append_sample(sequence, label)
            return

        if features.ndim == 4:
            flat = features.reshape(features.shape[0], features.shape[1], -1)
            labels_arr = np.asarray(labels)
            for sequence, label in zip(flat, labels_arr, strict=False):
                self._append_sample(sequence, label)

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
            label = row[label_col]
            features = row[feature_cols].values.astype(np.float32)
            if features.size % self.expected_features == 0:
                features = features.reshape(-1, self.expected_features)
            else:
                features = features.reshape(1, -1)
            self._append_sample(features, label)

    def _append_sample(self, keypoints: np.ndarray, label: Any) -> None:
        label_idx = normalize_label(label)
        if label_idx is None:
            return
        keypoints = np.asarray(keypoints, dtype=np.float32)
        if keypoints.ndim == 3:
            keypoints = keypoints.reshape(keypoints.shape[0], -1)
        keypoints = self._fit_feature_width(keypoints)
        keypoints = self._pad_or_crop(keypoints)
        self.samples.append({"keypoints": keypoints, "label": label_idx})

    def _fit_feature_width(self, keypoints: np.ndarray) -> np.ndarray:
        width = keypoints.shape[-1]
        if width == self.expected_features:
            return keypoints
        if width > self.expected_features:
            return keypoints[:, : self.expected_features]
        pad_width = self.expected_features - width
        return np.pad(keypoints, ((0, 0), (0, pad_width)), mode="constant")

    def _pad_or_crop(self, keypoints: np.ndarray) -> np.ndarray:
        if len(keypoints) == 0:
            return np.zeros((self.seq_len, self.expected_features), dtype=np.float32)
        if len(keypoints) < self.seq_len:
            pad_len = self.seq_len - len(keypoints)
            keypoints = np.pad(keypoints, ((0, pad_len), (0, 0)), mode="edge")
        elif len(keypoints) > self.seq_len:
            start = (len(keypoints) - self.seq_len) // 2
            keypoints = keypoints[start: start + self.seq_len]
        return keypoints.astype(np.float32)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[Any, int]:
        sample = self.samples[idx]
        kps = sample["keypoints"]
        if self.augmenter is not None:
            kps = self.augmenter(kps)
        if torch is not None:
            return torch.tensor(kps, dtype=torch.float32), int(sample["label"])
        return kps, int(sample["label"])

    def get_class_weights(self) -> list[float]:
        counts = Counter(s["label"] for s in self.samples)
        total = len(self.samples) if self.samples else 1
        n_classes = len(STROKE_CLASSES)
        return [total / (n_classes * max(counts.get(i, 0), 1)) for i in range(n_classes)]

    def get_sample_weights(self) -> list[float]:
        class_weights = self.get_class_weights()
        return [class_weights[int(sample["label"])] for sample in self.samples]


def normalize_label(label: Any) -> int | None:
    if isinstance(label, np.ndarray):
        label = label.item()
    if isinstance(label, (np.integer, int)):
        value = int(label)
        return value if 0 <= value < len(STROKE_CLASSES) else None
    key = str(label).strip().lower().replace("_", " ").replace("-", " ")
    normalized = LABEL_ALIASES.get(key, key)
    return STROKE_TO_IDX.get(normalized)


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


StrokeDataset = BadmintonDataset
