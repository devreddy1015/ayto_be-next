"""Tests for the HitNet hit detector and its sequence decoder."""
import numpy as np
import pytest
import torch
from hitnet import HitEvent, HitNet, decode_hits, find_peaks, hit_f1


def _probs(frames: int, hits: dict[int, list[float]]) -> np.ndarray:
    """Background "no hit" frames plus explicit ``[none, side 0, side 1]`` rows."""
    probs = np.tile([0.98, 0.01, 0.01], (frames, 1))
    for frame, row in hits.items():
        probs[frame] = row
    return probs


class TestHitNet:
    def test_output_shape(self) -> None:
        model = HitNet(input_size=13)
        assert model(torch.randn(2, 90, 13)).shape == (2, 90, 3)
        probs = model.predict_proba(torch.randn(1, 50, 13))
        assert probs.shape == (1, 50, 3)
        assert torch.allclose(probs.sum(-1), torch.ones(1, 50), atol=1e-5)

    def test_is_tiny(self) -> None:
        for input_size in (5, 13):
            params = sum(p.numel() for p in HitNet(input_size=input_size).parameters())
            assert 10_000 <= params <= 30_000

    def test_handles_any_length(self) -> None:
        assert HitNet()(torch.randn(1, 7, 5)).shape == (1, 7, 3)


class TestDecodeHits:
    def test_alternating_sides_override_argmax(self) -> None:
        probs = _probs(
            100,
            {
                10: [0.05, 0.90, 0.05],
                16: [0.30, 0.65, 0.05],  # duplicate response inside the minimum gap
                30: [0.10, 0.05, 0.85],
                50: [0.20, 0.35, 0.45],  # argmax says side 1 again -> must flip to side 0
                70: [0.10, 0.05, 0.85],
            },
        )
        events = decode_hits(probs, fps=30)
        assert [(e.frame, e.side) for e in events] == [(10, 0), (30, 1), (50, 0), (70, 1)]
        assert events[2] == HitEvent(50, 0, pytest.approx(0.35))

    def test_without_penalty_follows_argmax(self) -> None:
        probs = _probs(
            100,
            {10: [0.05, 0.9, 0.05], 30: [0.1, 0.05, 0.85], 50: [0.2, 0.35, 0.45]},
        )
        events = decode_hits(probs, fps=30, same_side_penalty=0.0)
        assert [e.side for e in events] == [0, 1, 1]

    def test_minimum_gap_keeps_stronger_peak(self) -> None:
        probs = _probs(60, {20: [0.05, 0.9, 0.05], 25: [0.1, 0.05, 0.85]})
        assert [(e.frame, e.side) for e in decode_hits(probs, fps=30)] == [(20, 0)]

    def test_new_rally_resets_alternation(self) -> None:
        probs = _probs(300, {10: [0.05, 0.9, 0.05], 250: [0.05, 0.9, 0.05]})
        assert [(e.frame, e.side) for e in decode_hits(probs, fps=30)] == [(10, 0), (250, 0)]

    def test_weak_peaks_and_empty_input(self) -> None:
        assert decode_hits(_probs(50, {25: [0.7, 0.2, 0.1]}), fps=30) == []
        assert decode_hits(np.tile([1.0, 0.0, 0.0], (40, 1))) == []
        assert decode_hits(np.zeros((0, 3))) == []

    def test_single_side_has_no_alternation(self) -> None:
        probs = np.tile([0.98, 0.02], (80, 1))
        probs[[10, 40]] = [0.1, 0.9]
        assert [e.frame for e in decode_hits(probs, fps=30)] == [10, 40]

    def test_accepts_tensor_and_validates_shape(self) -> None:
        probs = torch.tensor(_probs(40, {20: [0.05, 0.9, 0.05]}))
        assert [e.frame for e in decode_hits(probs)] == [20]
        with pytest.raises(ValueError):
            decode_hits(np.zeros((10, 1)))


def test_find_peaks_plateau_and_floor() -> None:
    signal = np.array([0.0, 0.5, 0.5, 0.1, 0.0, 0.9, 0.0, 0.02])
    assert find_peaks(signal, radius=1, floor=0.05).tolist() == [1, 5]


def test_hit_f1_tolerance_matching() -> None:
    precision, recall, f1 = hit_f1([10, 31, 80], [11, 30, 50], tolerance=2)
    assert precision == pytest.approx(2 / 3) and recall == pytest.approx(2 / 3)
    assert f1 == pytest.approx(2 / 3)
    assert hit_f1([], [5]) == (0.0, 0.0, 0.0)
    assert hit_f1([5, 6], [5], tolerance=2)[0] == 0.5  # one-to-one matching
