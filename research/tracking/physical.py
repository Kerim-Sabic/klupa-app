"""Physical measures per player and side from the full-rate (25 Hz) positions.

Writes public/data/tracking/<short id>.physical.json for the match chosen with KLUPA_MATCH
(default J03WN1). The numbers come from measures.player_totals, so the definitions are the
ones measures.py documents: speed over a centred 0.4 s window, high-speed running above
5.5 m/s, a sprint is at least 1.0 s at 7.0 m/s or more, minutes are clock minutes on the
pitch from the event kick-off of each half to the last tracking frame (dead-ball time
included). Players are professionals named in public match records; their short names come
from the match information and appear ONLY in this file, never in the binary or its metadata.
Side labels are the event fixture's (the lexicographically smaller club id is "home").
Run: research/.venv/Scripts/python.exe -I research/tracking/physical.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import common
import geometry
import measures

DEFINITIONS = {
    "sampleRateHz": common.FRAME_RATE,
    "window": "From the event-clock kick-off of each half to the last tracking frame; minutes are clock minutes on the pitch, dead-ball time included.",
    "speed": "Displacement over a centred 0.4 s window (10 frames at 25 Hz) divided by 0.4 s; the window shrinks at the ends of a player's time on the pitch.",
    "distanceKm": "Sum over frames of speed / 25, in kilometres.",
    "highSpeedMps": measures.HSR_MPS,
    "highSpeedKm": f"Distance covered while the smoothed speed is above {measures.HSR_MPS} m/s, in kilometres.",
    "sprintMps": measures.SPRINT_MPS,
    "sprintSeconds": measures.SPRINT_FRAMES / common.FRAME_RATE,
    "sprints": f"Number of runs of at least {measures.SPRINT_FRAMES / common.FRAME_RATE} s with smoothed speed of {measures.SPRINT_MPS} m/s or more.",
    "jumpMps": common.JUMP_MPS,
    "trackingJumps": f"A step between two consecutive frames faster than {common.JUMP_MPS} m/s (more than {common.JUMP_MPS / common.FRAME_RATE:.2f} m in 0.04 s, faster than any footballer) is a tracking jump: a lost track freezes and then snaps to the real position. Every frame whose 0.4 s speed window contains a jump counts as minutes on the pitch but not in distance, high-speed distance, sprints (it ends a sprint run) or top speed.",
    "topSpeed": "Maximum smoothed (0.4 s) speed in metres per second, not the provider's instantaneous value.",
    "totals": "Per side, summed from unrounded player values and then rounded; topSpeed is the maximum of the side's players.",
    "sides": "home / away are the event fixture's labels: the lexicographically smaller club id is home, which is not necessarily the DFL home team.",
}


def build() -> dict:
    info = common.read_match_info()
    side = common.side_labels()
    names = {
        pid: p["short"]
        for team in info["teams"].values()
        for pid, p in team["players"].items()
    }
    shirt_name: dict[tuple[str, int], str] = {}
    for club, team in info["teams"].items():
        for pid, p in team["players"].items():
            shirt_name[(side[club], p["shirt"])] = names[pid]
    full = common.load_full()
    kicks = common.kickoff_times()
    stats, _ratios = measures.player_totals(full, kicks, jump_mps=common.JUMP_MPS)
    players = []
    for (s, shirt), row in sorted(stats.items(), key=lambda kv: (kv[0][0] != "home", kv[0][1])):
        speeds = np.concatenate(row["speeds"])
        players.append(
            {
                "side": s,
                "shirt": shirt,
                "name": shirt_name[(s, shirt)],
                "minutes": round(row["frames"] / common.FRAME_RATE / 60, 1),
                "distanceKm": round(row["dist"] / 1000, 2),
                "highSpeedKm": round(row["hsr"] / 1000, 2),
                "sprints": row["sprints"],
                "topSpeed": round(float(speeds.max()), 2) if speeds.size else 0.0,
                "_raw": row,
            }
        )
    totals = {}
    for s in ("home", "away"):
        rows = [p for p in players if p["side"] == s]
        totals[s] = {
            "players": len(rows),
            "minutes": round(sum(p["_raw"]["frames"] for p in rows) / common.FRAME_RATE / 60, 1),
            "distanceKm": round(sum(p["_raw"]["dist"] for p in rows) / 1000, 2),
            "highSpeedKm": round(sum(p["_raw"]["hsr"] for p in rows) / 1000, 2),
            "sprints": sum(p["sprints"] for p in rows),
            "topSpeed": max(p["topSpeed"] for p in rows),
        }
    for p in players:
        del p["_raw"]
    # Every roster slot of the shipped binary must have a row, and the other way round.
    roster = {(r["side"], r["shirt"]) for r in geometry.Tracking().roster}
    rows = {(p["side"], p["shirt"]) for p in players}
    if roster != rows:
        raise SystemExit(f"roster and physical rows differ: {sorted(roster ^ rows)}")
    return {
        "formatVersion": 1,
        "match": common.MATCH,
        "source": {
            "dataset": "An integrated dataset of spatiotemporal and event data in elite soccer",
            "authors": "Bassek, Manuel; Rein, Robert; Weber, Hendrik; Memmert, Daniel (2025)",
            "doi": "10.6084/m9.figshare.28196177.v1",
            "licence": "CC BY 4.0",
            "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
            "notice": "Measures computed by Klupa from the 25 Hz optical tracking. Names are the short names of the public match information.",
        },
        "definitions": DEFINITIONS,
        "quality": {
            "excludedPlayerSeconds": round(sum(r["excluded"] for r in stats.values()) / common.FRAME_RATE, 1),
            "shareOfPlayerTime": round(
                sum(r["excluded"] for r in stats.values()) / sum(r["frames"] for r in stats.values()), 5
            ),
        },
        "players": players,
        "totals": totals,
    }


def main() -> None:
    result = build()
    path = geometry.TRACKING_DIR / f"{common.SHORT}.physical.json"
    path.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(path.name, json.dumps(result["totals"]))


if __name__ == "__main__":
    main()
