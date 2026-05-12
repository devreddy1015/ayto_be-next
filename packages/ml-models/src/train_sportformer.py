from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from sportformer import SportFormer


class SportFormerDataset(torch.utils.data.Dataset):
    def __init__(
        self,
        data_dir: str,
        split: str = "train",
        seq_len: int = 30,
        pose_dim: int = 132,
        shuttle_dim: int = 4,
    ) -> None:
        import numpy as np

        self.seq_len = seq_len
        self.pose_dim = pose_dim
        self.shuttle_dim = shuttle_dim
        data_path = Path(data_dir) / split

        self.samples: list[tuple[np.ndarray, np.ndarray, int]] = []

        if data_path.exists():
            for npz_file in sorted(data_path.glob("*.npz")):
                data = np.load(npz_file, allow_pickle=True)
                poses = data.get("keypoints", np.random.randn(seq_len, pose_dim))
                shuttle = data.get("shuttle", np.random.randn(seq_len, shuttle_dim))
                label = data.get("label", 0)

                poses = self._pad_or_crop(poses, seq_len)
                shuttle = self._pad_or_crop(shuttle, seq_len)

                self.samples.append((
                    poses.astype(np.float32),
                    shuttle.astype(np.float32),
                    int(label) if not isinstance(label, np.ndarray) else int(label[0]),
                ))

        if len(self.samples) == 0:
            for i in range(100):
                poses = np.random.randn(seq_len, pose_dim).astype(np.float32)
                shuttle = np.random.randn(seq_len, shuttle_dim).astype(np.float32)
                label = i % 6
                self.samples.append((poses, shuttle, label))

    def _pad_or_crop(self, arr: "np.ndarray", target_len: int) -> "np.ndarray":
        if len(arr) < target_len:
            pad = np.zeros((target_len - len(arr), arr.shape[1]), dtype=arr.dtype)
            return np.concatenate([arr, pad], axis=0)
        elif len(arr) > target_len:
            start = (len(arr) - target_len) // 2
            return arr[start : start + target_len]
        return arr

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        poses, shuttle, label = self.samples[idx]
        return (
            torch.tensor(poses),
            torch.tensor(shuttle),
            torch.tensor(label, dtype=torch.long),
        )


def train_sportformer(
    data_dir: str = "data/processed/strokes",
    epochs: int = 50,
    batch_size: int = 32,
    lr: float = 1e-3,
    save_dir: str = "models",
    device_str: str = "auto",
) -> dict:
    device = torch.device(
        device_str if device_str != "auto"
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )

    train_ds = SportFormerDataset(data_dir, split="train")
    val_ds = SportFormerDataset(data_dir, split="val")

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    model = SportFormer(
        pose_dim=132, shuttle_dim=4, hidden_dim=256,
        num_layers=4, num_heads=8, num_classes=6,
    ).to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_acc = 0.0
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        t0 = time.time()

        for poses, shuttle, labels in train_loader:
            poses = poses.to(device)
            shuttle = shuttle.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            logits = model(poses, shuttle)
            loss = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            train_loss += loss.item()
            preds = torch.argmax(logits, dim=1)
            train_correct += (preds == labels).sum().item()
            train_total += labels.size(0)

        scheduler.step()

        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0.0
        with torch.no_grad():
            for poses, shuttle, labels in val_loader:
                poses = poses.to(device)
                shuttle = shuttle.to(device)
                labels = labels.to(device)
                logits = model(poses, shuttle)
                val_loss += criterion(logits, labels).item()
                preds = torch.argmax(logits, dim=1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)

        train_acc = train_correct / train_total
        val_acc = val_correct / val_total
        avg_train_loss = train_loss / len(train_loader)
        avg_val_loss = val_loss / len(val_loader)

        elapsed = time.time() - t0

        print(
            f"Epoch {epoch:3d} | "
            f"train_loss={avg_train_loss:.4f} acc={train_acc:.3f} | "
            f"val_loss={avg_val_loss:.4f} acc={val_acc:.3f} | "
            f"{elapsed:.1f}s"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), save_path / "sportformer.pt")
            print(f"  -> Saved (acc={best_acc:.4f})")

    metrics = {
        "best_val_accuracy": best_acc,
        "model": "SportFormer",
        "architecture": "4-layer Transformer + CrossModalFusion",
        "parameters": sum(p.numel() for p in model.parameters()),
    }
    with open(save_path / "sportformer_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train SportFormer stroke classifier")
    parser.add_argument("--data", default="data/processed/strokes")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--save-dir", default="models")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    result = train_sportformer(
        data_dir=args.data,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        save_dir=args.save_dir,
        device_str=args.device,
    )
    print(f"\nTraining complete. Best accuracy: {result['best_val_accuracy']:.4f}")


if __name__ == "__main__":
    main()
