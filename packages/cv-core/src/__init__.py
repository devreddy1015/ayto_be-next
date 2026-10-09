"""SportIQ CV Core: shuttle/ball detection, tracking, calibration and speed."""

from .court import CourtCamera, detect_court_corners, motion_plane
from .pipeline import CVPipeline, FlightResult, FrameResult
from .speed import CourtCalibration, LaunchFit, SpeedCalculator, fit_launch_speed, speed_at_net
from .sports import SPORTS, SportProfile, get_sport
from .tracker import ShuttleTracker
from .trajectory import RectifiedTrack, find_trajectory_turns, rectify_trajectory

__all__ = [
    "CVPipeline",
    "FrameResult",
    "FlightResult",
    "CourtCamera",
    "detect_court_corners",
    "motion_plane",
    "CourtCalibration",
    "SpeedCalculator",
    "LaunchFit",
    "fit_launch_speed",
    "speed_at_net",
    "SPORTS",
    "SportProfile",
    "get_sport",
    "ShuttleTracker",
    "RectifiedTrack",
    "rectify_trajectory",
    "find_trajectory_turns",
]
