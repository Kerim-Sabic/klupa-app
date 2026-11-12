"""Train and evaluate the Klupa shot-quality (xG) model on the open Wyscout dataset.

Run from the repository root:  research/.venv/Scripts/python.exe research/xg/train.py
Everything printed or written comes from this run. Sanity checks are asserted.
"""

from __future__ import annotations

import json
import math
import os
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "research" / "data" / "raw"
OUT = ROOT / "research" / "out"
MODEL_PATH = ROOT / "src" / "data" / "models" / "xg.json"

# Verified against tags2name.csv and the event files (see verify_ids()).
TAG_GOAL, TAG_OWN_GOAL, TAG_LEFT, TAG_RIGHT, TAG_HEAD = 101, 102, 401, 402, 403
COMPETITIONS = [
    "England",
    "European_Championship",
    "France",
    "Germany",
    "Italy",
    "Spain",
    "World_Cup",
]
PITCH_LENGTH, PITCH_WIDTH, GOAL_WIDTH = 105.0, 68.0, 7.32
GOAL_FEATURES = ["distance", "angle", "isHeader", "isFreeKick"]


# --------------------------------------------------------------------------- data


def verify_ids() -> None:
    """Fail loudly if the tag table does not say what this script assumes."""
    tags = pd.read_csv(RAW / "tags2name.csv").set_index("Tag")["Label"]
    expected = {101: "Goal", 102: "own_goal", 401: "Left", 402: "Right", 403: "head/body"}
    for tag, label in expected.items():
        assert tags[tag] == label, f"tag {tag} is {tags[tag]!r}, expected {label!r}"


def load_all() -> tuple[pd.DataFrame, dict[tuple[int, str], int], dict[int, list[str]]]:
    """Return (shot table, last event second per (match, period), team ids per match).

    The shot table holds open-play shots, free-kick shots and penalties from every
    period; callers filter. Own-goal and goal tags are read only from shot events.
    """
    verify_ids()
    rows: list[dict[str, object]] = []
    last_second: dict[tuple[int, str], int] = {}
    match_teams: dict[int, list[str]] = {}
    with zipfile.ZipFile(RAW / "matches.zip") as zf:
        for comp in COMPETITIONS:
            for match in json.loads(zf.read(f"matches_{comp}.json")):
                match_teams[int(match["wyId"])] = sorted(str(t) for t in match["teamsData"])
    with zipfile.ZipFile(RAW / "events.zip") as zf:
        for comp in COMPETITIONS:
            events = json.loads(zf.read(f"events_{comp}.json"))
            for e in events:
                key = (e["matchId"], e["matchPeriod"])
                second = int(math.floor(e["eventSec"]))
                if second > last_second.get(key, -1):
                    last_second[key] = second
                name, sub = e["eventName"], e["subEventName"]
                if name == "Shot":
                    kind = "open"
                elif name == "Free Kick" and sub == "Free kick shot":
                    kind = "freekick"
                elif name == "Free Kick" and sub == "Penalty":
                    kind = "penalty"
                else:
                    continue
                ids = {t["id"] for t in e["tags"]}
                pos = e["positions"][0]
                rows.append(
                    {
                        "event_id": e["id"],
                        "match_id": e["matchId"],
                        "competition": comp,
                        "period": e["matchPeriod"],
                        "t": e["eventSec"],
                        "team_id": str(e["teamId"]),
                        "x": pos["x"],
                        "y": pos["y"],
                        "kind": kind,
                        "goal": int(TAG_GOAL in ids),
                        "own_goal": int(TAG_OWN_GOAL in ids),
                        "header": int(TAG_HEAD in ids),
                        "foot": int(TAG_LEFT in ids or TAG_RIGHT in ids),
                    }
                )
            del events
    return pd.DataFrame(rows), last_second, match_teams


# ----------------------------------------------------------------------- features


def shot_features(x: np.ndarray, y: np.ndarray, header: np.ndarray, free_kick: np.ndarray) -> pd.DataFrame:
    """Geometry in metres on a 105 x 68 pitch, attacking goal at x = 100."""
    dx = (100.0 - np.asarray(x, dtype=float)) * (PITCH_LENGTH / 100.0)
    dy = (50.0 - np.asarray(y, dtype=float)) * (PITCH_WIDTH / 100.0)
    distance = np.sqrt(dx * dx + dy * dy)
    half = GOAL_WIDTH / 2.0
    angle = np.clip(np.arctan2(GOAL_WIDTH * dx, dx * dx + dy * dy - half * half), 0.0, math.pi)
    return pd.DataFrame(
        {
            "distance": distance,
            "angle": angle,
            "isHeader": np.asarray(header, dtype=float),
            "isFreeKick": np.asarray(free_kick, dtype=float),
            "distanceAngle": distance * angle,
            "distanceSquared": distance * distance,
        }
    )


def predict_raw(feats: pd.DataFrame, names: list[str], intercept: float, coefs: list[float]) -> np.ndarray:
    z = intercept + feats[names].to_numpy(dtype=float) @ np.asarray(coefs, dtype=float)
    return 1.0 / (1.0 + np.exp(-z))


# ------------------------------------------------------------------------- model


def fit(feats: pd.DataFrame, y: np.ndarray, names: list[str]) -> tuple[float, list[float]]:
    """Unpenalised logistic regression on standardised inputs, mapped back to raw units."""
    x = feats[names].to_numpy(dtype=float)
    scaler = StandardScaler().fit(x)
    model = LogisticRegression(C=np.inf, solver="lbfgs", max_iter=10000, tol=1e-10)
    model.fit(scaler.transform(x), y)
    assert model.n_iter_[0] < 10000, "logistic regression did not converge"
    coef = model.coef_[0] / scaler.scale_
    intercept = float(model.intercept_[0] - np.sum(model.coef_[0] * scaler.mean_ / scaler.scale_))
    return intercept, [float(c) for c in coef]


def centre_line_probabilities(names: list[str], intercept: float, coefs: list[float]) -> tuple[np.ndarray, np.ndarray]:
    xs = np.linspace(0.0, 99.99, 2000)  # whole pitch length, y = 50, approaching the goal
    f = shot_features(xs, np.full_like(xs, 50.0), np.zeros_like(xs), np.zeros_like(xs))
    return xs, predict_raw(f, names, intercept, coefs)


def monotone_break(names: list[str], intercept: float, coefs: list[float]) -> float | None:
    """First x (percent) at which probability stops rising towards the goal at y = 50, else None."""
    xs, p = centre_line_probabilities(names, intercept, coefs)
    bad = np.where(np.diff(p) <= 0)[0]
    return None if len(bad) == 0 else float(xs[bad[0]])


def ece(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    return reliability(y, p, bins)["ece"]


def reliability(y: np.ndarray, p: np.ndarray, bins: int = 10) -> dict[str, object]:
    order = np.argsort(p, kind="stable")
    table = []
    total = 0.0
    for chunk in np.array_split(order, bins):
        mean_p, rate = float(p[chunk].mean()), float(y[chunk].mean())
        total += len(chunk) / len(y) * abs(mean_p - rate)
        table.append(
            {"n": int(len(chunk)), "meanPredicted": mean_p, "observedRate": rate,
             "minP": float(p[chunk].min()), "maxP": float(p[chunk].max())}
        )
    return {"ece": total, "bins": table}


def metrics(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    return {
        "logLoss": float(log_loss(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "auc": float(roc_auc_score(y, p)),
        "ece": float(ece(y, p)),
    }


def cv_predictions(
    feats: pd.DataFrame, y: np.ndarray, names: list[str], folds: list[tuple[np.ndarray, np.ndarray]]
) -> tuple[np.ndarray, np.ndarray]:
    """Out-of-fold model probabilities and out-of-fold base-rate probabilities."""
    model_p = np.zeros(len(y))
    base_p = np.zeros(len(y))
    for train, test in folds:
        b, c = fit(feats.iloc[train], y[train], names)
        model_p[test] = predict_raw(feats.iloc[test], names, b, c)
        base_p[test] = y[train].mean()
    return model_p, base_p


def per_fold_logloss(y: np.ndarray, p: np.ndarray, folds: list[tuple[np.ndarray, np.ndarray]]) -> list[float]:
    return [float(log_loss(y[test], p[test], labels=[0, 1])) for _, test in folds]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    shots, _, _ = load_all()
    print("== Shot-like events found, by kind and period (before exclusions) ==")
    print(shots.groupby(["kind", "period"]).size().to_string())
    print("duplicate event ids among shots:", int(shots["event_id"].duplicated().sum()))
    print("own-goal tag on a shot event:", int(shots["own_goal"].sum()))
    print("shots with neither foot nor head tag:", int(((shots.header == 0) & (shots.foot == 0)).sum()))
    print("shots with both foot and head tag:", int(((shots.header == 1) & (shots.foot == 1)).sum()))
    print("x histogram of non-penalty shots (decile of pitch length):")
    npk = shots[shots.kind != "penalty"]
    print(np.histogram(npk.x, bins=range(0, 101, 10))[0].tolist(), "(last bin includes x = 100 via separate count)")
    print("mean x:", float(npk.x.mean()), " share with x >= 70:", float((npk.x >= 70).mean()))

    train_set = shots[(shots.kind != "penalty") & (shots.own_goal == 0) & (shots.period != "P")].reset_index(drop=True)
    n_shots, n_goals = len(train_set), int(train_set.goal.sum())
    n_matches = int(train_set.match_id.nunique())
    rate = n_goals / n_shots
    print(f"\nTraining shots: {n_shots}  goals: {n_goals}  rate: {rate:.4f}  matches with a shot: {n_matches}")
    print(train_set.groupby("kind").agg(shots=("goal", "size"), goals=("goal", "sum")).to_string())
    assert 35_000 <= n_shots <= 50_000, n_shots
    assert 0.08 <= rate <= 0.13, rate

    y = train_set["goal"].to_numpy()
    feats = shot_features(train_set.x, train_set.y, train_set.header, (train_set.kind == "freekick").astype(int))
    groups = train_set["match_id"].to_numpy()
    folds = list(GroupKFold(n_splits=5, shuffle=True, random_state=20261111).split(feats, y, groups))

    # --- feature-set comparison (grouped CV log loss, pooled out-of-fold) -------
    candidates = {
        "base": GOAL_FEATURES,
        "base+distance*angle": GOAL_FEATURES + ["distanceAngle"],
        "base+distance^2": GOAL_FEATURES + ["distanceSquared"],
        "base+both": GOAL_FEATURES + ["distanceAngle", "distanceSquared"],
    }
    tried = {}
    for label, names in candidates.items():
        p, _ = cv_predictions(feats, y, names, folds)
        tried[label] = float(log_loss(y, p))
    print("\n== Feature sets, grouped 5-fold CV log loss ==")
    for label, value in tried.items():
        print(f"{label:24s} {value:.6f}")
    # Pre-declared rule: greedy forward selection. An extra term is adopted only if it lowers
    # grouped-CV log loss by at least 0.0005 AND the model refitted with it still has probability
    # rising monotonically towards the goal along y = 50 over the whole pitch (a shot-quality
    # index that rewards shooting from the halfway line is not usable, whatever its CV score).
    chosen_names = list(GOAL_FEATURES)
    current = tried["base"]
    chosen = "base"
    remaining = ["distanceAngle", "distanceSquared"]
    greedy_log = []
    while remaining:
        scores = {}
        for term in remaining:
            p, _ = cv_predictions(feats, y, chosen_names + [term], folds)
            scores[term] = float(log_loss(y, p))
        term = min(scores, key=lambda k: scores[k])
        entry = {"tried": scores, "current": current, "best": term}
        greedy_log.append(entry)
        if current - scores[term] < 0.0005:
            entry["decision"] = "rejected: gain below 0.0005"
            break
        b_try, c_try = fit(feats, y, chosen_names + [term])
        first_break = monotone_break(chosen_names + [term], b_try, c_try)
        if first_break is not None:
            entry["decision"] = f"rejected: probability stops rising with proximity at x = {first_break:.2f} (y = 50)"
            break
        entry["decision"] = "adopted"
        chosen_names.append(term)
        current = scores[term]
        chosen = "base+" + "+".join(chosen_names[len(GOAL_FEATURES):])
        remaining.remove(term)
    print("greedy steps:")
    for entry in greedy_log:
        print(" ", entry)
    names = chosen_names
    print("adopted feature set:", chosen, names)

    # --- grouped CV by match ------------------------------------------------------
    p_cv, base_cv = cv_predictions(feats, y, names, folds)
    cv_model, cv_base = metrics(y, p_cv), metrics(y, base_cv)
    cv_folds = per_fold_logloss(y, p_cv, folds)
    rel = reliability(y, p_cv)

    # --- leave-one-competition-out ----------------------------------------------------
    comps = train_set["competition"].to_numpy()
    loco_folds = [
        (np.where(comps != c)[0], np.where(comps == c)[0]) for c in COMPETITIONS
    ]
    p_loco, base_loco = cv_predictions(feats, y, names, loco_folds)
    loco_model, loco_base = metrics(y, p_loco), metrics(y, base_loco)
    loco_by_comp = {}
    for c, (_, test) in zip(COMPETITIONS, loco_folds):
        loco_by_comp[c] = {
            "n": int(len(test)), "goals": int(y[test].sum()),
            "model": metrics(y[test], p_loco[test]), "baseline": metrics(y[test], base_loco[test]),
        }

    def show(title: str, a: dict[str, float], b: dict[str, float]) -> None:
        print(f"\n== {title} ==")
        print(f"{'':10s} {'logLoss':>9s} {'Brier':>9s} {'AUC':>8s} {'ECE':>8s}")
        for tag, m in (("model", a), ("baseline", b)):
            print(f"{tag:10s} {m['logLoss']:9.5f} {m['brier']:9.5f} {m['auc']:8.4f} {m['ece']:8.5f}")

    show("GroupKFold by match (5 folds, pooled out-of-fold)", cv_model, cv_base)
    print("per-fold log loss:", [round(v, 5) for v in cv_folds])
    show("Leave-one-competition-out (pooled)", loco_model, loco_base)
    for c, r in loco_by_comp.items():
        print(f"  {c:22s} n={r['n']:6d} goals={r['goals']:5d} model LL={r['model']['logLoss']:.5f} "
              f"base LL={r['baseline']['logLoss']:.5f} AUC={r['model']['auc']:.4f}")
    print("\n== Reliability (grouped CV out-of-fold, 10 equal-count bins) ==")
    print(f"{'bin':>3s} {'n':>6s} {'mean pred':>10s} {'observed':>9s}")
    for i, b in enumerate(rel["bins"], 1):
        print(f"{i:3d} {b['n']:6d} {b['meanPredicted']:10.4f} {b['observedRate']:9.4f}")

    # --- final fit and sanity checks ---------------------------------------------------------
    intercept, coefs = fit(feats, y, names)
    sk_check = predict_raw(feats, names, intercept, coefs)
    final_ll = float(log_loss(y, sk_check))
    print(f"\nFinal model on all data: intercept={intercept!r}")
    for n, c in zip(names, coefs):
        print(f"  {n:14s} {c!r}")
    print("in-sample log loss (not a performance claim):", final_ll)

    def prob(x: float, yy: float, header: int = 0, free_kick: int = 0) -> float:
        f = shot_features(np.array([x]), np.array([yy]), np.array([header]), np.array([free_kick]))
        return float(predict_raw(f, names, intercept, coefs)[0])

    penalty_spot = prob(89.5, 50)
    xs, along_arr = centre_line_probabilities(names, intercept, coefs)
    along = [float(v) for v in along_arr]
    print(f"p(penalty spot, x=89.5, y=50, foot, open play) = {penalty_spot:.4f}")
    assert cv_model["logLoss"] < cv_base["logLoss"], "model must beat base rate"
    assert 0.26 <= cv_model["logLoss"] <= 0.31, cv_model["logLoss"]
    assert 0.15 <= penalty_spot <= 0.45, penalty_spot
    assert all(a < b for a, b in zip(along, along[1:])), "probability must rise as x approaches the goal at y=50"
    assert 0.0 < min(along) and max(along) < 1.0
    # Check the lbfgs optimum: the score equations are ~0 at the fitted raw coefficients.
    design = np.column_stack([np.ones(len(y)), feats[names].to_numpy(dtype=float)])
    score = design.T @ (y - sk_check) / len(y)
    print("max |score| at optimum (per observation, raw units):", float(np.abs(score).max()))

    golden = write_golden(names, intercept, coefs)
    result = {
        "shotKinds": {k: int(v) for k, v in shots.groupby("kind").size().items()},
        "nShots": n_shots, "nGoals": n_goals, "goalRate": rate, "nMatches": n_matches,
        "featureSetsCvLogLoss": tried, "adoptedFeatureSet": chosen, "featureSelection": greedy_log,
        "groupedCv": {"model": cv_model, "baseline": cv_base, "perFoldLogLoss": cv_folds},
        "leaveOneCompetitionOut": {"model": loco_model, "baseline": loco_base, "byCompetition": loco_by_comp},
        "reliabilityGroupedCv": rel,
        "finalModel": {"featureNames": names, "intercept": intercept, "coefficients": coefs},
        "penaltySpotProbability": penalty_spot,
        "goldenCases": golden,
    }
    (OUT / "xg_cv.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")

    export = {
        "name": "klupa-xg-logistic-v1",
        "featureNames": names,
        "intercept": intercept,
        "coefficients": coefs,
        "pitch": {"lengthM": PITCH_LENGTH, "widthM": PITCH_WIDTH, "goalWidthM": GOAL_WIDTH},
        "geometry": "x,y are Wyscout percentages; attacking goal at x = 100; dx=(100-x)*1.05, dy=(50-y)*0.68",
        "training": {
            "nShots": n_shots, "nGoals": n_goals, "nMatches": n_matches,
            "competitions": COMPETITIONS,
            "exclusions": "penalties, own goals, penalty shoot-outs",
            "groupedCv5Fold": {"model": cv_model, "baseline": cv_base},
            "leaveOneCompetitionOut": {"model": loco_model, "baseline": loco_base},
        },
        "attribution": "Pappalardo, Luca; Massucco, Emanuele (2019). Soccer match event dataset. figshare. Collection. "
        "https://doi.org/10.6084/m9.figshare.c.4415000.v5 (Wyscout open data; companion paper: Pappalardo et al., Scientific Data, 2019).",
        "licence": "CC BY 4.0 (data); model coefficients derived from it",
        "caveat": "Trained on men's professional shots; no published study tests transfer to youth football; "
        "treat as a shot-quality index for youth teams, not a probability.",
    }
    MODEL_PATH.write_text(json.dumps(export, indent=2) + "\n", encoding="utf-8")
    print("wrote", MODEL_PATH, "and", OUT / "xg_cv.json")


def write_golden(names: list[str], intercept: float, coefs: list[float]) -> int:
    rng = np.random.default_rng(20261111)
    fixed = [(89.5, 50), (100, 50), (100, 0), (100, 100), (0, 0), (0, 50), (99.9, 50), (50, 50),
             (94, 35), (94, 65), (85, 10), (85, 90), (70, 50), (60, 20), (97, 48)]
    cases = [{"x": float(a), "y": float(b), "header": i % 3 == 0, "freeKick": False}
             for i, (a, b) in enumerate(fixed)]
    while len(cases) < 60:
        i = len(cases)
        cases.append({
            "x": round(float(rng.uniform(45, 100)), 3), "y": round(float(rng.uniform(0, 100)), 3),
            "header": bool(rng.random() < 0.15), "freeKick": bool(rng.random() < 0.08),
        })
    cases[3]["freeKick"] = True
    cases[10]["freeKick"] = True
    f = shot_features(
        np.array([c["x"] for c in cases]), np.array([c["y"] for c in cases]),
        np.array([int(c["header"]) for c in cases]), np.array([int(c["freeKick"]) for c in cases]),
    )
    p = predict_raw(f, names, intercept, coefs)
    for c, v in zip(cases, p):
        c["probability"] = float(v)
        c["units"] = int(math.floor(float(v) * 10000 + 0.5))  # same as Math.round for v >= 0
    (OUT / "xg_golden.json").write_text(json.dumps({"cases": cases}, indent=1) + "\n", encoding="utf-8")
    return len(cases)


if __name__ == "__main__":
    os.environ.setdefault("PYTHONHASHSEED", "0")
    main()
    sys.exit(0)
