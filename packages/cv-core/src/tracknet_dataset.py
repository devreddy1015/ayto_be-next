"""TrackNetV2/V3-format dataset loader.

Expected layout (the public Shuttlecock Trajectory Dataset)::

    root/{Amateur,Professional}/<match>/video/<clip>.mp4
    root/{Amateur,Professional}/<match>/csv/<clip>_ball.csv   # Frame,Visibility,X,Y

Fixes over the previous loader:

* Frames where the shuttle is **not visible** are included with an all-zero
  target. Training only on visible frames teaches the model to always fire.
* The train/val split is by **match**, not by sample index, so adjacent,
  near-identical frames can't leak between splits.
* Optional median-background channel (TrackNetV3) per clip.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset


class TrackNetDataset(Dataset):
    HEATMAP_SIGMA = 2.5
    INPUT_SIZE = (288, 512)  # (height, width)

    def __init__(
        self,
        root_dir: str | Path,
        split: str = "train",
        num_frames: int = 3,
        use_background: bool = False,
        val_fraction: float = 0.15,
        input_size: tuple[int, int] = INPUT_SIZE,
    ) -> None:
        self.num_frames = num_frames
        self.use_background = use_background
        self.input_size = input_size
        self.samples: list[dict[str, Any]] = []
        self._backgrounds: dict[str, np.ndarray] = {}

        root = Path(root_dir)
        matches = sorted(
            m for group in ("Amateur", "Professional")
            if (root / group).exists()
            for m in (root / group).iterdir() if m.is_dir()
        )
        n_val = max(1, round(len(matches) * val_fraction)) if len(matches) > 1 else 0
        chosen = {"train": matches[: len(matches) - n_val],
                  "val": matches[len(matches) - n_val:]}.get(split, matches)

        for match_dir in chosen:
            for csv_file in sorted((match_dir / "csv").glob("*_ball.csv")):
                video = match_dir / "video" / f"{csv_file.stem.removesuffix('_ball')}.mp4"
                if not video.exists():
                    continue
                labels = _load_csv(csv_file)
                for end in range(num_frames - 1, len(labels)):
                    self.samples.append({"video": str(video), "end": end, "labels": labels})

    def __len__(self) -> int:
        return len(self.samples)

    def _background(self, video: str) -> np.ndarray:
        if video not in self._backgrounds:
            cap = cv2.VideoCapture(video)
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
            frames = []
            for idx in np.linspace(0, total - 1, num=min(32, total)).astype(int):
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                ok, frame = cap.read()
                if ok:
                    frames.append(cv2.resize(frame, self.input_size[::-1]))
            cap.release()
            self._backgrounds[video] = (
                np.median(np.stack(frames), axis=0).astype(np.uint8) if frames
                else np.zeros((*self.input_size, 3), np.uint8)
            )
        return self._backgrounds[video]

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        sample = self.samples[idx]
        start = sample["end"] - self.num_frames + 1
        cap = cv2.VideoCapture(sample["video"])
        src_w = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or self.input_size[1]
        src_h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or self.input_size[0]
        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
        frames = []
        for _ in range(self.num_frames):
            ok, frame = cap.read()
            if not ok:
                frame = np.zeros((int(src_h), int(src_w), 3), np.uint8)
            frames.append(cv2.resize(frame, self.input_size[::-1]))
        cap.release()
        if self.use_background:
            frames.append(self._background(sample["video"]))

        label = sample["labels"][sample["end"]]
        target = np.zeros(self.input_size, np.float32)
        if label["vis"]:
            target = _gaussian_heatmap(
                *self.input_size,
                label["x"] * self.input_size[1] / src_w,
                label["y"] * self.input_size[0] / src_h,
                sigma=self.HEATMAP_SIGMA,
            )
        x = np.concatenate([f.transpose(2, 0, 1) for f in frames], axis=0)
        return (
            torch.from_numpy(x).float().div_(255.0),
            torch.from_numpy(target).unsqueeze(0),
        )


def _load_csv(path: Path) -> list[dict[str, Any]]:
    with open(path) as f:
        return [
            {"vis": int(row["Visibility"]), "x": float(row["X"]), "y": float(row["Y"])}
            for row in csv.DictReader(f)
        ]


def _gaussian_heatmap(h: int, w: int, cx: float, cy: float, sigma: float) -> np.ndarray:
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)[:, None]
    return np.exp(-((xs - cx) ** 2 + (ys - cy) ** 2) / (2 * sigma ** 2)).astype(np.float32)
