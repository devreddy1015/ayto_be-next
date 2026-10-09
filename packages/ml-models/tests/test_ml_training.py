"""End-to-end smoke tests for the training entry points on tiny synthetic rallies."""
from pathlib import Path

import numpy as np
import pytest
import torch
import train as train_module
from export import load_model
from train import train, train_hitnet


def _write_rallies(root: Path, count: int = 3, frames: int = 150) -> None:
    rng = np.random.default_rng(1)
    hits = np.array([15, 45, 75, 105, 135])
    for split in ("train", "val"):
        (root / split).mkdir(parents=True, exist_ok=True)
        for i in range(count):
            np.savez(
                root / split / f"rally_{i}.npz",
                pose=rng.normal(size=(frames, 27)),
                wrists=rng.normal(size=(frames, 4)),
                shuttle=np.column_stack([rng.random((frames, 2)), np.ones(frames)]),
                position=rng.random((frames, 4)),
                hit_frames=hits,
                labels=rng.integers(0, 6, size=len(hits)),
                hit_sides=np.arange(len(hits)) % 2,
            )


def test_train_stroke_classifier_with_asf(tmp_path: Path) -> None:
    _write_rallies(tmp_path / "data")
    config = {
        "data_dir": str(tmp_path / "data"),
        "save_dir": str(tmp_path / "models"),
        "sport": "badminton",
        "seq_len": 31,
        "pose_dim": 27,
        "shuttle_dim": 5,
        "position_dim": 4,
        "model_dim": 32,
        "num_heads": 4,
        "num_layers": 1,
        "asf": True,
        "epochs": 2,
        "batch_size": 4,
        "shuttle_dropout_prob": 0.5,
        "mixup_alpha": 0.2,
        "num_workers": 0,
        "device": "cpu",
    }
    metrics = train(config)
    assert 0.0 <= metrics["val_f1_macro"] <= 1.0
    model, resolved = load_model(tmp_path / "models" / "stroke_classifier.ckpt")
    assert model.asf and resolved["shuttle_dim"] == 5
    assert model(torch.randn(2, 31, 36)).shape == (2, 6)
    # Bare state dicts are rebuilt from an explicit config.
    bare, _ = load_model(tmp_path / "models" / "stroke_classifier.pt", config)
    assert bare.input_size == 36


def test_train_hitnet(tmp_path: Path) -> None:
    _write_rallies(tmp_path / "rallies")
    config = {
        "data_dir": str(tmp_path / "rallies"),
        "save_dir": str(tmp_path / "models"),
        "pose_dim": 4,
        "position_dim": 4,
        "window": 60,
        "epochs": 1,
        "batch_size": 4,
        "device": "cpu",
    }
    metrics = train_hitnet(config)
    assert set(metrics) >= {"precision", "recall", "f1", "train_loss"}
    assert (tmp_path / "models" / "hitnet.ckpt").exists()


def test_metric_fallbacks_match_sklearn(monkeypatch: pytest.MonkeyPatch) -> None:
    sklearn_metrics = pytest.importorskip("sklearn.metrics")
    labels = [0, 1, 2, 2, 1, 0, 3, 3, 1]
    preds = [0, 2, 2, 2, 1, 1, 3, 0, 1]
    names = ["a", "b", "c", "d"]
    expected_f1 = sklearn_metrics.f1_score(labels, preds, average="macro", zero_division=0)
    expected = sklearn_metrics.classification_report(
        labels, preds, labels=[0, 1, 2, 3], target_names=names, output_dict=True, zero_division=0
    )
    for name in ("f1_score", "classification_report", "accuracy_score"):
        monkeypatch.setattr(train_module, name, None)
    assert train_module._macro_f1(labels, preds, 4) == pytest.approx(expected_f1)
    report = train_module._classification_report(labels, preds, names)
    for name in names:
        for key in ("precision", "recall", "f1-score", "support"):
            assert report[name][key] == pytest.approx(expected[name][key])
    assert report["accuracy"] == pytest.approx(expected["accuracy"])
    assert report["macro avg"]["f1-score"] == pytest.approx(expected_f1)
