"""Does territory tell the same story as chances? One match, one description.

Compares, on the 5-second grid of the event study, the sign of the trailing xG balance
(home minus away, provider xG, same half-relative clock, windows (t - W, t] reset each
half) with the sign of the trailing mean "space control (nearest player)" advantage
(home share - 0.5, mean over the 5 s grid points inside the same window).

Reads: src/data/dfl/DFL-MAT-J03WN1.json (shots), research/out/tracking_measures.json
(space-control series). Writes research/out/tracking_territory.json.
This is one match with one red card (home, "Leverkusen", 10 men from about minute 7), and
overlapping windows are far from independent: nothing here generalises.
"""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from scipy.stats import pearsonr, spearmanr

import common
import geometry

WINDOWS = (180, 300, 600)


def units(text: str) -> int:
    return int(Decimal(text) * 10000)


def check_labels(fixture: dict, tracking: geometry.Tracking) -> dict:
    """Rebuild the shot list from the raw events with OUR side labels and compare."""
    label = common.side_labels()
    starts = common.kickoff_times()
    ends = {}
    shots = []
    root = ET.parse(common.EVENTS).getroot()
    for event in root.findall("Event"):
        if event.find("Delete") is not None:
            continue
        time = common.parse_time(event.attrib["EventTime"])
        for child in event:
            if child.tag == "FinalWhistle" and child.get("GameSection") in common.HALVES:
                ends[child.get("GameSection")] = time
        for node in event.iter("ShotAtGoal"):
            shots.append((time, label[node.attrib["Team"]], node.attrib["xG"]))
    rebuilt = []
    for index, half in enumerate(common.HALVES, start=1):
        for time, side, xg in sorted(shots):
            if starts[half] <= time <= ends[half]:
                rebuilt.append((index, round(time - starts[half], 3), side, xg))
    from_fixture = [
        (p["period"], s["t"], s["side"], s["xg"]) for p in fixture["periods"] for s in p["shots"]
    ]
    same = sorted(rebuilt) == sorted(from_fixture)
    # Independent geometric check: the ball should be in the half the shooter attacks.
    in_attacking_half = 0
    total = 0
    for period, t, side, _xg in from_fixture:
        if t > tracking.period(period)["durationSeconds"]:
            continue
        frame = tracking.frame_at(period, t)
        ball_x = frame[-1, 0]
        direction = tracking.attack_direction(period)[side]
        total += 1
        in_attacking_half += int(ball_x * direction > 0)
    return {
        "shotsInFixture": len(from_fixture),
        "shotsRebuiltFromEventsWithTrackingLabels": len(rebuilt),
        "identical": same,
        "shotsWithBallInShootersAttackingHalf": in_attacking_half,
        "shotsChecked": total,
    }


def sign(values: np.ndarray) -> np.ndarray:
    return np.sign(values).astype(int)


def window_series(fixture: dict, control: dict, window: int) -> dict:
    xg_all: list[float] = []
    sc_all: list[float] = []
    t_all: list[int] = []
    per_period: list[int] = []
    for period in control["periods"]:
        shots = fixture["periods"][period["period"] - 1]["shots"]
        times = np.array([s["t"] for s in shots])
        weight = np.array([units(s["xg"]) * (1 if s["side"] == "home" else -1) for s in shots])
        grid = np.array(period["t"], dtype=float)
        adv = np.array(period["homeCells"]) / control["grid"]["cells"] - 0.5
        for k, t in enumerate(grid):
            in_window = (times > t - window) & (times <= t)
            xg_all.append(float(weight[in_window].sum()) / 10000.0)
            sel = (grid > t - window) & (grid <= t)
            sc_all.append(float(adv[sel].mean()))
            t_all.append(int(t))
            per_period.append(period["period"])
    return {"xg": np.array(xg_all), "sc": np.array(sc_all), "t": np.array(t_all), "period": np.array(per_period)}


def summarise(series: dict, window: int) -> dict:
    xg, sc = series["xg"], series["sc"]
    sx, ss = sign(xg), sign(sc)
    both = (sx != 0) & (ss != 0)
    agree = both & (sx == ss)
    p_x = float((sx[both] > 0).mean())
    p_s = float((ss[both] > 0).mean())
    chance = p_x * p_s + (1 - p_x) * (1 - p_s)
    full = series["t"] % window == 0
    full &= series["t"] >= window
    block = both & full
    nonempty = sx != 0
    return {
        "windowSeconds": window,
        "gridPoints": int(xg.size),
        "xgSignNonzero": int((sx != 0).sum()),
        "spaceControlSignNonzero": int((ss != 0).sum()),
        "bothHaveASign": int(both.sum()),
        "agree": int(agree.sum()),
        "agreeShare": round(float(agree.sum() / both.sum()), 4),
        "agreeShareIfIndependentGivenMarginals": round(chance, 4),
        "homeAheadShareAmongBoth": {"xg": round(p_x, 4), "spaceControl": round(p_s, 4)},
        "pearsonAllPoints": round(float(pearsonr(xg, sc)[0]), 4),
        "spearmanAllPoints": round(float(spearmanr(xg, sc)[0]), 4),
        "pearsonPointsWithAShotInWindow": round(float(pearsonr(xg[nonempty], sc[nonempty])[0]), 4),
        "nonOverlappingFullWindows": {
            "bothHaveASign": int(block.sum()),
            "agree": int((block & (sx == ss)).sum()),
        },
    }


def main() -> None:
    fixture = json.loads(common.FIXTURE.read_text(encoding="utf-8"))
    control = json.loads((common.OUT / "tracking_measures.json").read_text(encoding="utf-8"))["spaceControl"]
    tracking = geometry.Tracking()
    result = {
        "match": common.MATCH,
        "caveat": (
            "One match. Home had 10 men from about minute 7 of the first half. Grid points "
            "share overlapping windows, so counts are not independent observations. "
            "Description only; no generalisation."
        ),
        "labelChecks": check_labels(fixture, tracking),
        "measure": "space control (nearest player), 32 x 21 grid, home share - 0.5",
        "totalShots": sum(len(p["shots"]) for p in fixture["periods"]),
        "gridPoints": sum(len(p["t"]) for p in control["periods"]),
        "windows": [summarise(window_series(fixture, control, w), w) for w in WINDOWS],
    }
    (common.OUT / "tracking_territory.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
