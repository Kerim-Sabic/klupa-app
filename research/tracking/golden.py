"""Write the golden fixture for src/engine/__tests__/tracking.test.ts.

For 40 times spread over both halves (plus six edge cases around a sent-off player and a
late substitute) this computes, in Python on the SHIPPED binary, the interpolated frame,
team shape (scipy Qhull hull) and space control (vectorised nearest player), so the
TypeScript engine is checked against an independent implementation.
Times are multiples of 1/16 s, so interpolation fractions (0, .25, .5, .75) are exact
in binary floating point in both languages.
Run: research/.venv/Scripts/python.exe -I research/tracking/golden.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import geometry

OUT = geometry.REPO / "src" / "engine" / "__tests__" / "tracking-golden.json"
COLS, ROWS = 32, 21


def spread_times(tracking: geometry.Tracking) -> list[tuple[int, float]]:
    times = []
    for period in (1, 2):
        duration = tracking.period(period)["durationSeconds"]
        for i in range(20):
            seconds = np.floor(duration * (i + 0.5) / 20 * 16) / 16
            times.append((period, float(seconds)))
    return times


def edge_times(tracking: geometry.Tracking) -> list[tuple[int, float, str]]:
    roster = tracking.roster
    slot = {(r["side"], r["shirt"]): r["slot"] for r in roster}
    rate = tracking.rate
    out = []
    red = slot[("home", 21)]
    present = tracking.samples(1)[:, red, 0] != tracking.sentinel
    last = int(np.flatnonzero(present)[-1])
    out += [
        (1, last / rate, "last sample of the sent-off player"),
        (1, last / rate + 0.125, "between his last sample and the next: absent, never interpolated"),
        (1, (last + 1) / rate, "first sample after he left"),
    ]
    sub = slot[("home", 18)]
    present = tracking.samples(2)[:, sub, 0] != tracking.sentinel
    first = int(np.flatnonzero(present)[0])
    out += [
        (2, (first - 1) / rate + 0.125, "between an absent sample and a substitute's first: absent"),
        (2, first / rate, "substitute's first sample"),
        (2, first / rate + 0.125, "substitute interpolated between two present samples"),
    ]
    return out


def describe(tracking: geometry.Tracking, period: int, seconds: float, note: str | None) -> dict:
    frame = tracking.frame_at(period, seconds)
    keepers = tracking.keepers(period)
    control = geometry.space_control(frame, tracking, COLS, ROWS)
    present = [i for i in range(len(tracking.roster)) if not np.isnan(frame[i, 0])]
    ball = frame[-1]
    item = {
        "period": period,
        "seconds": seconds,
        "playersOnPitch": len(present),
        "homePlayers": int(sum(1 for i in present if tracking.sides[i])),
        "awayPlayers": int(sum(1 for i in present if not tracking.sides[i])),
        "ball": None if np.isnan(ball[0]) else {"x": float(ball[0]), "y": float(ball[1])},
        "shapes": {side: geometry.team_shape(frame, tracking, side, keepers[side]) for side in ("home", "away")},
        "control": {
            "homeCells": control["homeCells"],
            "awayCells": control["awayCells"],
            "owners": "".join("1" if o else "0" for o in control["owners"]),
        },
    }
    if note:
        item["note"] = note
    return item


def main() -> None:
    tracking = geometry.Tracking()
    frames = [describe(tracking, p, t, None) for p, t in spread_times(tracking)]
    frames += [describe(tracking, p, t, n) for p, t, n in edge_times(tracking)]
    roster = tracking.roster
    periods = []
    for period in (1, 2):
        keepers = tracking.keepers(period)
        direction = tracking.attack_direction(period)
        periods.append(
            {
                "period": period,
                "keeperSlots": keepers,
                "keeperShirts": {s: roster[i]["shirt"] for s, i in keepers.items()},
                "attack": direction,
            }
        )
    fixture = {
        "note": "Computed by research/tracking/golden.py (numpy + scipy) from the shipped binary.",
        "binarySha256": hashlib.sha256(geometry.BIN.read_bytes()).hexdigest(),
        "grid": {"cols": COLS, "rows": ROWS},
        "periods": periods,
        "spreadFrames": 40,
        "frames": frames,
    }
    OUT.write_text(json.dumps(fixture, indent=1) + "\n", encoding="utf-8")
    print(len(frames), "frames written to", OUT)
    print(json.dumps(periods))


if __name__ == "__main__":
    main()
