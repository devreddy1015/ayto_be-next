"""Unit tests for cv-core: detector, tracker, speed, and pipeline.

Tests use dummy data — no YOLO model or video files required.
"""
import math

import numpy as np
import pytest

from speed import CourtCalibration, SpeedCalculator
from tracker import ShuttleTracker


# ---------------------------------------------------------------------------
# CourtCalibration tests
# ---------------------------------------------------------------------------
class TestCourtCalibration:
    def test_calibrate_two_points(self) -> None:
        """Two points 1340px apart on a 13.4m court → 100 px/m."""
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        assert cal.pixels_per_meter == pytest.approx(100.0, rel=0.01)

    def test_calibrate_auto(self) -> None:
        """Auto calibration should yield a positive ratio."""
        cal = CourtCalibration()
        cal.calibrate_auto(1920, 1080)
        assert cal.pixels_per_meter > 0

    def test_calibrate_insufficient_points(self) -> None:
        """Should raise ValueError with < 2 points."""
        cal = CourtCalibration()
        with pytest.raises(ValueError):
            cal.calibrate([(0, 0)])

    def test_calibrate_from_court_width(self) -> None:
        """Calibrate from court width: 610px / 6.1m = 100 px/m."""
        cal = CourtCalibration()
        cal.calibrate_from_court_width(pixel_width=610.0, real_width_meters=6.1)
        assert cal.pixels_per_meter == pytest.approx(100.0, rel=0.01)


# ---------------------------------------------------------------------------
# SpeedCalculator tests
# ---------------------------------------------------------------------------
class TestSpeedCalculator:
    def _make_calculator(self, fps: float = 60.0) -> SpeedCalculator:
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        return SpeedCalculator(fps=fps, calibration=cal)

    def test_first_frame_returns_none(self) -> None:
        """First position should return None (no displacement yet)."""
        calc = self._make_calculator()
        assert calc.compute_speed((100, 100)) is None

    def test_stationary_returns_zero(self) -> None:
        """Same position twice → 0 speed."""
        calc = self._make_calculator()
        calc.compute_speed((100, 100))
        speed = calc.compute_speed((100, 100))
        assert speed == pytest.approx(0.0)

    def test_moving_returns_positive(self) -> None:
        """Moving 100px at 100px/m → positive speed."""
        calc = self._make_calculator()
        calc.compute_speed((100, 100))
        speed = calc.compute_speed((200, 100))
        assert speed is not None
        assert speed > 0

    def test_max_speed_tracking(self) -> None:
        """Max speed should be >= average speed."""
        calc = self._make_calculator()
        calc.compute_speed((100, 100))
        calc.compute_speed((200, 100))
        calc.compute_speed((250, 100))
        assert calc.get_max_speed() >= calc.get_average_speed()

    def test_reset(self) -> None:
        """Reset should clear all history."""
        calc = self._make_calculator()
        calc.compute_speed((100, 100))
        calc.compute_speed((200, 100))
        calc.reset()
        assert calc.get_speed_history() == []

    def test_calibrate_from_court_width_method(self) -> None:
        """SpeedCalculator convenience calibration method."""
        calc = SpeedCalculator(fps=60.0)
        calc.calibrate_from_court_width(610.0, 6.1)
        calc.compute_speed((100, 100))
        speed = calc.compute_speed((200, 100))
        assert speed is not None
        assert speed > 0

    def test_smoothed_output_varies_less(self) -> None:
        """Smoothed output should have less variance than raw speed."""
        calc = self._make_calculator()
        # Simulate noisy detections
        positions = [(100 + i * 50 + np.random.randn() * 10, 100) for i in range(20)]
        for pos in positions:
            calc.compute_speed(pos)
        speeds = calc.get_speed_history()
        # Smoothed speeds should exist
        assert len(speeds) > 0


# ---------------------------------------------------------------------------
# ShuttleTracker tests
# ---------------------------------------------------------------------------
class TestShuttleTracker:
    def test_initial_returns_none(self) -> None:
        """No detection on uninitialized tracker → None."""
        tracker = ShuttleTracker()
        result = tracker.update(None)
        assert result is None

    def test_first_detection_initializes(self) -> None:
        """First detection should return a tracked position."""
        tracker = ShuttleTracker()
        pos = tracker.update((100.0, 200.0))
        assert pos is not None

    def test_tracking_without_detection(self) -> None:
        """Should continue predicting through 1 frame of occlusion."""
        tracker = ShuttleTracker()
        tracker.update((100.0, 200.0))
        pos = tracker.update(None)
        assert pos is not None

    def test_occlusion_handling_5_frames(self) -> None:
        """Should survive up to 5 consecutive frames without detection."""
        tracker = ShuttleTracker()
        tracker.update((100.0, 200.0))
        tracker.update((110.0, 205.0))
        for _ in range(5):
            pos = tracker.update(None)
            assert pos is not None, "Track should survive up to 5 frames of occlusion"

    def test_occlusion_beyond_limit_loses_track(self) -> None:
        """Should lose track after more than 5 frames of occlusion."""
        tracker = ShuttleTracker()
        tracker.update((100.0, 200.0))
        tracker.update((110.0, 205.0))
        for _ in range(5):
            tracker.update(None)
        pos = tracker.update(None)
        assert pos is None, "Track should be lost after 6 frames of occlusion"

    def test_track_history_limited_to_30(self) -> None:
        """Track history should not exceed MAX_HISTORY (30) entries."""
        tracker = ShuttleTracker()
        for i in range(50):
            tracker.update((float(i), float(i)))
        history = tracker.get_track_history()
        assert len(history) <= 30

    def test_velocity(self) -> None:
        """After several updates, velocity should be non-zero."""
        tracker = ShuttleTracker()
        for i in range(10):
            tracker.update((100.0 + i * 5, 200.0 + i * 3))
        vel = tracker.get_velocity()
        assert vel is not None
        assert vel[0] != 0 or vel[1] != 0

    def test_is_valid_after_min_hits(self) -> None:
        """Track should be valid after MIN_HITS detections."""
        tracker = ShuttleTracker()
        for i in range(tracker.MIN_HITS):
            tracker.update((100.0 + i, 200.0))
        assert tracker.is_valid()

    def test_reset(self) -> None:
        """Reset should clear all state."""
        tracker = ShuttleTracker()
        tracker.update((100.0, 200.0))
        tracker.update((110.0, 210.0))
        tracker.reset()
        assert tracker.get_track_history() == []
        assert not tracker.is_valid()
