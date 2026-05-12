import math

import numpy as np
import pytest

from speed import CourtCalibration, SpeedCalculator
from tracker import ShuttleTracker


class TestCourtCalibration:
    def test_calibrate_two_points(self):
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        assert cal.pixels_per_meter == pytest.approx(100.0, rel=0.01)

    def test_calibrate_auto(self):
        cal = CourtCalibration()
        cal.calibrate_auto(1920, 1080)
        assert cal.pixels_per_meter > 0

    def test_calibrate_insufficient_points(self):
        cal = CourtCalibration()
        with pytest.raises(ValueError):
            cal.calibrate([(0, 0)])


class TestSpeedCalculator:
    def test_first_frame_returns_none(self):
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        calc = SpeedCalculator(fps=60.0, calibration=cal)
        assert calc.compute_speed((100, 100)) is None

    def test_stationary_returns_zero(self):
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        calc = SpeedCalculator(fps=60.0, calibration=cal)
        calc.compute_speed((100, 100))
        speed = calc.compute_speed((100, 100))
        assert speed == pytest.approx(0.0)

    def test_moving_returns_positive(self):
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        calc = SpeedCalculator(fps=60.0, calibration=cal)
        calc.compute_speed((100, 100))
        speed = calc.compute_speed((200, 100))
        assert speed is not None
        assert speed > 0

    def test_max_speed_tracking(self):
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        calc = SpeedCalculator(fps=60.0, calibration=cal)
        calc.compute_speed((100, 100))
        calc.compute_speed((200, 100))
        calc.compute_speed((250, 100))
        assert calc.get_max_speed() >= calc.get_average_speed()

    def test_reset(self):
        cal = CourtCalibration()
        cal.calibrate([(0, 0), (1340, 0)])
        calc = SpeedCalculator(fps=60.0, calibration=cal)
        calc.compute_speed((100, 100))
        calc.compute_speed((200, 100))
        calc.reset()
        assert calc.get_speed_history() == []


class TestShuttleTracker:
    def test_initial_returns_none(self):
        tracker = ShuttleTracker()
        result = tracker.update(None)
        assert result is None

    def test_first_detection_initializes(self):
        tracker = ShuttleTracker()
        pos = tracker.update((100.0, 200.0))
        assert pos is not None

    def test_tracking_without_detection(self):
        tracker = ShuttleTracker()
        tracker.update((100.0, 200.0))
        pos = tracker.update(None)
        assert pos is not None
