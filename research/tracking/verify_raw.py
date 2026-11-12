"""Second, independent check of the shipped binary against the raw XML.

convert.py parses with ElementTree and numpy. This script shares none of that: it reads
the positions, events and match-information files as text with regular expressions,
picks 400 random shipped frames (seeded) plus the first and last frame of each period,
recomputes every object's position by its own linear interpolation of the raw numbers,
and compares with the shipped Int16 values. The expected value is rounded to whole
centimetres exactly as the shipped one, so any difference larger than 1 cm, or any
presence/absence disagreement, is a bug. Standard library + numpy only.
Run: research/.venv/Scripts/python.exe -I research/tracking/verify_raw.py
"""

from __future__ import annotations

import json
import random
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common
import geometry

FRAME = re.compile(r'<Frame N="(\d+)" T="([^"]+)" X="(-?[\d.]+)" Y="(-?[\d.]+)"')
FRAMESET = re.compile(r'<FrameSet GameSection="(\w+)" MatchId="[^"]+" TeamId="([^"]+)" PersonId="([^"]+)"')


def seconds(text: str) -> float:
    return datetime.fromisoformat(text).timestamp()


def grid_position(kick_time: float, first_time: float, k: int, rate: int) -> float:
    """Fractional raw-frame index of shipped sample k. The kick-off offset is rounded to whole
    milliseconds (the resolution of the timestamps), so a sample that lies exactly on a raw
    frame is not pushed off it by floating-point noise; before the first frame the first
    frame is held, as in the converter."""
    return max(0.0, round((kick_time - first_time) * 1000) / 40 + k * 25 / rate)


def side_and_shirts() -> tuple[dict[str, tuple[str, int]], dict[str, str]]:
    info = common.MATCHINFO.read_text(encoding="utf-8")
    teams = re.findall(r'<Team TeamId="([^"]+)".*?</Team>', info, flags=re.S)
    blocks = re.findall(r'(<Team TeamId="[^"]+".*?</Team>)', info, flags=re.S)
    home_club = min(teams)
    people: dict[str, tuple[str, int]] = {}
    clubs: dict[str, str] = {}
    for team, block in zip(teams, blocks):
        side = "home" if team == home_club else "away"
        clubs[team] = side
        for person, shirt in re.findall(r'<Player PersonId="([^"]+)" ShirtNumber="(\d+)"', block):
            people[person] = (side, int(shirt))
    return people, clubs


def kickoffs() -> dict[str, float]:
    text = common.EVENTS.read_text(encoding="utf-8")
    out = {}
    for time, half in re.findall(r'EventTime="([^"]+)"[^>]*>\s*<KickOff [^>]*GameSection="(\w+)"', text):
        out[half] = seconds(time)
    return out


def first_frames() -> dict[str, tuple[int, float]]:
    """Per half: (lowest frame number over all FrameSets, its timestamp in seconds)."""
    first: dict[str, tuple[int, float]] = {}
    half: str | None = None
    with common.POSITIONS.open(encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("<FrameSet"):
                header = FRAMESET.search(line)
                half = header.group(1) if header else None
            elif half is not None and line.startswith("<Frame "):
                match = FRAME.search(line)
                if match and (half not in first or int(match.group(1)) < first[half][0]):
                    first[half] = (int(match.group(1)), seconds(match.group(2)))
                half = None  # only the first frame of each FrameSet is needed
    return first


def main() -> None:
    tracking = geometry.Tracking()
    people, _clubs = side_and_shirts()
    kick = kickoffs()
    assert set(kick) == {"firstHalf", "secondHalf"}, kick
    rate = tracking.rate
    rng = random.Random(20261111)
    picks: dict[int, list[int]] = {}
    for period in (1, 2):
        count = tracking.period(period)["frameCount"]
        chosen = {0, count - 1} | {rng.randrange(count) for _ in range(200)}
        picks[period] = sorted(chosen)
    # Pass 1: the first frame (number and time) of each half is the lowest frame number of
    # any FrameSet in it. The first FrameSet listed is not always that one: a substitute's
    # FrameSet can come first and start later.
    first = first_frames()
    needed: dict[str, set[int]] = {"firstHalf": set(), "secondHalf": set()}
    for half, (n_first, t_first) in first.items():
        for k in picks[1 if half == "firstHalf" else 2]:
            low = int(grid_position(kick[half], t_first, k, rate) // 1)
            needed[half].update((n_first + low, n_first + low + 1))
    # Pass 2: read only the wanted frames.
    sets: dict[str, dict[int, tuple[float, float, float]]] = {}
    current: tuple[str, str] | None = None
    with common.POSITIONS.open(encoding="utf-8") as handle:
        for line in handle:
            header = FRAMESET.search(line) if line.startswith("<FrameSet") else None
            if header:
                half, team, person = header.groups()
                current = None if team == "referee" else (half, "BALL" if team == "BALL" else person)
                continue
            match = FRAME.search(line) if current is not None and line.startswith("<Frame ") else None
            if match and current is not None and int(match.group(1)) in needed[current[0]]:
                half, key = current
                sets.setdefault(f"{half}|{key}", {})[int(match.group(1))] = (
                    float(match.group(3)),
                    float(match.group(4)),
                    0.0,
                )
    checked = 0
    max_diff = 0.0
    mismatches = 0
    absent_ok = 0
    slot_of = {(r["side"], r["shirt"]): r["slot"] for r in tracking.roster}
    for period, half in ((1, "firstHalf"), (2, "secondHalf")):
        n0, t0 = first[half]
        for k in picks[period]:
            u = grid_position(kick[half], t0, k, rate)
            low = int(u // 1)
            frac = u - low
            shipped = tracking.samples(period)[k]
            objects = [(slot_of[people[p]], f"{half}|{p}") for p in people if f"{half}|{p}" in sets]
            objects.append((len(tracking.roster), f"{half}|BALL"))
            present_slots = set()
            for column, name in objects:
                a = sets[name].get(n0 + low)
                b = sets[name].get(n0 + low + 1)
                if a is None or (frac > 1e-9 and b is None):
                    continue
                present_slots.add(column)
                x = a[0] if frac <= 1e-9 else a[0] + (b[0] - a[0]) * frac
                y = a[1] if frac <= 1e-9 else a[1] + (b[1] - a[1]) * frac
                for got, want in ((int(shipped[column, 0]), x), (int(shipped[column, 1]), y)):
                    diff = abs(got - round(want * 100))
                    max_diff = max(max_diff, diff)
                    mismatches += int(diff > 1)
                    checked += 1
            for column in range(tracking.cols):
                if column not in present_slots:
                    absent_ok += int(shipped[column, 0] == tracking.sentinel)
                    mismatches += int(shipped[column, 0] != tracking.sentinel)
    result = {
        "framesChecked": sum(len(v) for v in picks.values()),
        "coordinateValuesCompared": checked,
        "absentColumnsConfirmed": absent_ok,
        "maxAbsDifferenceCm": max_diff,
        "mismatches": mismatches,
        "passes": mismatches == 0,
    }
    common.out_path("tracking_verify").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=1))
    if mismatches:
        raise SystemExit("raw verification failed")


if __name__ == "__main__":
    main()
