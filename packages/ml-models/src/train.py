"""Training loop for BadmintonStrokeClassifier.

Full training pipeline with Adam optimizer, CosineAnnealingLR,
early stopping, W&B logging, and best model checkpoint saving.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

try:
    import wandb
except ImportError:
    wandb = None

try:
    import yaml
except ImportError:
    yaml = None

from sklearn.metrics import classification_report, f1_score

try:
    from .dataset import IDX_TO_STROKE, BadmintonDataset
    from .model import BadmintonStrokeClassifier
except ImportError:
    from dataset import IDX_TO_STROKE, BadmintonDataset
    from model import BadmintonStrokeClassifier


def load_config(path: str) -> dict:
    """Load YAML config file.

    Args:
        path: Path to the YAML configuration file.

    Returns:
        Configuration dictionary.
    """
    if yaml is None:
        raise ImportError("pyyaml is required — pip install pyyaml")
    with open(path) as f:
        return yaml.safe_load(f)


def train(config: dict) -> dict:
    """Full training loop with early stopping and W&B logging.

    Args:
        config: Training configuration dict with keys:
            data_dir, save_dir, seq_len, input_size, hidden_size,
            num_layers, num_classes, dropout, batch_size, lr,
            weight_decay, epochs, patience, use_wandb.

    Returns:
        Best metrics dict with epoch, train_loss, val_loss, val_f1_macro.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    train_ds = BadmintonDataset(
        config["data_dir"], split="train", seq_len=config.get("seq_len", 30)
    )
    val_ds = BadmintonDataset(
        config["data_dir"], split="val", seq_len=config.get("seq_len", 30)
    )

    train_loader = DataLoader(
        train_ds, batch_size=config.get("batch_size", 32), shuffle=True, num_workers=0
    )
    val_loader = DataLoader(
        val_ds, batch_size=config.get("batch_size", 32), shuffle=False, num_workers=0
    )

    model = BadmintonStrokeClassifier(
        input_size=config.get("input_size", 27),
        hidden_size=config.get("hidden_size", 128),
        num_layers=config.get("num_layers", 2),
        num_classes=config.get("num_classes", 6),
        dropout=config.get("dropout", 0.3),
    ).to(device)

    # Class weights for imbalanced data
    class_weights = train_ds.get_class_weights() if len(train_ds) > 0 else None
    if class_weights:
        weight_tensor = torch.tensor(class_weights, dtype=torch.float32).to(device)
        criterion = nn.CrossEntropyLoss(weight=weight_tensor)
    else:
        criterion = nn.CrossEntropyLoss()

    # Adam optimizer with weight decay
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=config.get("lr", 1e-3),
        weight_decay=config.get("weight_decay", 1e-4),
    )

    # CosineAnnealingLR scheduler
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config.get("epochs", 50)
    )

    # Early stopping
    patience = config.get("patience", 10)
    patience_counter = 0

    if wandb is not None and config.get("use_wandb", False):
        wandb.init(project="sportiq-stroke-classifier", config=config)
        wandb.watch(model)

    best_f1 = 0.0
    best_metrics: dict = {}

    for epoch in range(config.get("epochs", 50)):
        # Training
        model.train()
        train_loss = 0.0
        for batch_idx, (x_batch, y_batch) in enumerate(train_loader):
            x_batch = x_batch.to(device)
            y_batch = torch.tensor(y_batch, dtype=torch.long).to(device)
            optimizer.zero_grad()
            logits = model(x_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()

            # W&B per-batch logging
            if wandb is not None and config.get("use_wandb", False):
                wandb.log({"batch_loss": loss.item()})

        scheduler.step()

        # Validation
        model.eval()
        all_preds: list[int] = []
        all_labels: list[int] = []
        val_loss = 0.0
        with torch.no_grad():
            for x_batch, y_batch in val_loader:
                x_batch = x_batch.to(device)
                y_batch_t = torch.tensor(y_batch, dtype=torch.long).to(device)
                logits = model(x_batch)
                loss = criterion(logits, y_batch_t)
                val_loss += loss.item()
                preds = torch.argmax(logits, dim=1).cpu().tolist()
                all_preds.extend(preds)
                labels = y_batch if isinstance(y_batch, list) else y_batch.tolist()
                all_labels.extend(labels)

        f1 = f1_score(all_labels, all_preds, average="macro", zero_division=0) if all_labels else 0.0
        avg_train = train_loss / max(len(train_loader), 1)
        avg_val = val_loss / max(len(val_loader), 1)

        metrics = {
            "epoch": epoch,
            "train_loss": avg_train,
            "val_loss": avg_val,
            "val_f1_macro": f1,
        }

        if wandb is not None and config.get("use_wandb", False):
            wandb.log(metrics)

        print(f"Epoch {epoch:3d} | train_loss={avg_train:.4f} | "
              f"val_loss={avg_val:.4f} | f1={f1:.4f}")

        # Best model checkpoint
        if f1 > best_f1:
            best_f1 = f1
            best_metrics = metrics
            patience_counter = 0
            save_dir = Path(config.get("save_dir", "models"))
            save_dir.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), save_dir / "stroke_classifier.pt")
            if all_labels:
                report = classification_report(
                    all_labels, all_preds,
                    target_names=[IDX_TO_STROKE[i] for i in range(config.get("num_classes", 6))],
                    output_dict=True, zero_division=0,
                )
                with open(save_dir / "classifier_metrics.json", "w") as f:
                    json.dump({"best_f1": best_f1, "report": report}, f, indent=2)
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping at epoch {epoch} (patience={patience})")
                break

    if wandb is not None and config.get("use_wandb", False):
        wandb.finish()

    return best_metrics


def main() -> None:
    """CLI entry point for training."""
    parser = argparse.ArgumentParser(description="Train BadmintonStrokeClassifier")
    parser.add_argument("--config", default="packages/ml-models/configs/default.yaml")
    args = parser.parse_args()
    config = load_config(args.config)
    train(config)


if __name__ == "__main__":
    main()
