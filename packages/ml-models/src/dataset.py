"""BadmintonDataset — PyTorch Dataset for stroke classification.

Loads stroke data from merged parquet files, returns (tensor_30x27, label_int)
tuples, and provides class weights for handling imbalanced data.
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

try:
    import pandas as pd
except ImportError:
    pd = None

STROKE_CLASSES = ["smash", "drop", "clear", "net", "serve", "defensive"]
STROKE_TO_IDX = {s: i for i, s in enumerate(STROKE_CLASSES)}
IDX_TO_STROKE = {i: s for s, i in STROKE_TO_IDX.items()}


class BadmintonDataset(Dataset):
    """PyTorch Dataset for badminton stroke sequences.

    Loads from a merged parquet file with columns for keypoint features
    and a 'label' column. Returns (tensor_30x27, label_int) tuples.

    Attributes:
        SEQ_LEN: Number of frames per sequence (30).
        NUM_FEATURES: Number of features per frame (27 = 9 joints × 3 coords).
    """

    SEQ_LEN = 30
    NUM_FEATURES = 27

    def __init__(
        self,
        data_path: str | Path,
        split: str = "train",
        seq_len: int = SEQ_LEN,
    ) -> None:
        """Initialize the dataset.

        Args:
            data_path: Path to directory containing parquet files, or
                a directory with split subdirectories (train/val/test).
            split: Data split to load ('train', 'val', 'test').
            seq_len: Number of frames per sequence.
        """
        self.data_path = Path(data_path)
        self.split = split
        self.seq_len = seq_len
        self.samples: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        """Load samples from parquet files or npz files."""
        # Try parquet first
        split_dir = self.data_path / self.split
        if split_dir.exists() and pd is not None:
            for pq_path in sorted(split_dir.glob("*.parquet")):
                self._load_parquet(pq_path)
        # Fallback to npz
        if not self.samples and split_dir.exists():
            for npz_path in sorted(split_dir.glob("*.npz")):
                self._load_npz(npz_path)
        # Try root directory
        if not self.samples and self.data_path.exists() and pd is not None:
            for pq_path in sorted(self.data_path.glob(f"*{self.split}*.parquet")):
                self._load_parquet(pq_path)

    def _load_parquet(self, path: Path) -> None:
        """Load samples from a single parquet file."""
        df = pd.read_parquet(path)
        if "label" not in df.columns:
            return
        feature_cols = [c for c in df.columns if c != "label" and c != "frame"]
        for _, row in df.iterrows():
            label = str(row["label"])
            if label not in STROKE_TO_IDX:
                continue
            features = row[feature_cols].values.astype(np.float32)
            # Reshape to (seq_len, num_features) if flat
            if features.shape[0] == self.seq_len * self.NUM_FEATURES:
                keypoints = features.reshape(self.seq_len, self.NUM_FEATURES)
            else:
                keypoints = features.reshape(-1, self.NUM_FEATURES)
            keypoints = self._pad_or_crop(keypoints)
            self.samples.append({"keypoints": keypoints, "label": STROKE_TO_IDX[label]})

    def _load_npz(self, path: Path) -> None:
        """Load samples from a single npz file."""
        data = np.load(path)
        keypoints = data["keypoints"].astype(np.float32)
        label = str(data["label"])
        if label not in STROKE_TO_IDX:
            return
        if keypoints.ndim == 3:
            keypoints = keypoints.reshape(keypoints.shape[0], -1)
        # Trim to NUM_FEATURES if wider
        if keypoints.shape[-1] > self.NUM_FEATURES:
            keypoints = keypoints[:, :self.NUM_FEATURES]
        keypoints = self._pad_or_crop(keypoints)
        self.samples.append({"keypoints": keypoints, "label": STROKE_TO_IDX[label]})

    def _pad_or_crop(self, keypoints: np.ndarray) -> np.ndarray:
        """Pad or center-crop to seq_len frames."""
        if len(keypoints) < self.seq_len:
            pad_len = self.seq_len - len(keypoints)
            keypoints = np.pad(keypoints, ((0, pad_len), (0, 0)), mode="edge")
        elif len(keypoints) > self.seq_len:
            start = (len(keypoints) - self.seq_len) // 2
            keypoints = keypoints[start: start + self.seq_len]
        return keypoints

    def __len__(self) -> int:
        """Return the number of samples."""
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[Any, int]:
        """Get a single sample.

        Returns:
            Tuple of (tensor_30x27, label_int).
        """
        sample = self.samples[idx]
        kps = sample["keypoints"]
        if torch is not None:
            return torch.tensor(kps, dtype=torch.float32), sample["label"]
        return kps, sample["label"]

    def get_class_weights(self) -> list[float]:
        """Compute inverse-frequency class weights for imbalanced data.

        Returns:
            List of 6 weights, one per class, where rarer classes
            get higher weights.
        """
        counts = Counter(s["label"] for s in self.samples)
        total = len(self.samples) if self.samples else 1
        n_classes = len(STROKE_CLASSES)
        weights = []
        for i in range(n_classes):
            count = counts.get(i, 1)
            weights.append(total / (n_classes * count))
        return weights


# Backward-compatible alias
StrokeDataset = BadmintonDataset


if __name__ == "__main__":
    print("BadmintonDataset Demo")
    print("=" * 40)
    print(f"Classes: {STROKE_CLASSES}")
    print(f"Sequence length: {BadmintonDataset.SEQ_LEN}")
    print(f"Features per frame: {BadmintonDataset.NUM_FEATURES}")
    # Create a dummy dataset to show the format
    print("\nExpected __getitem__ output:")
    dummy_tensor = np.random.randn(30, 27).astype(np.float32)
    print(f"  tensor shape: {dummy_tensor.shape}")
    print(f"  label: 0 ('{STROKE_CLASSES[0]}')")
