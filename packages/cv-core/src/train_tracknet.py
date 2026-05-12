from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from tracknet_dataset import TrackNetDataset
from tracknet_model import TrackNetV2


def focal_mse_loss(pred: torch.Tensor, target: torch.Tensor, gamma: float = 2.0) -> torch.Tensor:
    diff = (pred - target) ** 2
    weight = (1 - target) ** gamma
    return (weight * diff).mean()


def train(
    data_dir: str,
    epochs: int = 50,
    batch_size: int = 8,
    lr: float = 1e-3,
    save_dir: str = "models",
    device_str: str = "auto",
) -> dict:
    device = torch.device(
        device_str if device_str != "auto"
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )
    print(f"Using device: {device}")

    train_ds = TrackNetDataset(data_dir, split="train")
    val_ds = TrackNetDataset(data_dir, split="val")

    if len(train_ds) == 0:
        raise RuntimeError(f"No training samples found in {data_dir}")

    print(f"Train samples: {len(train_ds)}, Val samples: {len(val_ds)}")

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=2, pin_memory=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=2, pin_memory=True,
    )

    model = TrackNetV2(in_channels=9, out_channels=1).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5,
    )

    best_loss = float("inf")
    history: list[dict] = []
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        t0 = time.time()

        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)
            optimizer.zero_grad()
            pred = model(x)
            loss = focal_mse_loss(pred, y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        avg_train_loss = train_loss / max(len(train_loader), 1)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device)
                y = y.to(device)
                pred = model(x)
                val_loss += focal_mse_loss(pred, y).item()

        avg_val_loss = val_loss / max(len(val_loader), 1)
        scheduler.step(avg_val_loss)

        elapsed = time.time() - t0
        history.append({
            "epoch": epoch,
            "train_loss": avg_train_loss,
            "val_loss": avg_val_loss,
            "lr": optimizer.param_groups[0]["lr"],
        })

        print(
            f"Epoch {epoch:3d}/{epochs} | "
            f"train_loss={avg_train_loss:.6f} | "
            f"val_loss={avg_val_loss:.6f} | "
            f"lr={optimizer.param_groups[0]['lr']:.2e} | "
            f"{elapsed:.1f}s"
        )

        if avg_val_loss < best_loss:
            best_loss = avg_val_loss
            torch.save(model.state_dict(), save_path / "tracknetv2.pt")
            print(f"  -> Saved best model (loss={best_loss:.6f})")

    torch.save(model.state_dict(), save_path / "tracknetv2_final.pt")

    with open(save_path / "tracknetv2_history.json", "w") as f:
        json.dump({"best_val_loss": best_loss, "history": history}, f, indent=2)

    return {"best_val_loss": best_loss, "history": history}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train TrackNetV2 for shuttle detection")
    parser.add_argument("--data", default="TrackNetV2", help="Path to TrackNetV2 dataset")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--save-dir", default="models")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    result = train(
        data_dir=args.data,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        save_dir=args.save_dir,
        device_str=args.device,
    )
    print(f"\nTraining complete. Best val loss: {result['best_val_loss']:.6f}")


if __name__ == "__main__":
    main()
