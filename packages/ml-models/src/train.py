"""Training loop for Ayto badminton stroke classification."""
from __future__ import annotations

import argparse
import json
import math
import random
from contextlib import nullcontext
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler

try:
    from sklearn.metrics import accuracy_score, classification_report, f1_score
except Exception:
    accuracy_score = None
    classification_report = None
    f1_score = None

try:
    import wandb
except ImportError:
    wandb = None

try:
    import yaml
except ImportError:
    yaml = None

try:
    from .dataset import IDX_TO_STROKE, STROKE_CLASSES, BadmintonDataset
    from .model import BadmintonStrokeClassifier
except ImportError:
    from dataset import IDX_TO_STROKE, STROKE_CLASSES, BadmintonDataset
    from model import BadmintonStrokeClassifier


def load_config(path: str) -> dict[str, Any]:
    if yaml is None:
        raise ImportError("pyyaml is required — pip install pyyaml")
    with open(path) as f:
        return yaml.safe_load(f)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def build_model(config: dict[str, Any]) -> BadmintonStrokeClassifier:
    temporal_kernels = tuple(config.get("temporal_kernels", [3, 5, 7]))
    return BadmintonStrokeClassifier(
        input_size=config.get("input_size", 27),
        model_dim=config.get("model_dim", config.get("hidden_size", 128)),
        hidden_size=config.get("hidden_size", 128),
        num_layers=config.get("num_layers", 3),
        num_classes=config.get("num_classes", 6),
        dropout=config.get("dropout", 0.25),
        num_heads=config.get("num_heads", 4),
        max_seq_len=config.get("max_seq_len", max(config.get("seq_len", 30), 120)),
        temporal_kernels=temporal_kernels,
    )


def make_loader(
    dataset: BadmintonDataset,
    config: dict[str, Any],
    train: bool,
) -> DataLoader:
    sampler = None
    shuffle = train
    if train and config.get("balanced_sampler", True) and len(dataset) > 0:
        sampler = WeightedRandomSampler(
            weights=torch.DoubleTensor(dataset.get_sample_weights()),
            num_samples=len(dataset),
            replacement=True,
        )
        shuffle = False

    return DataLoader(
        dataset,
        batch_size=config.get("batch_size", 32),
        shuffle=shuffle,
        sampler=sampler,
        num_workers=config.get("num_workers", 0),
        pin_memory=torch.cuda.is_available(),
        drop_last=train and config.get("drop_last", False),
    )


def make_scheduler(
    optimizer: torch.optim.Optimizer,
    config: dict[str, Any],
    steps_per_epoch: int,
) -> torch.optim.lr_scheduler.LambdaLR:
    epochs = max(1, config.get("epochs", 50))
    warmup_epochs = max(0, config.get("warmup_epochs", 3))
    total_steps = max(1, epochs * max(1, steps_per_epoch))
    warmup_steps = min(total_steps - 1, warmup_epochs * max(1, steps_per_epoch))
    min_lr_ratio = config.get("min_lr_ratio", 0.05)

    def schedule(step: int) -> float:
        if warmup_steps > 0 and step < warmup_steps:
            return max(1e-8, (step + 1) / warmup_steps)
        progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
        cosine = 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))
        return min_lr_ratio + (1.0 - min_lr_ratio) * cosine

    return torch.optim.lr_scheduler.LambdaLR(optimizer, schedule)


def mixup_batch(
    x: torch.Tensor,
    y: torch.Tensor,
    alpha: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, float]:
    if alpha <= 0 or x.size(0) < 2:
        return x, y, y, 1.0
    lam = float(np.random.beta(alpha, alpha))
    indices = torch.randperm(x.size(0), device=x.device)
    mixed_x = lam * x + (1.0 - lam) * x[indices]
    return mixed_x, y, y[indices], lam


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    scheduler: torch.optim.lr_scheduler.LambdaLR,
    device: torch.device,
    config: dict[str, Any],
    scaler: Any,
) -> float:
    model.train()
    total_loss = 0.0
    grad_accum = max(1, config.get("grad_accum_steps", 1))
    mixup_alpha = config.get("mixup_alpha", 0.0)
    use_amp = scaler.is_enabled()

    optimizer.zero_grad(set_to_none=True)
    for step, (x_batch, y_batch) in enumerate(loader):
        x_batch = x_batch.to(device, non_blocking=True)
        y_batch = y_batch.to(device, dtype=torch.long, non_blocking=True)
        x_batch, y_a, y_b, lam = mixup_batch(x_batch, y_batch, mixup_alpha)

        autocast_ctx = (
            torch.amp.autocast(device_type="cuda", enabled=True)
            if use_amp and hasattr(torch, "amp")
            else nullcontext()
        )
        with autocast_ctx:
            logits = model(x_batch)
            loss = lam * criterion(logits, y_a) + (1.0 - lam) * criterion(logits, y_b)
            loss = loss / grad_accum

        scaler.scale(loss).backward()
        if (step + 1) % grad_accum == 0 or step + 1 == len(loader):
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(
                model.parameters(),
                max_norm=config.get("grad_clip", 1.0),
            )
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)
            scheduler.step()

        total_loss += loss.item() * grad_accum

    return total_loss / max(len(loader), 1)


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> dict[str, Any]:
    model.eval()
    all_preds: list[int] = []
    all_labels: list[int] = []
    total_loss = 0.0
    with torch.no_grad():
        for x_batch, y_batch in loader:
            x_batch = x_batch.to(device, non_blocking=True)
            y_batch_t = y_batch.to(device, dtype=torch.long, non_blocking=True)
            logits = model(x_batch)
            total_loss += criterion(logits, y_batch_t).item()
            all_preds.extend(torch.argmax(logits, dim=1).cpu().tolist())
            all_labels.extend(y_batch_t.cpu().tolist())

    return {
        "loss": total_loss / max(len(loader), 1),
        "f1_macro": _macro_f1(all_labels, all_preds),
        "accuracy": _accuracy(all_labels, all_preds),
        "labels": all_labels,
        "preds": all_preds,
    }


def save_checkpoint(
    save_dir: Path,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    config: dict[str, Any],
    metrics: dict[str, Any],
    epoch: int,
) -> None:
    save_dir.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), save_dir / "stroke_classifier.pt")
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "config": config,
            "classes": STROKE_CLASSES,
            "epoch": epoch,
            "metrics": _json_safe_metrics(metrics),
        },
        save_dir / "stroke_classifier.ckpt",
    )
    if metrics["labels"]:
        report = _classification_report(
            metrics["labels"],
            metrics["preds"],
            class_labels=list(range(len(STROKE_CLASSES))),
            target_names=[IDX_TO_STROKE[i] for i in range(len(STROKE_CLASSES))],
        )
        with open(save_dir / "classifier_metrics.json", "w") as f:
            json.dump({"best": _json_safe_metrics(metrics), "report": report}, f, indent=2)


def train(config: dict[str, Any]) -> dict[str, Any]:
    """Train the stroke classifier and return the best validation metrics."""
    set_seed(config.get("seed", 42))
    device = torch.device(
        config.get("device")
        if config.get("device") not in (None, "auto")
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )

    seq_len = config.get("seq_len", 30)
    input_size = config.get("input_size", 27)
    train_ds = BadmintonDataset(
        config["data_dir"],
        split="train",
        seq_len=seq_len,
        expected_features=input_size,
        augment=config.get("augment", True),
        noise_std=config.get("noise_std", 0.01),
        temporal_mask_prob=config.get("temporal_mask_prob", 0.1),
        feature_dropout_prob=config.get("feature_dropout_prob", 0.02),
    )
    val_ds = BadmintonDataset(
        config["data_dir"],
        split="val",
        seq_len=seq_len,
        expected_features=input_size,
        augment=False,
    )

    if len(train_ds) == 0:
        raise RuntimeError(f"No training samples found in {config['data_dir']}")

    train_loader = make_loader(train_ds, config, train=True)
    val_loader = make_loader(val_ds, config, train=False)

    model = build_model(config).to(device)
    class_weights = train_ds.get_class_weights()
    weight_tensor = torch.tensor(class_weights, dtype=torch.float32, device=device)
    criterion = nn.CrossEntropyLoss(
        weight=weight_tensor if config.get("class_weights", True) else None,
        label_smoothing=config.get("label_smoothing", 0.05),
    )

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.get("lr", 5e-4),
        weight_decay=config.get("weight_decay", 1e-2),
        betas=tuple(config.get("betas", [0.9, 0.999])),
    )
    scheduler = make_scheduler(optimizer, config, len(train_loader))
    scaler = _make_grad_scaler(device, config)

    if wandb is not None and config.get("use_wandb", False):
        wandb.init(project=config.get("wandb_project", "sportiq-stroke-classifier"), config=config)
        wandb.watch(model)

    best_f1 = -1.0
    best_metrics: dict[str, Any] = {}
    patience = config.get("patience", 12)
    patience_counter = 0
    save_dir = Path(config.get("save_dir", "models"))

    print(
        f"Training on {device} | train={len(train_ds)} | val={len(val_ds)} | "
        f"model_dim={model.model_dim} | seq_len={seq_len} | input_size={input_size}"
    )

    for epoch in range(config.get("epochs", 50)):
        train_loss = train_one_epoch(
            model=model,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            scheduler=scheduler,
            device=device,
            config=config,
            scaler=scaler,
        )
        val_metrics = evaluate(model, val_loader, criterion, device)
        metrics = {
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val_metrics["loss"],
            "val_f1_macro": val_metrics["f1_macro"],
            "val_accuracy": val_metrics["accuracy"],
            "lr": optimizer.param_groups[0]["lr"],
            "labels": val_metrics["labels"],
            "preds": val_metrics["preds"],
        }

        print(
            f"Epoch {epoch:03d} | train={train_loss:.4f} | "
            f"val={metrics['val_loss']:.4f} | f1={metrics['val_f1_macro']:.4f} | "
            f"acc={metrics['val_accuracy']:.4f} | lr={metrics['lr']:.2e}"
        )

        if wandb is not None and config.get("use_wandb", False):
            wandb.log(_json_safe_metrics(metrics))

        if metrics["val_f1_macro"] > best_f1:
            best_f1 = metrics["val_f1_macro"]
            best_metrics = metrics
            patience_counter = 0
            save_checkpoint(save_dir, model, optimizer, config, metrics, epoch)
            print(f"  -> Saved best checkpoint (macro-F1={best_f1:.4f})")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping at epoch {epoch} (patience={patience})")
                break

    if wandb is not None and config.get("use_wandb", False):
        wandb.finish()

    return _json_safe_metrics(best_metrics)


def _json_safe_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key, value in metrics.items():
        if isinstance(value, np.generic):
            safe[key] = value.item()
        elif isinstance(value, list):
            safe[key] = [int(v) if isinstance(v, (np.integer, int)) else v for v in value]
        else:
            safe[key] = value
    return safe


def _make_grad_scaler(device: torch.device, config: dict[str, Any]) -> Any:
    enabled = device.type == "cuda" and config.get("amp", True)
    if hasattr(torch, "amp"):
        return torch.amp.GradScaler("cuda", enabled=enabled)
    return torch.cuda.amp.GradScaler(enabled=enabled)


def _accuracy(labels: list[int], preds: list[int]) -> float:
    if not labels:
        return 0.0
    if accuracy_score is not None:
        return float(accuracy_score(labels, preds))
    return sum(int(a == b) for a, b in zip(labels, preds, strict=False)) / len(labels)


def _macro_f1(labels: list[int], preds: list[int]) -> float:
    if not labels:
        return 0.0
    if f1_score is not None:
        return float(f1_score(labels, preds, average="macro", zero_division=0))
    per_class = []
    for class_id in range(len(STROKE_CLASSES)):
        tp = sum(1 for y, p in zip(labels, preds, strict=False) if y == class_id and p == class_id)
        fp = sum(1 for y, p in zip(labels, preds, strict=False) if y != class_id and p == class_id)
        fn = sum(1 for y, p in zip(labels, preds, strict=False) if y == class_id and p != class_id)
        precision = tp / (tp + fp) if tp + fp > 0 else 0.0
        recall = tp / (tp + fn) if tp + fn > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall > 0 else 0.0
        per_class.append(f1)
    return float(sum(per_class) / len(per_class))


def _classification_report(
    true_labels: list[int],
    pred_labels: list[int],
    class_labels: list[int],
    target_names: list[str],
) -> dict[str, Any]:
    if classification_report is not None:
        return classification_report(
            true_labels,
            pred_labels,
            labels=class_labels,
            target_names=target_names,
            output_dict=True,
            zero_division=0,
        )
    report: dict[str, Any] = {}
    for class_id, name in zip(class_labels, target_names, strict=False):
        pairs = zip(true_labels, pred_labels, strict=False)
        tp = sum(1 for y, p in pairs if y == class_id and p == class_id)
        pairs = zip(true_labels, pred_labels, strict=False)
        fp = sum(1 for y, p in pairs if y != class_id and p == class_id)
        pairs = zip(true_labels, pred_labels, strict=False)
        fn = sum(1 for y, p in pairs if y == class_id and p != class_id)
        precision = tp / (tp + fp) if tp + fp > 0 else 0.0
        recall = tp / (tp + fn) if tp + fn > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall > 0 else 0.0
        report[name] = {
            "precision": precision,
            "recall": recall,
            "f1-score": f1,
            "support": sum(1 for y in true_labels if y == class_id),
        }
    report["accuracy"] = _accuracy(true_labels, pred_labels)
    report["macro avg"] = {
        "precision": sum(v["precision"] for v in report.values() if isinstance(v, dict))
        / len(STROKE_CLASSES),
        "recall": sum(v["recall"] for v in report.values() if isinstance(v, dict))
        / len(STROKE_CLASSES),
        "f1-score": _macro_f1(true_labels, pred_labels),
        "support": len(true_labels),
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Ayto badminton stroke classifier")
    parser.add_argument("--config", default="packages/ml-models/configs/default.yaml")
    parser.add_argument("--data-dir", help="Override config data_dir")
    parser.add_argument("--epochs", type=int, help="Override epoch count")
    parser.add_argument("--batch-size", type=int, help="Override batch size")
    parser.add_argument("--lr", type=float, help="Override learning rate")
    args = parser.parse_args()

    config = load_config(args.config)
    for key, value in {
        "data_dir": args.data_dir,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": args.lr,
    }.items():
        if value is not None:
            config[key] = value
    train(config)


if __name__ == "__main__":
    main()
