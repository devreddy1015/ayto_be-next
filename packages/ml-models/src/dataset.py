from __future__ import annotations

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


class StrokeDataset(Dataset):
    SEQ_LEN = 30
    NUM_FEATURES = 33 * 4

    def __init__(
        self,
        data_dir: str | Path,
        split: str = "train",
        seq_len: int = SEQ_LEN,
    ) -> None:
        self.data_dir = Path(data_dir) / split
        self.seq_len = seq_len
        self.samples: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if not self.data_dir.exists():
            return
        for npz_path in sorted(self.data_dir.glob("*.npz")):
            data = np.load(npz_path)
            keypoints = data["keypoints"]
            label = str(data["label"])
            if label not in STROKE_TO_IDX:
                continue
            if len(keypoints) < self.seq_len:
                pad_len = self.seq_len - len(keypoints)
                keypoints = np.pad(keypoints, ((0, pad_len), (0, 0), (0, 0)), mode="edge")
            elif len(keypoints) > self.seq_len:
                start = (len(keypoints) - self.seq_len) // 2
                keypoints = keypoints[start : start + self.seq_len]
            self.samples.append(
                {"keypoints": keypoints.astype(np.float32), "label": STROKE_TO_IDX[label]}
            )

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[Any, int]:
        sample = self.samples[idx]
        kps = sample["keypoints"].reshape(self.seq_len, -1)
        if torch is not None:
            return torch.tensor(kps, dtype=torch.float32), sample["label"]
        return kps, sample["label"]
