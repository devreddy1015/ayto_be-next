"""Training loops for Ayto stroke classification and hit detection.

``python train.py --config configs/default.yaml`` trains the stroke classifier;
``--task hitnet`` trains the HitNet hit detector from the config's ``hitnet:``
section.
"""
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
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

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
    from .dataset import BadmintonDataset, HitSequenceDataset
    from .hitnet import HitNet, decode_hits, hit_f1
    from .model import adjacent_context, build_model, resolve_input_layout
    from .stroke_taxonomy import DEFAULT_SPORT, get_classes
except ImportError:
    from dataset import BadmintonDataset, HitSequenceDataset
    from hitnet import HitNet, decode_hits, hit_f1
    from model import adjacent_context, build_model, resolve_input_layout
    from stroke_taxonomy import DEFAULT_SPORT, get_classes


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


def make_loader(
    dataset: Dataset,
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
    context: torch.Tensor | None = None,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, float, torch.Tensor | None]:
    """Mixup on clips (and, when given, on the ASF context with the same pairing)."""
    if alpha <= 0 or x.size(0) < 2:
        return x, y, y, 1.0, context
    lam = float(np.random.beta(alpha, alpha))
    indices = torch.randperm(x.size(0), device=x.device)
    mixed_x = lam * x + (1.0 - lam) * x[indices]
    if context is not None:
        context = lam * context + (1.0 - lam) * context[indices]
    return mixed_x, y, y[indices], lam, context


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
    context_dropout = config.get("asf_context_dropout", 0.5)
    use_amp = scaler.is_enabled()

    optimizer.zero_grad(set_to_none=True)
    for step, batch in enumerate(loader):
        x_batch = batch[0].to(device, non_blocking=True)
        y_batch = batch[1].to(device, dtype=torch.long, non_blocking=True)
        context = None
        if len(batch) > 2:
            # Ground-truth neighbour labels, zeroed per clip so the model also
            # learns the stage-1 (no context) regime used at inference.
            context = batch[2].to(device, non_blocking=True)
            keep = torch.rand(context.size(0), 1, device=device) >= context_dropout
            context = context * keep
        x_batch, y_a, y_b, lam, context = mixup_batch(x_batch, y_batch, mixup_alpha, context)

        autocast_ctx = (
            torch.amp.autocast(device_type="cuda", enabled=True) if use_amp else nullcontext()
        )
        with autocast_ctx:
            logits = model(x_batch, context)
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
    num_classes: int,
    prev_index: np.ndarray | None = None,
    next_index: np.ndarray | None = None,
) -> dict[str, Any]:
    """Validation metrics. ASF models are scored with two-stage inference.

    ``loader`` must iterate the dataset in order (no shuffling / sampler) so
    the neighbour indices line up with the stage-1 predictions.
    """
    model.eval()
    all_preds: list[int] = []
    all_labels: list[int] = []
    total_loss = 0.0
    with torch.no_grad():
        context = None
        if getattr(model, "asf", False):
            probs = [torch.softmax(model(batch[0].to(device)), dim=1) for batch in loader]
            stage_one = torch.cat(probs) if probs else torch.zeros(0, num_classes, device=device)
            none = np.full(len(stage_one), -1, dtype=np.int64)
            context = adjacent_context(
                stage_one,
                torch.as_tensor(none if prev_index is None else prev_index),
                torch.as_tensor(none if next_index is None else next_index),
            )
        offset = 0
        for batch in loader:
            x_batch = batch[0].to(device, non_blocking=True)
            y_batch = batch[1].to(device, dtype=torch.long, non_blocking=True)
            batch_context = None
            if context is not None:
                batch_context = context[offset : offset + len(y_batch)]
            offset += len(y_batch)
            logits = model(x_batch, batch_context)
            total_loss += criterion(logits, y_batch).item()
            all_preds.extend(torch.argmax(logits, dim=1).cpu().tolist())
            all_labels.extend(y_batch.cpu().tolist())

    return {
        "loss": total_loss / max(len(loader), 1),
        "f1_macro": _macro_f1(all_labels, all_preds, num_classes),
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
    classes: list[str],
) -> None:
    save_dir.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), save_dir / "stroke_classifier.pt")
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "config": config,
            "classes": classes,
            "epoch": epoch,
            "metrics": _json_safe_metrics(metrics),
        },
        save_dir / "stroke_classifier.ckpt",
    )
    if metrics["labels"]:
        report = _classification_report(metrics["labels"], metrics["preds"], classes)
        with open(save_dir / "classifier_metrics.json", "w") as f:
            json.dump({"best": _json_safe_metrics(metrics), "report": report}, f, indent=2)


def train(config: dict[str, Any]) -> dict[str, Any]:
    """Train the stroke classifier and return the best validation metrics."""
    set_seed(config.get("seed", 42))
    device = _resolve_device(config)

    pose_dim, shuttle_dim, position_dim = resolve_input_layout(
        config.get("input_size"),
        config.get("pose_dim"),
        config.get("shuttle_dim", 0),
        config.get("position_dim", 0),
    )
    input_size = pose_dim + shuttle_dim + position_dim
    sport = config.get("sport", DEFAULT_SPORT)
    classes = get_classes(sport)
    seq_len = config.get("seq_len", 30)
    common: dict[str, Any] = {
        "seq_len": seq_len,
        "expected_features": input_size,
        "shuttle_dim": shuttle_dim,
        "position_dim": position_dim,
        "sport": sport,
        "fps": config.get("fps", 30.0),
    }
    train_ds = BadmintonDataset(
        config["data_dir"],
        split="train",
        augment=config.get("augment", True),
        noise_std=config.get("noise_std", 0.01),
        temporal_mask_prob=config.get("temporal_mask_prob", 0.1),
        feature_dropout_prob=config.get("feature_dropout_prob", 0.02),
        shuttle_dropout_prob=config.get("shuttle_dropout_prob", 0.0),
        return_adjacent=bool(config.get("asf", False)),
        **common,
    )
    val_ds = BadmintonDataset(config["data_dir"], split="val", augment=False, **common)

    if len(train_ds) == 0:
        raise RuntimeError(f"No training samples found in {config['data_dir']}")

    train_loader = make_loader(train_ds, config, train=True)
    val_loader = make_loader(val_ds, config, train=False)

    model = build_model(config).to(device)
    weight_tensor = torch.tensor(train_ds.get_class_weights(), dtype=torch.float32, device=device)
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
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda" and config.get("amp", True))
    use_wandb = wandb is not None and config.get("use_wandb", False)
    if use_wandb:
        wandb.init(project=config.get("wandb_project", "sportiq-stroke-classifier"), config=config)
        wandb.watch(model)

    best_f1 = -1.0
    best_metrics: dict[str, Any] = {}
    patience = config.get("patience", 12)
    patience_counter = 0
    save_dir = Path(config.get("save_dir", "models"))

    print(
        f"Training on {device} | sport={sport} | train={len(train_ds)} | val={len(val_ds)} | "
        f"params={sum(p.numel() for p in model.parameters()):,} | seq_len={seq_len} | "
        f"layout=pose {pose_dim} + shuttle {shuttle_dim} + position {position_dim} | "
        f"asf={model.asf}"
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
        val_metrics = evaluate(
            model,
            val_loader,
            criterion,
            device,
            num_classes=len(classes),
            prev_index=val_ds.prev_index,
            next_index=val_ds.next_index,
        )
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

        if use_wandb:
            wandb.log(_json_safe_metrics(metrics))

        if metrics["val_f1_macro"] > best_f1:
            best_f1 = metrics["val_f1_macro"]
            best_metrics = metrics
            patience_counter = 0
            save_checkpoint(save_dir, model, optimizer, config, metrics, epoch, classes)
            print(f"  -> Saved best checkpoint (macro-F1={best_f1:.4f})")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping at epoch {epoch} (patience={patience})")
                break

    if use_wandb:
        wandb.finish()

    return _json_safe_metrics(best_metrics)


def build_hitnet(config: dict[str, Any]) -> HitNet:
    """Build HitNet from the ``hitnet:`` config section."""
    return HitNet(
        input_size=5 + config.get("pose_dim", 0) + config.get("position_dim", 0),
        conv_channels=config.get("conv_channels", 32),
        hidden_size=config.get("hidden_size", 32),
        num_sides=config.get("num_sides", 2),
        dropout=config.get("dropout", 0.1),
    )


def evaluate_hitnet(
    model: HitNet,
    dataset: HitSequenceDataset,
    config: dict[str, Any],
    device: torch.device,
) -> dict[str, float]:
    """Event-level hit precision / recall / F1 after sequence decoding, over full rallies."""
    tolerance = config.get("tolerance_frames", 2)
    predicted: list[int] = []
    actual: list[int] = []
    offset = 0
    for rally in dataset.rallies:
        x = torch.from_numpy(rally["features"]).unsqueeze(0).to(device)
        events = decode_hits(
            model.predict_proba(x)[0],
            fps=config.get("fps", 30.0),
            min_gap_s=config.get("min_gap_s", 0.3),
        )
        predicted.extend(offset + event.frame for event in events)
        actual.extend(offset + int(hit) for hit in rally["hits"])
        # Space rallies apart so a tolerance window never matches across two rallies.
        offset += len(rally["features"]) + tolerance + 1
    precision, recall, f1 = hit_f1(predicted, actual, tolerance)
    return {"precision": precision, "recall": recall, "f1": f1}


def train_hitnet(config: dict[str, Any]) -> dict[str, Any]:
    """Train HitNet on rally archives; keeps the checkpoint with the best decoded hit F1."""
    set_seed(config.get("seed", 42))
    device = _resolve_device(config)
    dataset_kwargs = {
        "window": config.get("window", 90),
        "pose_dim": config.get("pose_dim", 0),
        "position_dim": config.get("position_dim", 0),
        "label_radius": config.get("label_radius", 1),
    }
    train_ds = HitSequenceDataset(config["data_dir"], "train", **dataset_kwargs)
    val_ds = HitSequenceDataset(config["data_dir"], "val", **dataset_kwargs)
    if len(train_ds) == 0:
        raise RuntimeError(f"No rally archives with hit_frames found in {config['data_dir']}")
    eval_ds = val_ds if val_ds.rallies else train_ds

    loader = make_loader(train_ds, {**config, "balanced_sampler": False}, train=True)
    model = build_hitnet(config).to(device)
    criterion = nn.CrossEntropyLoss(
        weight=torch.tensor(train_ds.get_class_weights(), dtype=torch.float32, device=device),
        ignore_index=HitSequenceDataset.IGNORE_INDEX,
    )
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.get("lr", 1e-3),
        weight_decay=config.get("weight_decay", 1e-2),
    )
    scheduler = make_scheduler(optimizer, config, len(loader))
    save_dir = Path(config.get("save_dir", "models"))
    save_dir.mkdir(parents=True, exist_ok=True)
    print(
        f"Training HitNet on {device} | windows={len(train_ds)} | "
        f"params={sum(p.numel() for p in model.parameters()):,}"
    )

    best: dict[str, Any] = {"f1": -1.0}
    for epoch in range(config.get("epochs", 60)):
        model.train()
        total_loss = 0.0
        for x_batch, y_batch in loader:
            x_batch, y_batch = x_batch.to(device), y_batch.to(device)
            logits = model(x_batch)
            loss = criterion(logits.reshape(-1, model.num_outputs), y_batch.reshape(-1))
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), config.get("grad_clip", 1.0))
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()
        metrics = {
            "epoch": epoch,
            "train_loss": total_loss / max(len(loader), 1),
            **evaluate_hitnet(model, eval_ds, config, device),
        }
        print(
            f"Epoch {epoch:03d} | loss={metrics['train_loss']:.4f} | "
            f"P={metrics['precision']:.3f} R={metrics['recall']:.3f} F1={metrics['f1']:.3f}"
        )
        if metrics["f1"] > best["f1"]:
            best = metrics
            torch.save(model.state_dict(), save_dir / "hitnet.pt")
            torch.save(
                {"model_state_dict": model.state_dict(), "config": config, "metrics": metrics},
                save_dir / "hitnet.ckpt",
            )
    return best


def _resolve_device(config: dict[str, Any]) -> torch.device:
    if config.get("device") not in (None, "auto"):
        return torch.device(config["device"])
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


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


def _accuracy(labels: list[int], preds: list[int]) -> float:
    if not labels:
        return 0.0
    if accuracy_score is not None:
        return float(accuracy_score(labels, preds))
    return sum(int(a == b) for a, b in zip(labels, preds, strict=False)) / len(labels)


def _per_class_prf(
    labels: list[int],
    preds: list[int],
    class_id: int,
) -> tuple[float, float, float]:
    """Precision, recall and F1 of one class (sklearn-free fallback)."""
    pairs = list(zip(labels, preds, strict=False))
    tp = sum(1 for y, p in pairs if y == class_id and p == class_id)
    fp = sum(1 for y, p in pairs if y != class_id and p == class_id)
    fn = sum(1 for y, p in pairs if y == class_id and p != class_id)
    precision = tp / (tp + fp) if tp + fp > 0 else 0.0
    recall = tp / (tp + fn) if tp + fn > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall > 0 else 0.0
    return precision, recall, f1


def _macro_f1(labels: list[int], preds: list[int], num_classes: int) -> float:
    if not labels:
        return 0.0
    if f1_score is not None:
        return float(f1_score(labels, preds, average="macro", zero_division=0))
    return sum(_per_class_prf(labels, preds, c)[2] for c in range(num_classes)) / num_classes


def _classification_report(
    true_labels: list[int],
    pred_labels: list[int],
    target_names: list[str],
) -> dict[str, Any]:
    class_labels = list(range(len(target_names)))
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
    for class_id, name in zip(class_labels, target_names, strict=True):
        precision, recall, f1 = _per_class_prf(true_labels, pred_labels, class_id)
        report[name] = {
            "precision": precision,
            "recall": recall,
            "f1-score": f1,
            "support": sum(1 for y in true_labels if y == class_id),
        }
    per_class = [report[name] for name in target_names]
    report["accuracy"] = _accuracy(true_labels, pred_labels)
    report["macro avg"] = {
        "precision": sum(v["precision"] for v in per_class) / len(per_class),
        "recall": sum(v["recall"] for v in per_class) / len(per_class),
        "f1-score": sum(v["f1-score"] for v in per_class) / len(per_class),
        "support": len(true_labels),
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Ayto stroke classifier or HitNet")
    parser.add_argument("--config", default="packages/ml-models/configs/default.yaml")
    parser.add_argument("--task", choices=["stroke", "hitnet"], default="stroke")
    parser.add_argument("--data-dir", help="Override config data_dir")
    parser.add_argument("--epochs", type=int, help="Override epoch count")
    parser.add_argument("--batch-size", type=int, help="Override batch size")
    parser.add_argument("--lr", type=float, help="Override learning rate")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.task == "hitnet":
        config = dict(config.get("hitnet", {}))
    for key, value in {
        "data_dir": args.data_dir,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": args.lr,
    }.items():
        if value is not None:
            config[key] = value
    if args.task == "hitnet":
        train_hitnet(config)
    else:
        train(config)


if __name__ == "__main__":
    main()
