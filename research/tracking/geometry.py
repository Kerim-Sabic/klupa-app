"""Geometry on the shipped, resampled tracking data (Python reference implementation).

Everything here reads `public/data/tracking/<short id>.bin` (J03WN1 unless KLUPA_MATCH says otherwise) + `.json` exactly as the
browser does, and is the independent reference for src/engine/tracking.ts: the
interpolation is numpy, the hull is scipy's Qhull (the TypeScript uses a
monotone chain), and the space-control grid is a vectorised argmin.

Definitions (shared with the TypeScript engine, see README):
- Goalkeeper of a side in a period: the player of that side nearest their own goal
  line at the first sample (t = 0, the event-clock kick-off) of the period. Which end
  is "own" is decided by the side whose centroid is further from the centre line (the
  non-kicking team); the other side defends the opposite end. Limit: assumes the
  goalkeeper has not left his half at t = 0 and is on the pitch.
- Outfield players: every player of the side on the pitch except that goalkeeper.
- Shape: centroid = mean of outfield (x, y); width = max y - min y; length =
  max x - min x; hull area = convex hull area of the outfield points (0 for < 3).
- Space control (nearest player): cells of a cols x rows grid over the pitch; each
  cell centre is owned by the nearest player of either side (all players on the
  pitch, goalkeepers included); ties go to the lower roster slot.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from scipy.spatial import ConvexHull, QhullError

REPO = Path(__file__).resolve().parents[2]
TRACKING_DIR = REPO / "public" / "data" / "tracking"
SHORT = os.environ.get("KLUPA_MATCH", "J03WN1")
BIN = TRACKING_DIR / f"{SHORT}.bin"
META = TRACKING_DIR / f"{SHORT}.json"


class Tracking:
    """The shipped file, decoded: metres, NaN for absent players."""

    def __init__(self, bin_path: Path = BIN, meta_path: Path = META) -> None:
        self.meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta = self.meta
        self.rate = meta["sampleRateHz"]
        self.sentinel = meta["sentinel"]
        self.roster = meta["roster"]
        self.cols = len(self.roster) + 1
        raw = np.fromfile(bin_path, dtype="<i2")
        total = sum(p["frameCount"] for p in meta["periods"])
        self.raw = raw.reshape(total, self.cols, 2)
        self.pitch = (meta["pitch"]["lengthMetres"], meta["pitch"]["widthMetres"])
        self.sides = np.array([r["side"] == "home" for r in self.roster])

    def period(self, period: int) -> dict:
        return self.meta["periods"][period - 1]

    def samples(self, period: int) -> np.ndarray:
        info = self.period(period)
        return self.raw[info["startFrame"] : info["startFrame"] + info["frameCount"]]

    def sample_metres(self, period: int, index: int) -> np.ndarray:
        """(cols, 2) float64 metres, NaN where the sentinel is stored."""
        cm = self.samples(period)[index].astype(np.float64)
        out = cm / 100.0
        out[self.samples(period)[index][:, 0] == self.sentinel] = np.nan
        return out

    def frame_at(self, period: int, seconds: float) -> np.ndarray:
        """(cols, 2) metres at `seconds`; linear between samples, NaN across a sentinel."""
        info = self.period(period)
        position = seconds * self.rate
        low = int(np.floor(position))
        fraction = position - low
        if low < 0 or position > info["frameCount"] - 1:
            raise ValueError("time outside the period")
        a = self.sample_metres(period, low)
        if fraction == 0:
            return a
        b = self.sample_metres(period, low + 1)
        return a + (b - a) * fraction

    def own_goal_signs(self, period: int) -> dict[str, int]:
        """-1 when the side defends the goal at -x, +1 for +x, from the kick-off sample.

        The side whose centroid is further from the centre line decides (the team that
        is not taking the kick-off is clearly in its own half); the other side defends
        the opposite end. Deciding each side from its own centroid is wrong for the
        kicking-off team, whose players stand near the centre circle.
        """
        frame = self.sample_metres(period, 0)
        centroid = {}
        for side, flag in (("home", True), ("away", False)):
            xs = [frame[i, 0] for i in range(len(self.roster)) if self.sides[i] == flag and not np.isnan(frame[i, 0])]
            centroid[side] = float(np.mean(xs))
        decider = "home" if abs(centroid["home"]) >= abs(centroid["away"]) else "away"
        other = "away" if decider == "home" else "home"
        sign = -1 if centroid[decider] < 0 else 1
        return {decider: sign, other: -sign}

    def keepers(self, period: int) -> dict[str, int]:
        """Goalkeeper slot per side: nearest their own goal line at the kick-off sample."""
        frame = self.sample_metres(period, 0)
        signs = self.own_goal_signs(period)
        out: dict[str, int] = {}
        for side, flag in (("home", True), ("away", False)):
            slots = [i for i in range(len(self.roster)) if self.sides[i] == flag and not np.isnan(frame[i, 0])]
            out[side] = max(slots, key=lambda i: signs[side] * frame[i, 0])
        return out

    def attack_direction(self, period: int) -> dict[str, int]:
        """+1 when the side attacks towards +x in the period."""
        return {side: -sign for side, sign in self.own_goal_signs(period).items()}


def shape_of(points: np.ndarray) -> dict | None:
    """Centroid, width, length and hull area of an (n, 2) array of outfield points."""
    if len(points) == 0:
        return None
    area = 0.0
    if len(points) >= 3:
        try:
            area = float(ConvexHull(points).volume)
        except QhullError:
            area = 0.0
    return {
        "count": int(len(points)),
        "centroidX": float(points[:, 0].mean()),
        "centroidY": float(points[:, 1].mean()),
        "width": float(points[:, 1].max() - points[:, 1].min()),
        "length": float(points[:, 0].max() - points[:, 0].min()),
        "area": area,
    }


def team_shape(frame: np.ndarray, tracking: Tracking, side: str, keeper: int) -> dict | None:
    """Shape of the outfield players of `side` in a (cols, 2) metre frame."""
    flag = side == "home"
    pts = [
        frame[i]
        for i in range(len(tracking.roster))
        if tracking.sides[i] == flag and i != keeper and not np.isnan(frame[i, 0])
    ]
    return shape_of(np.array(pts).reshape(-1, 2))


def grid_centres(length: float, width: float, cols: int, rows: int) -> tuple[np.ndarray, np.ndarray]:
    xs = -length / 2 + (np.arange(cols) + 0.5) * (length / cols)
    ys = -width / 2 + (np.arange(rows) + 0.5) * (width / rows)
    return xs, ys


def control_owners(
    px: np.ndarray, py: np.ndarray, is_home: np.ndarray, length: float, width: float, cols: int = 32, rows: int = 21
) -> np.ndarray:
    """Row-major boolean grid: True where the nearest player is a home player.

    `px`, `py`, `is_home` list the players on the pitch in roster-slot order, so
    argmin's first-minimum rule gives ties to the lower slot.
    """
    xs, ys = grid_centres(length, width, cols, rows)
    cx = np.tile(xs, rows)
    cy = np.repeat(ys, cols)
    dx = cx[:, None] - px[None, :]
    dy = cy[:, None] - py[None, :]
    return is_home[np.argmin(dx * dx + dy * dy, axis=1)]


def space_control(frame: np.ndarray, tracking: Tracking, cols: int = 32, rows: int = 21) -> dict:
    """Nearest-player ownership of a cols x rows grid. Counts are integers."""
    present = np.array([i for i in range(len(tracking.roster)) if not np.isnan(frame[i, 0])])
    owners = control_owners(
        frame[present, 0], frame[present, 1], tracking.sides[present], *tracking.pitch, cols, rows
    )
    return {
        "homeCells": int(owners.sum()),
        "awayCells": int((~owners).sum()),
        "cells": cols * rows,
        "owners": owners,
    }
