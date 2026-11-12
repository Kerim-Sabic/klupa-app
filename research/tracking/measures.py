"""Movement measures from the full-rate (25 Hz) positions -> research/out/tracking_measures.json.

Definitions (all conventions, stated so nobody mistakes them for provider metrics):
- Time window: from the event-clock kick-off of each half to the last tracking frame
  (second half ends 3.8 s before the event final whistle). "Minutes" are clock minutes
  on the pitch, dead-ball time included.
- Speed: displacement over a centred 0.4 s window (+-5 frames) / 0.4 s, shrinking at the
  edges of a player's on-pitch run. Distance = sum of speed / 25 per frame.
- High-speed running distance: distance covered at speed > 5.5 m/s.
- Top speed: 95th percentile and maximum of the smoothed speed.
- Sprint: a run of at least 1.0 s (25 frames) with smoothed speed >= 7.0 m/s. The brief
  did not fix a sprint definition; 7.0 m/s for 1 s is our choice.
- Team shape per minute (outfield players, goalkeeper excluded as in geometry.py), from
  1 Hz samples taken while the ball is in play; the minute is floor(seconds / 60).
- "Space control (nearest player)": share of the 32 x 21 grid cells whose nearest player
  belongs to the home side, every 5 s (event grid, clipped to the tracking). Not a pitch
  control model. Home/away are the event fixture's labels (home = Leverkusen).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import common
import fullrate
import geometry

HSR_MPS = 5.5
SPRINT_MPS = 7.0
SPRINT_FRAMES = 25
COLS, ROWS = 32, 21


def jump_windows(x: np.ndarray, y: np.ndarray, jump_mps: float) -> np.ndarray:
    """True for frames whose speed window (+-HALF_WINDOW frames) holds a one-frame step above jump_mps."""
    step = np.nan_to_num(np.hypot(np.diff(x), np.diff(y)) * common.FRAME_RATE)
    total = np.concatenate(([0], np.cumsum(step > jump_mps)))
    idx = np.arange(len(x))
    lo = np.maximum(idx - fullrate.HALF_WINDOW, 0)
    hi = np.minimum(idx + fullrate.HALF_WINDOW, len(x) - 1)
    return total[hi] - total[lo] > 0


def player_totals(
    full: dict, kicks: dict[str, float], jump_mps: float | None = None
) -> tuple[dict, list[float]]:
    """Unrounded per-player sums over both halves, keyed by (side, shirt), plus the
    provider-speed ratios. player_rows below and physical.py both format these.

    With `jump_mps` set, a step between two consecutive frames faster than that is a tracking
    jump (a lost track freezes and then snaps to the player's real position, seen in five of
    the seven DFL matches). Every frame whose 0.4 s speed window contains a jump stays in
    "frames" (minutes) but is left out of distance, high-speed distance, sprints (it ends a
    sprint run) and top speed, and is counted in "excluded". measures.py itself leaves it
    unset, so its results are unchanged."""
    stats: dict[tuple[str, int], dict] = {}
    ratios: list[float] = []
    for half_name in common.HALVES:
        half = full["halves"][half_name]
        start = fullrate.first_frame_at_or_after_kickoff(half, kicks[half_name])
        for p in half["players"]:
            v = fullrate.smoothed_speed(p["x"], p["y"])
            window = np.zeros(half["frames"], dtype=bool)
            window[start:] = True
            use = window & ~np.isnan(v)
            if not use.any():
                continue
            bad = use & jump_windows(p["x"], p["y"], jump_mps) if jump_mps is not None else np.zeros_like(use)
            counted = use & ~bad
            key = (p["side"], p["shirt"])
            row = stats.setdefault(
                key,
                {"frames": 0, "excluded": 0, "dist": 0.0, "hsr": 0.0, "sprints": 0, "raw": 0.0, "speeds": []},
            )
            speeds = v[counted]
            row["frames"] += int(use.sum())
            row["excluded"] += int(bad.sum())
            row["dist"] += float(speeds.sum() / common.FRAME_RATE)
            row["hsr"] += float(speeds[speeds > HSR_MPS].sum() / common.FRAME_RATE)
            row["sprints"] += fullrate.runs_at_least(counted & (np.nan_to_num(v) >= SPRINT_MPS), SPRINT_FRAMES)
            steps = np.hypot(np.diff(p["x"]), np.diff(p["y"]))
            row["raw"] += float(np.nansum(steps[start:]))
            row["speeds"].append(speeds)
            both = use & ~np.isnan(p["s"]) & (v > 1)
            ratios.extend((p["s"][both] / v[both])[::25].tolist())
    return stats, ratios


def player_rows(full: dict, kicks: dict[str, float]) -> dict:
    stats, ratios = player_totals(full, kicks)
    out: dict[str, dict] = {"home": {}, "away": {}}
    for (side, shirt), row in sorted(stats.items(), key=lambda kv: (kv[0][0] != "home", kv[0][1])):
        s = np.concatenate(row["speeds"])
        out[side][str(shirt)] = {
            "minutes": round(row["frames"] / common.FRAME_RATE / 60, 2),
            "distanceM": round(row["dist"], 1),
            "distanceRawStepsM": round(row["raw"], 1),
            "highSpeedRunningM": round(row["hsr"], 1),
            "topSpeedP95Mps": round(float(np.percentile(s, 95)), 2),
            "topSpeedMaxMps": round(float(s.max()), 2),
            "sprints": row["sprints"],
        }
    out["_providerSpeedRatio"] = {
        "note": "provider field S divided by our smoothed speed where ours > 1 m/s, every 25th frame",
        "median": round(float(np.median(ratios)), 3),
        "p05": round(float(np.percentile(ratios, 5)), 3),
        "p95": round(float(np.percentile(ratios, 95)), 3),
    }
    return out


def keeper_index(half: dict, tracking: geometry.Tracking, period: int) -> dict[str, int]:
    shirts = {s: tracking.roster[i]["shirt"] for s, i in tracking.keepers(period).items()}
    return {
        s: next(j for j, p in enumerate(half["players"]) if p["side"] == s and p["shirt"] == shirt)
        for s, shirt in shirts.items()
    }


def team_minutes(full: dict, kicks: dict, tracking: geometry.Tracking) -> tuple[dict, dict]:
    per_minute: dict[str, dict] = {}
    pooled: dict[str, list[dict]] = {"home": [], "away": []}
    for period, half_name in enumerate(common.HALVES, start=1):
        half = full["halves"][half_name]
        end = (half["frames"] - 1) / common.FRAME_RATE - fullrate.kick_offset_ms(half, kicks[half_name]) / 1000
        times = np.arange(0, int(end) + 1, dtype=np.float64)
        xs, ys, alive = fullrate.positions_at(half, kicks[half_name], times)
        keepers = keeper_index(half, tracking, period)
        direction = tracking.attack_direction(period)
        rows: dict[str, dict[int, list[dict]]] = {"home": {}, "away": {}}
        for k in np.flatnonzero(alive):
            for side in ("home", "away"):
                idx = [
                    j
                    for j, p in enumerate(half["players"])
                    if p["side"] == side and j != keepers[side] and not np.isnan(xs[k, j])
                ]
                shape = geometry.shape_of(np.column_stack((xs[k, idx], ys[k, idx])))
                if shape is not None:
                    shape["centroidAttackX"] = shape["centroidX"] * direction[side]
                    rows[side].setdefault(int(times[k]) // 60, []).append(shape)
                    pooled[side].append(shape)
        per_minute[str(period)] = {
            side: [
                {"minute": m, "inPlaySeconds": len(v), **{
                    key: round(float(np.mean([s[key] for s in v])), 2)
                    for key in ("centroidAttackX", "centroidY", "width", "length", "area")
                }}
                for m, v in sorted(rows[side].items())
            ]
            for side in ("home", "away")
        }
    mean = {
        side: {
            key: round(float(np.mean([s[key] for s in v])), 2)
            for key in ("centroidAttackX", "centroidY", "width", "length", "area")
        }
        | {"inPlaySeconds": len(v)}
        for side, v in pooled.items()
    }
    return per_minute, mean


def control_series(full: dict, kicks: dict, tracking: geometry.Tracking) -> dict:
    fixture = json.loads(common.FIXTURE.read_text(encoding="utf-8"))
    length, width = full["pitch"]
    periods = []
    dropped = 0
    max_diff = 0
    for period, half_name in enumerate(common.HALVES, start=1):
        half = full["halves"][half_name]
        duration = fixture["periods"][period - 1]["durationSeconds"]
        end = (half["frames"] - 1) / common.FRAME_RATE - fullrate.kick_offset_ms(half, kicks[half_name]) / 1000
        grid = np.arange(0, duration + 1, 5, dtype=np.float64)
        dropped += int((grid > end).sum())
        grid = grid[grid <= end]
        xs, ys, alive = fullrate.positions_at(half, kicks[half_name], grid)
        homes = np.array([p["side"] == "home" for p in half["players"]])
        cells = []
        for k, t in enumerate(grid):
            here = ~np.isnan(xs[k])
            owners = geometry.control_owners(xs[k, here], ys[k, here], homes[here], length, width, COLS, ROWS)
            cells.append(int(owners.sum()))
            shipped = geometry.space_control(tracking.frame_at(period, float(t)), tracking, COLS, ROWS)
            max_diff = max(max_diff, abs(shipped["homeCells"] - cells[-1]))
        periods.append(
            {
                "period": period,
                "t": [int(t) for t in grid],
                "homeCells": cells,
                "ballInPlay": [int(a) for a in alive],
            }
        )
    total = COLS * ROWS
    shares = np.array([c / total for p in periods for c in p["homeCells"]])
    in_play = np.array([a for p in periods for a in p["ballInPlay"]], dtype=bool)
    return {
        "name": "space control (nearest player)",
        "grid": {"cols": COLS, "rows": ROWS, "cells": total},
        "stepSeconds": 5,
        "points": int(shares.size),
        "gridPointsDroppedAfterTrackingEnds": dropped,
        "meanHomeShare": round(float(shares.mean()), 4),
        "meanHomeShareBallInPlay": round(float(shares[in_play].mean()), 4),
        "maxCellDifferenceVsShippedBinary": max_diff,
        "periods": periods,
    }


def main() -> None:
    full = common.load_full()
    kicks = common.kickoff_times()
    tracking = geometry.Tracking()
    minutes, mean = team_minutes(full, kicks, tracking)
    result = {
        "match": common.MATCH,
        "note": "Home = event fixture label (Leverkusen, the DFL guest team). One match, one description.",
        "definitions": {
            "hsrThresholdMps": HSR_MPS,
            "sprint": f"smoothed speed >= {SPRINT_MPS} m/s for >= {SPRINT_FRAMES / common.FRAME_RATE} s",
            "speedWindowSeconds": fullrate.SMOOTH_FRAMES / common.FRAME_RATE,
        },
        "players": player_rows(full, kicks),
        "teamMinutes": minutes,
        "teamMeans": mean,
        "spaceControl": control_series(full, kicks, tracking),
    }
    common.out_path("tracking_measures").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    summary = {
        "spaceControl": {k: v for k, v in result["spaceControl"].items() if k != "periods"},
        "teamMeans": mean,
        "providerSpeedRatio": result["players"]["_providerSpeedRatio"],
    }
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
