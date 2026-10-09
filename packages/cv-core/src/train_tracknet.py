"""Train a TrackNet shuttle tracker.

Example (TrackNetV4-style: V3 background input + motion attention)::

    python train_tracknet.py --data TrackNetV2 --frames 3 --background --motion
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

try:
    from .tracknet_dataset import TrackNetDataset
    from .tracknet_model import TrackNet, weighted_bce
except ImportError:  # run as a script
    from tracknet_dataset import TrackNetDataset
    from tracknet_model import TrackNet, weighted_bce


def train(
    data_dir: str,
    epochs: int = 30,
    batch_size: int = 8,
    lr: float = 1e-3,
    save_dir: str = "models",
    device_str: str = "auto",
    num_frames: int = 3,
    use_background: bool = False,
    motion_attention: bool = False,
    width: float = 1.0,
) -> dict:
    device = torch.device(
        device_str if device_str != "auto"
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )
    config = {
        "num_frames": num_frames,
        "use_background": use_background,
        "motion_attention": motion_attention,
        "width": width,
    }
    data_kwargs = {"num_frames": num_frames, "use_background": use_background}
    train_ds = TrackNetDataset(data_dir, split="train", **data_kwargs)
    val_ds = TrackNetDataset(data_dir, split="val", **data_kwargs)
    if len(train_ds) == 0:
        raise RuntimeError(f"No training samples found in {data_dir}")
    print(f"Device {device} | train {len(train_ds)} | val {len(val_ds)} | {config}")

    loader_kwargs = {"batch_size": batch_size, "num_workers": 2, "pin_memory": True}
    train_loader = DataLoader(train_ds, shuffle=True, **loader_kwargs)
    val_loader = DataLoader(val_ds, shuffle=False, **loader_kwargs)

    model = TrackNet(**config).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=3)

    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    best_loss = float("inf")
    history: list[dict] = []

    for epoch in range(epochs):
        t0 = time.time()
        model.train()
        train_loss = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = weighted_bce(model(x), y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
        train_loss /= max(len(train_loader), 1)

        model.eval()
        with torch.no_grad():
            val_loss = sum(
                weighted_bce(model(x.to(device)), y.to(device)).item() for x, y in val_loader
            ) / max(len(val_loader), 1)
        scheduler.step(val_loss)

        lr_now = optimizer.param_groups[0]["lr"]
        history.append(
            {"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss, "lr": lr_now}
        )
        print(f"epoch {epoch:3d} | train {train_loss:.5f} | val {val_loss:.5f} | "
              f"lr {lr_now:.1e} | {time.time() - t0:.0f}s")

        if val_loss < best_loss:
            best_loss = val_loss
            torch.save({"config": config, "state_dict": model.state_dict()},
                       save_path / "tracknet.pt")

    with open(save_path / "tracknet_history.json", "w") as f:
        json.dump({"config": config, "best_val_loss": best_loss, "history": history}, f, indent=2)
    return {"best_val_loss": best_loss, "history": history}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a TrackNet shuttle tracker")
    parser.add_argument("--data", default="TrackNetV2", help="Dataset root")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--save-dir", default="models")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--frames", type=int, default=3)
    parser.add_argument("--background", action="store_true", help="TrackNetV3 median background")
    parser.add_argument("--motion", action="store_true", help="TrackNetV4 motion attention")
    parser.add_argument("--width", type=float, default=1.0, help="Channel multiplier")
    args = parser.parse_args()

    result = train(
        data_dir=args.data, epochs=args.epochs, batch_size=args.batch_size, lr=args.lr,
        save_dir=args.save_dir, device_str=args.device, num_frames=args.frames,
        use_background=args.background, motion_attention=args.motion, width=args.width,
    )
    print(f"Best val loss: {result['best_val_loss']:.5f}")


if __name__ == "__main__":
    main()
