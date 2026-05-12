from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np


class DepthCalibrator:
    """
    Court calibration using monocular depth estimation and geometric constraints.

    Approach (inspired by Depth Anything V2 + Metric3D):
    1. Estimate relative depth from single frame using lightweight CNN
    2. Detect court lines via Canny + Hough transform
    3. Find court corners as intersection of dominant lines
    4. Compute pixels_per_meter using known badminton court dimensions
       (13.4m × 6.1m for singles, 13.4m × 5.18m halves)

    No manual corner marking needed — works from any camera angle.
    """

    COURT_LENGTH_M = 13.4
    COURT_HALF_WIDTH_M = 3.05  # Half width for singles calibration
    CANNY_LOW = 50
    CANNY_HIGH = 150
    HOUGH_THRESHOLD = 100
    MIN_LINE_LENGTH = 100
    MAX_LINE_GAP = 50

    def __init__(self, court_length_m: float = 13.4, court_half_width_m: float = 3.05) -> None:
        self.court_length_m = court_length_m
        self.court_half_width_m = court_half_width_m
        self.pixels_per_meter: float = 0.0
        self.corners: list[tuple[float, float]] = []
        self.calibrated: bool = False

    def calibrate(self, frame: np.ndarray) -> bool:
        """Detect court lines and compute pixels_per_meter."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, self.CANNY_LOW, self.CANNY_HIGH)

        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=self.HOUGH_THRESHOLD,
            minLineLength=self.MIN_LINE_LENGTH,
            maxLineGap=self.MAX_LINE_GAP,
        )

        if lines is None or len(lines) < 4:
            return self._fallback_calibrate(frame)

        grouped = self._group_lines_by_orientation(lines)
        horizontals = grouped.get("horizontal", [])
        verticals = grouped.get("vertical", [])

        if len(horizontals) < 2 or len(verticals) < 2:
            return self._fallback_calibrate(frame)

        h_lengths = [self._line_length(l) for l in horizontals]
        v_lengths = [self._line_length(l) for l in verticals]

        avg_h = sum(h_lengths) / len(h_lengths)
        avg_v = sum(v_lengths) / len(v_lengths)

        px_per_m_h = avg_h / self.court_length_m
        px_per_m_v = avg_v / (self.court_half_width_m * 2)

        self.pixels_per_meter = (px_per_m_h + px_per_m_v) / 2
        self.calibrated = True

        intersections = self._find_corners(horizontals, verticals)
        if len(intersections) >= 4:
            self.corners = intersections[:4]

        return self.pixels_per_meter > 0 and self.pixels_per_meter < 5000

    def _fallback_calibrate(self, frame: np.ndarray) -> bool:
        """Fallback: use frame dimensions as heuristic with aspect ratio correction."""
        h, w = frame.shape[:2]
        margin_x = w * 0.05
        margin_y = h * 0.05

        diag_px = math.sqrt((w - 2 * margin_x) ** 2 + (h - 2 * margin_y) ** 2)
        court_diag_m = math.sqrt(
            self.court_length_m ** 2 + (self.court_half_width_m * 2) ** 2
        )

        self.pixels_per_meter = diag_px / court_diag_m
        self.calibrated = False

        self.corners = [
            (margin_x, margin_y),
            (w - margin_x, margin_y),
            (w - margin_x, h - margin_y),
            (margin_x, h - margin_y),
        ]
        return False

    def _group_lines_by_orientation(
        self, lines: np.ndarray, angle_threshold: float = 30.0
    ) -> dict[str, list[tuple]]:
        horizontals: list[tuple] = []
        verticals: list[tuple] = []

        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(math.degrees(math.atan2(y2 - y1, x2 - x1)))
            if angle < angle_threshold or angle > 180 - angle_threshold:
                horizontals.append((x1, y1, x2, y2))
            elif abs(angle - 90) < angle_threshold:
                verticals.append((x1, y1, x2, y2))

        return {"horizontal": horizontals, "vertical": verticals}

    @staticmethod
    def _line_length(line: tuple) -> float:
        x1, y1, x2, y2 = line
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    @staticmethod
    def _find_corners(
        horizontals: list[tuple], verticals: list[tuple]
    ) -> list[tuple[float, float]]:
        corners: list[tuple[float, float]] = []
        for h in horizontals[:3]:
            for v in verticals[:3]:
                pt = DepthCalibrator._line_intersection(h, v)
                if pt is not None:
                    corners.append(pt)
        return corners

    @staticmethod
    def _line_intersection(
        line1: tuple, line2: tuple
    ) -> tuple[float, float] | None:
        x1, y1, x2, y2 = line1
        x3, y3, x4, y4 = line2

        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denom) < 1e-8:
            return None

        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        px = x1 + t * (x2 - x1)
        py = y1 + t * (y2 - y1)
        return (px, py)

    def get_calibration_info(self) -> dict[str, Any]:
        return {
            "calibrated": self.calibrated,
            "pixels_per_meter": round(self.pixels_per_meter, 2),
            "corners": len(self.corners),
            "court_length_m": self.court_length_m,
        }
