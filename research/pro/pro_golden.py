"""Reference numbers: golden values from the raw events, and the same numbers recomputed from compact events."""

from __future__ import annotations

import math
import sys
from collections import Counter
from typing import Any

import numpy as np

from pro_common import (
    DROPPED_EVENTS,
    F_ACCURATE,
    F_CORNER,
    F_FREE_KICK,
    F_GOAL,
    F_HEADER,
    F_OWN_GOAL,
    F_PENALTY,
    KIND_PASS,
    KIND_SHOT,
    PASS_NETWORK_MIN,
    PASS_NETWORK_WINDOW_SECONDS,
    PENALTY_UNITS,
    PERIODS,
    ROOT,
    T_ACCURATE,
    T_GOAL,
    T_HEAD,
    T_OWN_GOAL,
    fail,
)

sys.path.insert(0, str(ROOT / "research" / "xg"))
import train  # noqa: E402  (shared shot geometry and model code)


def shot_units(xs: list[int], ys: list[int], header: list[int], fk: list[int], pen: list[bool],
               model: dict[str, Any]) -> list[int]:
    """Klupa chance quality in 1/10,000, round half up per shot; penalty fixed at 7,600."""
    if not xs:
        return []
    feats = train.shot_features(np.array(xs), np.array(ys), np.array(header), np.array(fk))
    p = train.predict_raw(feats, model["featureNames"], model["intercept"], model["coefficients"])
    units = np.floor(p * 10000 + 0.5).astype(int)
    return [PENALTY_UNITS if is_pen else int(u) for u, is_pen in zip(units, pen)]


def golden_from_raw(match: dict[str, Any], raw_events: list[dict[str, Any]], names: dict[int, str],
                    side_of: dict[int, int], model: dict[str, Any]) -> dict[str, Any]:
    """Reference numbers straight from the provider's events (no use of the compact encoding)."""
    passes, accurate = [0, 0], [0, 0]
    shots, on_target, goals, own_for, corners, xg = [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]
    n_events = 0
    sx, sy, sh, sf, sp, st = [], [], [], [], [], []
    for e in raw_events:
        if e["matchPeriod"] not in PERIODS:
            continue
        if e["eventName"] in DROPPED_EVENTS:
            if any(int(t["id"]) == T_OWN_GOAL for t in e["tags"]):
                fail(f"own goal on a dropped event {e['id']}")
            continue
        n_events += 1
        s = side_of[int(e["teamId"])]
        tags = {int(t["id"]) for t in e["tags"]}
        name, sub = e["eventName"], e["subEventName"]
        if name == "Pass":
            passes[s] += 1
            accurate[s] += int(T_ACCURATE in tags)
        is_shot = name == "Shot" or (name == "Free Kick" and sub in ("Free kick shot", "Penalty"))
        if is_shot:
            shots[s] += 1
            on_target[s] += int(T_ACCURATE in tags)
            goals[s] += int(T_GOAL in tags)
            pos = e["positions"][0]
            sx.append(int(pos["x"]))
            sy.append(int(pos["y"]))
            sh.append(int(T_HEAD in tags))
            sf.append(int(sub == "Free kick shot"))
            sp.append(sub == "Penalty")
            st.append(s)
        if name == "Free Kick" and sub == "Corner":
            corners[s] += 1
        if T_OWN_GOAL in tags:
            own_for[1 - s] += 1
    for s, u in zip(st, shot_units(sx, sy, sh, sf, sp, model)):
        xg[s] += u
    return {"events": n_events, "passes": passes, "accuratePasses": accurate, "shots": shots,
            "shotsOnTarget": on_target, "goals": goals, "ownGoalsFor": own_for, "corners": corners,
            "xgUnits": xg}


def pass_network_from_raw(raw_events: list[dict[str, Any]], names: dict[int, str], side_of: dict[int, int],
                          team: int) -> list[list[Any]]:
    kept = [e for e in raw_events if e["matchPeriod"] in PERIODS and e["eventName"] not in DROPPED_EVENTS]
    kept.sort(key=lambda e: (PERIODS[e["matchPeriod"]], int(math.floor(e["eventSec"])), int(e["id"])))
    counts: Counter[tuple[str, str]] = Counter()
    for cur, nxt in zip(kept, kept[1:]):
        if cur["eventName"] != "Pass" or side_of[int(cur["teamId"])] != team:
            continue
        if not any(int(t["id"]) == T_ACCURATE for t in cur["tags"]):
            continue
        if nxt["matchPeriod"] != cur["matchPeriod"] or side_of[int(nxt["teamId"])] != team:
            continue
        if int(math.floor(nxt["eventSec"])) - int(math.floor(cur["eventSec"])) > PASS_NETWORK_WINDOW_SECONDS:
            continue
        a, b = int(cur["playerId"]), int(nxt["playerId"])
        if a == 0 or b == 0 or a == b:
            continue
        counts[(names[a], names[b])] += 1
    edges = [[a, b, n] for (a, b), n in counts.items() if n >= PASS_NETWORK_MIN]
    edges.sort(key=lambda r: (-r[2], r[0], r[1]))
    return edges


def recompute_from_compact(doc: dict[str, Any], model: dict[str, Any]) -> dict[str, Any]:
    passes, accurate = [0, 0], [0, 0]
    shots, on_target, goals, own_for, corners, xg = [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]
    sx, sy, sh, sf, sp, st = [], [], [], [], [], []
    for period, t, team, player, kind, x, y, x2, y2, flags in doc["events"]:
        if kind == KIND_PASS:
            passes[team] += 1
            accurate[team] += flags & F_ACCURATE
        if kind == KIND_SHOT:
            shots[team] += 1
            on_target[team] += flags & F_ACCURATE
            goals[team] += (flags & F_GOAL) >> 1
            sx.append(x)
            sy.append(y)
            sh.append((flags & F_HEADER) >> 2)
            sf.append((flags & F_FREE_KICK) >> 3)
            sp.append(bool(flags & F_PENALTY))
            st.append(team)
        if flags & F_CORNER:
            corners[team] += 1
        if flags & F_OWN_GOAL:
            own_for[1 - team] += 1
    for s, u in zip(st, shot_units(sx, sy, sh, sf, sp, model)):
        xg[s] += u
    return {"events": len(doc["events"]), "passes": passes, "accuratePasses": accurate, "shots": shots,
            "shotsOnTarget": on_target, "goals": goals, "ownGoalsFor": own_for, "corners": corners,
            "xgUnits": xg}


def network_from_compact(doc: dict[str, Any], team: int) -> list[list[Any]]:
    events = doc["events"]  # already sorted
    names = [p["name"] for p in doc["players"]]
    counts: Counter[tuple[str, str]] = Counter()
    for cur, nxt in zip(events, events[1:]):
        if cur[4] != KIND_PASS or cur[2] != team or not cur[9] & F_ACCURATE:
            continue
        if nxt[0] != cur[0] or nxt[2] != team or nxt[1] - cur[1] > PASS_NETWORK_WINDOW_SECONDS:
            continue
        if cur[3] < 0 or nxt[3] < 0 or cur[3] == nxt[3]:
            continue
        counts[(names[cur[3]], names[nxt[3]])] += 1
    edges = [[a, b, n] for (a, b), n in counts.items() if n >= PASS_NETWORK_MIN]
    edges.sort(key=lambda r: (-r[2], r[0], r[1]))
    return edges
