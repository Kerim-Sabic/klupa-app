"""Momentum-window study at scale on the open Wyscout matches, weighted by the Klupa xG model.

Run from the repository root (after research/xg/train.py has written src/data/models/xg.json):
    research/.venv/Scripts/python.exe research/momentum/scale_validation.py

Definitions (all from the brief; assumptions marked):
- Periods: first half (1H) and second half (2H) only. Extra time and shoot-outs are not analysed.
- Shots: open-play shots and free-kick shots weighted by the model as round-half-up(p * 10,000);
  penalties count as shots with a fixed weight of 7,600 units (ASSUMPTION); own goals are never
  shots and are excluded.
- Shot time t = whole seconds (floor of Wyscout eventSec). Grid: 0, 5, 10, ... up to the last
  event second of the half (floor of the largest eventSec of any event in that half).
- Window W at grid point g covers t in (g - W, g], reset each half. Signed sum = home - away,
  home = lexicographically smaller teamId as a string.
"""

from __future__ import annotations

import json
import math
import sys
from bisect import bisect_right
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "xg"))
import train  # noqa: E402  (shared data loading and feature code)

ROOT = train.ROOT
OUT = train.OUT
WINDOWS = (180, 300, 600)
GRID_STEP = 5
PENALTY_UNITS = 7600
PERIODS = {"1H": 1, "2H": 2}
PRIOR_STUDY = {"matches": 7, "gridPoints": None, "bothNonZero": 4318, "opposite": 1034, "pct": 23.9}


def sign(v: int) -> int:
    return (v > 0) - (v < 0)


def new_counts() -> dict[str, int]:
    return {"gridPoints": 0, "bothNonZero": 0, "opposite": 0, "agreement": 0, "robust": 0,
            "canReverse": 0, "tieOnly": 0, "halves": 0, "matches": 0, "shots": 0}


def half_counts(shots: list[tuple[int, str, int]], duration: int) -> dict[str, int]:
    """shots: (t, side, w) sorted by t. Returns this half's counts."""
    ts = [s[0] for s in shots]
    signed = [w if side == "home" else -w for _, side, w in shots]
    pref = [0]
    for v in signed:
        pref.append(pref[-1] + v)
    home_w = [w if side == "home" else 0 for _, side, w in shots]
    away_w = [w if side == "away" else 0 for _, side, w in shots]
    c = new_counts()
    for g in range(0, duration + 1, GRID_STEP):
        c["gridPoints"] += 1
        sums, largest = [], []
        hi = bisect_right(ts, g)
        for width in WINDOWS:
            lo = bisect_right(ts, g - width)
            s = pref[hi] - pref[lo]
            sums.append(s)
            if s > 0:
                largest.append(max(home_w[lo:hi]))
            elif s < 0:
                largest.append(max(away_w[lo:hi]))
            else:
                largest.append(0)
        s3, s10 = sign(sums[0]), sign(sums[2])
        if s3 != 0 and s10 != 0:
            c["bothNonZero"] += 1
            if s3 != s10:
                c["opposite"] += 1
        signs = {sign(s) for s in sums}
        if len(signs) == 1 and 0 not in signs:
            c["agreement"] += 1
            if all(abs(s) > m for s, m in zip(sums, largest)):
                c["robust"] += 1
            elif any(abs(s) < m for s, m in zip(sums, largest)):
                c["canReverse"] += 1
            else:
                c["tieOnly"] += 1
    return c


def naive_half_counts(shots: list[tuple[int, str, int]], duration: int) -> dict[str, int]:
    """Independent, deliberately plain re-implementation used only to cross-check half_counts."""
    c = new_counts()
    for g in range(0, duration + 1, GRID_STEP):
        c["gridPoints"] += 1
        sums, largest = [], []
        for width in WINDOWS:
            inside = [(side, w) for t, side, w in shots if g - width < t <= g]
            home = sum(w for side, w in inside if side == "home")
            away = sum(w for side, w in inside if side == "away")
            s = home - away
            sums.append(s)
            fav = [w for side, w in inside if (side == "home") == (s > 0)] if s != 0 else [0]
            largest.append(max(fav, default=0))
        if sums[0] != 0 and sums[2] != 0:
            c["bothNonZero"] += 1
            if (sums[0] > 0) != (sums[2] > 0):
                c["opposite"] += 1
        if all(s > 0 for s in sums) or all(s < 0 for s in sums):
            c["agreement"] += 1
            if all(abs(s) > m for s, m in zip(sums, largest)):
                c["robust"] += 1
            elif any(abs(s) < m for s, m in zip(sums, largest)):
                c["canReverse"] += 1
            else:
                c["tieOnly"] += 1
    return c


def add(into: dict[str, int], part: dict[str, int]) -> None:
    for k, v in part.items():
        into[k] += v


def pct(a: int, b: int) -> float | None:
    return None if b == 0 else 100.0 * a / b


def summarise(c: dict[str, int]) -> dict[str, object]:
    out: dict[str, object] = dict(c)
    out["opposedPct"] = pct(c["opposite"], c["bothNonZero"])
    out["agreementPct"] = pct(c["agreement"], c["gridPoints"])
    out["robustPctOfAgreement"] = pct(c["robust"], c["agreement"])
    out["canReversePctOfAgreement"] = pct(c["canReverse"], c["agreement"])
    out["tieOnlyPctOfAgreement"] = pct(c["tieOnly"], c["agreement"])
    return out


def match_spread(per_match: list[tuple[int, int, int]]) -> dict[str, object]:
    """How much the opposed-window percentage moves with the choice of matches (seeded)."""
    opp = np.array([m[0] for m in per_match], dtype=float)
    both = np.array([m[1] for m in per_match], dtype=float)
    pm = 100.0 * opp / both
    rng = np.random.default_rng(20261111)
    n = len(per_match)
    boot = rng.integers(0, n, size=(4000, n))
    boot_pct = 100.0 * opp[boot].sum(axis=1) / both[boot].sum(axis=1)
    subsets = np.array([rng.choice(n, size=7, replace=False) for _ in range(20000)])
    sub_pct = 100.0 * opp[subsets].sum(axis=1) / both[subsets].sum(axis=1)
    q = lambda a, *ps: [float(np.percentile(a, x)) for x in ps]  # noqa: E731
    return {
        "perMatchPct": {"min": float(pm.min()), "p05_p50_p95": q(pm, 5, 50, 95), "max": float(pm.max())},
        "bootstrapOverMatches95ci": q(boot_pct, 2.5, 97.5),
        "random7MatchSubsets": {"draws": 20000, "p02_5_p50_p97_5": q(sub_pct, 2.5, 50, 97.5),
                                "shareAtOrAbove23_9": float((sub_pct >= 23.9).mean())},
    }


def main() -> None:
    model = json.loads((ROOT / "src" / "data" / "models" / "xg.json").read_text(encoding="utf-8"))
    names, intercept, coefs = model["featureNames"], model["intercept"], model["coefficients"]
    shots_all, last_second, match_teams = train.load_all()
    shots = shots_all[shots_all["period"].isin(PERIODS) & (shots_all["own_goal"] == 0)].copy()
    is_pen = (shots["kind"] == "penalty").to_numpy()
    feats = train.shot_features(shots.x, shots.y, shots.header, (shots.kind == "freekick").astype(int))
    p = train.predict_raw(feats, names, intercept, coefs)
    units = np.floor(p * 10000 + 0.5).astype(int)  # same as Math.round for non-negative values
    shots["w"] = np.where(is_pen, PENALTY_UNITS, units)
    assert (shots["w"] >= 0).all()
    print("shots analysed:", len(shots), " penalties:", int(is_pen.sum()),
          " zero-weight shots:", int((shots["w"] == 0).sum()),
          " weight range (non-penalty):", int(shots.loc[~is_pen, "w"].min()), int(shots.loc[~is_pen, "w"].max()))

    by_half: dict[tuple[int, str], list[tuple[float, int, str, int]]] = defaultdict(list)
    comp_of: dict[int, str] = {}
    for row in shots.itertuples(index=False):
        teams = match_teams[row.match_id]
        assert row.team_id in teams, (row.match_id, row.team_id)
        side = "home" if row.team_id == teams[0] else "away"
        comp_of[row.match_id] = row.competition
        by_half[(row.match_id, row.period)].append((row.t, int(math.floor(row.t)), side, int(row.w)))
    # competition for matches without shots comes from the events; every match here has shots.
    assert set(comp_of) == set(match_teams), "some matches have no analysed shot"

    totals = new_counts()
    per_comp: dict[str, dict[str, int]] = {c: new_counts() for c in train.COMPETITIONS}
    export = []
    per_match: list[tuple[int, int, int]] = []  # (opposite, bothNonZero, gridPoints) per match
    check_ids = sorted(match_teams)[:: max(1, len(match_teams) // 25)]
    checked = 0
    for match_id in sorted(match_teams):
        comp = comp_of[match_id]
        halves = []
        c_match = new_counts()
        for period, number in PERIODS.items():
            duration = last_second[(match_id, period)]
            hs = sorted(((t, side, w) for _, t, side, w in by_half.get((match_id, period), [])),
                        key=lambda s: s[0])
            assert all(t <= duration for t, _, _ in hs)
            part = half_counts(hs, duration)
            if match_id in check_ids:
                assert part == naive_half_counts(hs, duration), (match_id, period)
                checked += 1
            part["halves"], part["shots"] = 1, len(hs)
            add(c_match, part)
            halves.append({"period": number, "durationSeconds": duration,
                           "shots": [{"t": t, "side": side, "w": w} for t, side, w in hs]})
        c_match["matches"] = 1
        add(totals, c_match)
        add(per_comp[comp], c_match)
        per_match.append((c_match["opposite"], c_match["bothNonZero"], c_match["gridPoints"]))
        export.append({"id": match_id, "competition": comp, "halves": halves})
    print(f"cross-checked {checked} halves against the naive implementation: identical")

    spread = match_spread(per_match)
    result = {
        "matchLevelSpread": spread,
        "assumptions": {
            "periods": "1H and 2H only (extra time and shoot-outs excluded)",
            "penaltyWeightUnits": PENALTY_UNITS,
            "ownGoals": "never shots; excluded",
            "shotTime": "floor of eventSec (whole seconds)",
            "gridEnd": "floor of the largest eventSec of any event in the half",
            "home": "lexicographically smaller teamId as a string",
            "weights": "round-half-up(model probability * 10000)",
            "windows": list(WINDOWS), "gridStepSeconds": GRID_STEP,
        },
        "priorStudy": PRIOR_STUDY,
        "total": summarise(totals),
        "byCompetition": {c: summarise(v) for c, v in per_comp.items()},
    }
    (OUT / "momentum_scale.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    (OUT / "wyscout_shots.json").write_text(json.dumps(export, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"\n{'competition':24s} {'matches':>7s} {'shots':>6s} {'grid':>8s} {'both!=0':>8s} {'opposite':>8s} {'opp%':>6s} "
          f"{'agree':>7s} {'robust':>7s} {'reverse':>7s} {'tie':>5s}")
    rows = list(per_comp.items()) + [("ALL", totals)]
    for name, c in rows:
        print(f"{name:24s} {c['matches']:7d} {c['shots']:6d} {c['gridPoints']:8d} {c['bothNonZero']:8d} "
              f"{c['opposite']:8d} {pct(c['opposite'], c['bothNonZero']):6.2f} {c['agreement']:7d} "
              f"{c['robust']:7d} {c['canReverse']:7d} {c['tieOnly']:5d}")
    a = totals
    print(f"\nTotal: opposed {a['opposite']} of {a['bothNonZero']} = {pct(a['opposite'], a['bothNonZero']):.2f}%")
    print(f"Agreement {a['agreement']} of {a['gridPoints']} = {pct(a['agreement'], a['gridPoints']):.2f}%; "
          f"robust {pct(a['robust'], a['agreement']):.2f}%, can reverse {pct(a['canReverse'], a['agreement']):.2f}%, "
          f"tie-only {pct(a['tieOnly'], a['agreement']):.2f}% of agreements")


if __name__ == "__main__":
    main()
