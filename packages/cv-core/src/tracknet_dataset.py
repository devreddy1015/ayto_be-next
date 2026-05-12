from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset


class TrackNetDataset(Dataset):
    """
    Dataset loader for TrackNetV2 format.

    Directory structure:
        Train/
          match1/
            video/   — MP4 video clips
            csv/     — ball position CSV annotations
    """

    HEATMAP_SIGMA = 2.5
    INPUT_SIZE = (288, 512)  # (height, width)

    def __init__(
        self,
        root_dir: str | Path,
        split: str = "train",
        seq_len: int = 3,
        input_size: tuple[int, int] = (288, 512),
    ) -> None:
        self.root_dir = Path(root_dir)
        self.seq_len = seq_len
        self.input_size = input_size
        self.samples: list[dict[str, Any]] = []

        for split_name in ["Amateur", "Professional"]:
            split_dir = self.root_dir / split_name
            if not split_dir.exists():
                continue
            for match_dir in sorted(split_dir.iterdir()):
                if not match_dir.is_dir():
                    continue
                video_dir = match_dir / "video"
                csv_dir = match_dir / "csv"
                if not video_dir.exists() or not csv_dir.exists():
                    continue

                for csv_file in sorted(csv_dir.glob("*_ball.csv")):
                    video_name = csv_file.stem.replace("_ball", "")
                    video_path = video_dir / f"{video_name}.mp4"
                    if not video_path.exists():
                        continue

                    cap = cv2.VideoCapture(str(video_path))
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
                    cap.release()

                    annotations = _load_csv(csv_file)
                    if not annotations:
                        continue

                    for i in range(seq_len - 1, total_frames):
                        if i < len(annotations) and annotations[i]["vis"] == 1:
                            self.samples.append({
                                "video": str(video_path),
                                "frame_idx": i,
                                "x": annotations[i]["x"],
                                "y": annotations[i]["y"],
                                "total_frames": total_frames,
                                "fps": fps,
                            })

        n_train = int(len(self.samples) * 0.85)
        if split == "train":
            self.samples = self.samples[:n_train]
        elif split == "val":
            self.samples = self.samples[n_train:]
        # "test" uses all

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        sample = self.samples[idx]
        cap = cv2.VideoCapture(sample["video"])
        frames: list[np.ndarray] = []
        center_idx = sample["frame_idx"]
        start_idx = max(0, center_idx - self.seq_len + 1)

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_idx)
        src_w = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or self.input_size[1]
        src_h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or self.input_size[0]

        for i in range(self.seq_len):
            ret, frame = cap.read()
            if not ret:
                frame = np.zeros((int(src_h), int(src_w), 3), dtype=np.uint8)
            frame = cv2.resize(frame, (self.input_size[1], self.input_size[0]))
            frames.append(frame)
        cap.release()

        scale_x = self.input_size[1] / src_w
        scale_y = self.input_size[0] / src_h
        x = sample["x"] * scale_x
        y = sample["y"] * scale_y
        heatmap = _gaussian_heatmap(
            self.input_size[0], self.input_size[1],
            x, y,
            sigma=self.HEATMAP_SIGMA,
        )

        input_tensor = np.concatenate(
            [f.transpose(2, 0, 1) for f in frames], axis=0
        ).astype(np.float32) / 255.0

        return (
            torch.tensor(input_tensor, dtype=torch.float32),
            torch.tensor(heatmap, dtype=torch.float32).unsqueeze(0),
        )


def _load_csv(path: Path) -> list[dict[str, Any]]:
    annotations: list[dict[str, Any]] = []
    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            annotations.append({
                "frame": int(row["Frame"]),
                "vis": int(row["Visibility"]),
                "x": float(row["X"]),
                "y": float(row["Y"]),
            })
    return annotations


def _gaussian_heatmap(
    h: int, w: int, cx: float, cy: float, sigma: float = 2.5
) -> np.ndarray:
    xs = np.arange(w).astype(np.float32)
    ys = np.arange(h).astype(np.float32)
    xx, yy = np.meshgrid(xs, ys)
    heatmap = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma ** 2))
    return heatmap.astype(np.float32)
