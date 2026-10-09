"""Tests for stroke taxonomies, shuttle features, hit-centred clipping and datasets."""
from pathlib import Path

import numpy as np
import pytest
from dataset import (
    BadmintonDataset,
    SequenceAugmenter,
    clip_around_hits,
    hit_window_bounds,
    shuttle_features,
)
from model import CLASSES
from stroke_taxonomy import SPORT_CLASSES, SPORT_LABEL_ALIASES, get_classes, normalize_label


class TestTaxonomy:
    def test_per_sport_class_counts(self) -> None:
        counts = {sport: len(get_classes(sport)) for sport in SPORT_CLASSES}
        assert counts == {
            "badminton": 6,
            "tennis": 7,
            "table_tennis": 8,
            "pickleball": 8,
            "squash": 7,
        }

    def test_badminton_classes_backward_compatible(self) -> None:
        assert CLASSES == ["smash", "drop", "clear", "net", "serve", "defensive"]
        assert get_classes() == CLASSES

    def test_classes_are_unique(self) -> None:
        for classes in SPORT_CLASSES.values():
            assert len(set(classes)) == len(classes)

    def test_every_alias_targets_a_class(self) -> None:
        for sport, aliases in SPORT_LABEL_ALIASES.items():
            for alias, target in aliases.items():
                assert target in SPORT_CLASSES[sport], (sport, alias)

    def test_per_sport_normalisation(self) -> None:
        assert normalize_label("overhead", "tennis") == get_classes("tennis").index("smash")
        assert normalize_label("third-shot drop", "pickleball") == 4
        assert normalize_label("Forehand_Loop", "table_tennis") == 1
        assert normalize_label("boast", "squash") == 5
        assert normalize_label("dink", "tennis") is None
        assert normalize_label(7, "badminton") is None
        assert normalize_label(np.array(3), "squash") == 3

    def test_sport_name_variants_and_unknown(self) -> None:
        assert get_classes("Table-Tennis") == get_classes("table_tennis")
        with pytest.raises(ValueError):
            get_classes("croquet")


class TestShuttleFeatures:
    def test_layout_and_gap_handling(self) -> None:
        track = np.array([[0.1, 0.2, 1.0], [0.3, 0.1, 1.0], [0.9, 0.9, 0.0], [0.4, 0.3, 1.0]])
        feats = shuttle_features(track)
        assert feats.shape == (4, 5)
        np.testing.assert_allclose(feats[1, 3:], [0.2, -0.1], atol=1e-6)
        # Invisible frame: coordinates zeroed, no velocity into or out of the gap.
        np.testing.assert_array_equal(feats[2], [0, 0, 0, 0, 0])
        np.testing.assert_array_equal(feats[3, 3:], [0, 0])
        assert feats[0, 3:].tolist() == [0.0, 0.0]

    def test_visibility_inferred_from_xy(self) -> None:
        feats = shuttle_features(np.array([[0.5, 0.5], [0.0, 0.0]]))
        assert feats[:, 2].tolist() == [1.0, 0.0]

    def test_bad_shape_raises(self) -> None:
        with pytest.raises(ValueError):
            shuttle_features(np.zeros((5, 4)))


class TestHitCentredClipping:
    @staticmethod
    def _ramp(frames: int = 120, width: int = 2) -> np.ndarray:
        return np.repeat(np.arange(frames, dtype=np.float32)[:, None], width, axis=1)

    def test_isolated_hit_is_centred(self) -> None:
        clips, valid = clip_around_hits(self._ramp(), [60], fps=30, seq_len=45)
        assert clips.shape == (1, 45, 2) and valid.shape == (1, 45)
        assert clips[0, 22, 0] == 60  # hit lands on seq_len // 2
        assert valid[0].sum() == 31  # ±15 frames = round(30 / 2)
        assert clips[0, 0, 0] == 45 and clips[0, -1, 0] == 75  # edge padding

    def test_capped_at_neighbouring_hits(self) -> None:
        assert hit_window_bounds([40, 45, 60], num_frames=120, fps=30) == [
            (25, 45),
            (40, 60),
            (45, 75),
        ]

    def test_hit_at_video_start_and_end(self) -> None:
        clips, valid = clip_around_hits(self._ramp(50), [0, 49], fps=30, seq_len=45)
        assert not valid[0, :22].any() and (clips[0, :22, 0] == 0).all()
        assert clips[0, 22, 0] == 0 and valid[0, 22:38].all()
        assert clips[1, 22, 0] == 49 and not valid[1, 23:].any()

    def test_max_duration_cap(self) -> None:
        bounds = hit_window_bounds([100], 300, fps=30, half_window_s=1.5, max_window_s=1.5)
        start, end = bounds[0]
        assert end - start + 1 == 45 and start <= 100 <= end

    def test_long_window_trimmed_to_seq_len(self) -> None:
        clips, valid = clip_around_hits(self._ramp(200), [100], fps=60, seq_len=45)
        assert valid.all() and clips[0, 22, 0] == 100
        assert clips[0, 0, 0] == 78 and clips[0, -1, 0] == 122

    def test_fps_rounding_and_empty(self) -> None:
        assert hit_window_bounds([50], 100, fps=25) == [(37, 63)]  # round(12.5) -> 13
        clips, valid = clip_around_hits(self._ramp(), [], fps=30, seq_len=45)
        assert clips.shape == (0, 45, 2) and valid.shape == (0, 45)

    def test_invalid_hits_raise(self) -> None:
        with pytest.raises(ValueError):
            hit_window_bounds([30, 20], 100, fps=30)
        with pytest.raises(ValueError):
            hit_window_bounds([10, 10], 100, fps=30)
        with pytest.raises(ValueError):
            hit_window_bounds([100], 100, fps=30)


def _write_rally(path: Path, labels: list[str], hits: list[int], frames: int = 200) -> None:
    rng = np.random.default_rng(0)
    shuttle = np.column_stack([rng.random((frames, 2)), np.ones(frames)])
    shuttle[5:15, 2] = 0.0
    np.savez(
        path,
        pose=rng.normal(size=(frames, 9, 3)),
        shuttle=shuttle,
        position=rng.random((frames, 4)),
        hit_frames=np.array(hits),
        labels=np.array(labels),
        fps=30,
    )


class TestStrokeDataset:
    def test_rally_archive_multimodal_and_neighbours(self, tmp_path: Path) -> None:
        (tmp_path / "train").mkdir()
        _write_rally(
            tmp_path / "train" / "rally.npz",
            ["serve", "clear", "smash", "unknown-type", "net"],
            [20, 60, 100, 140, 180],
        )
        ds = BadmintonDataset(
            tmp_path,
            seq_len=45,
            expected_features=36,
            shuttle_dim=5,
            position_dim=4,
            return_adjacent=True,
        )
        assert len(ds) == 4  # the unknown stroke type is skipped
        x, label, adjacent = ds[0]
        assert tuple(x.shape) == (45, 36) and label == 4  # serve
        assert ds.prev_index.tolist() == [-1, 0, 1, -1]
        assert ds.next_index.tolist() == [1, 2, -1, -1]
        # adjacent = one-hot(prev) ++ one-hot(next)
        assert adjacent.tolist() == [0.0] * 6 + [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]
        assert ds[3][2].sum() == 0  # neighbours of "net" were unknown / absent
        # Shuttle visibility is zero on padded frames and inside the detection gap.
        clip = ds.samples[0]["keypoints"]
        assert clip[0, 29] == 0.0 and clip[22, 29] == 1.0

    def test_pose_only_clips_get_unobserved_shuttle(self, tmp_path: Path) -> None:
        np.savez(tmp_path / "clips.npz", features=np.ones((3, 30, 27)), labels=np.array([0, 1, 2]))
        ds = BadmintonDataset(
            tmp_path, seq_len=30, expected_features=36, shuttle_dim=5, position_dim=4
        )
        assert len(ds) == 3
        assert (ds.samples[0]["keypoints"][:, 27:] == 0).all()

    def test_clip_archive_with_shuttle_and_sport(self, tmp_path: Path) -> None:
        np.savez(
            tmp_path / "clips.npz",
            pose=np.ones((2, 30, 27)),
            shuttle=np.full((2, 30, 3), 0.5),
            labels=np.array(["forehand", "lob"]),
        )
        ds = BadmintonDataset(
            tmp_path, seq_len=30, expected_features=32, shuttle_dim=5, sport="tennis"
        )
        assert [s["label"] for s in ds.samples] == [1, 5]
        assert ds.num_classes == 7 and len(ds.get_class_weights()) == 7
        assert np.allclose(ds.samples[0]["keypoints"][1, 27:], [0.5, 0.5, 0.5, 0.0, 0.0])

    def test_split_dirs_do_not_leak_root_archives(self, tmp_path: Path) -> None:
        for name in ("train", "val"):
            (tmp_path / name).mkdir()
            np.savez(tmp_path / name / "a.npz", features=np.ones((30, 27)), label=0)
        np.savez(tmp_path / "stray.npz", features=np.ones((30, 27)), label=1)
        assert len(BadmintonDataset(tmp_path, split="val")) == 1
        assert len(BadmintonDataset(tmp_path / "train", split="val")) == 1  # flat layout


class TestAugmenter:
    def test_shuttle_dropout_only_touches_shuttle_block(self) -> None:
        np.random.seed(0)
        augmenter = SequenceAugmenter(
            noise_std=0.0, shuttle_dropout_prob=1.0, pose_dim=27, shuttle_slice=(27, 32)
        )
        x = np.ones((45, 36), dtype=np.float32)
        out = augmenter(x)
        assert (out[:, :27] == 1).all() and (out[:, 32:] == 1).all()
        assert (out[:, 27:32] == 0).all(axis=1).sum() >= int(0.3 * 45)

    def test_noise_limited_to_pose(self) -> None:
        augmenter = SequenceAugmenter(noise_std=0.1, pose_dim=27)
        out = augmenter(np.zeros((30, 36), dtype=np.float32))
        assert out[:, :27].std() > 0 and (out[:, 27:] == 0).all()
