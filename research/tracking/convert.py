"""Convert the DFL optical tracking of one IDSSE match into the compact browser files.

The match is chosen with the environment variable KLUPA_MATCH (short id, default J03WN1);
the raw folder with KLUPA_RAW. The text below describes the first match, J03WN1; the other
six have the same structure (only the competition id in the file names differs).

Source: Bassek, Rein, Weber, Memmert (2025), CC BY 4.0, figshare 28196177, doi:10.6084/m9.figshare.28196177.v1.

Structure of the positions XML (all verified from the file; see common.py too)
- `PutDataRequest > Positions > MetaData(Type="pitch-size") > PitchSize X="105.00" Y="68.00"`
  (metres; the match information file says PitchX 105.00, PitchY 68.00).
- `Positions > FrameSet(GameSection, MatchId, TeamId, PersonId) > Frame*`: one FrameSet
  per tracked object per half. 58 FrameSets: 3 referees (TeamId "referee"), the ball
  (TeamId "BALL") and every player that was on the pitch (TeamId = club id).
- Halves: `GameSection` is "firstHalf" or "secondHalf". Frame numbers N are 10000..79287
  (first half) and 100000..172272 (second half), contiguous, 25 Hz (40 ms). `T` is a UTC
  timestamp; the file runs from about 2 s before kick-off to the end of the half.
- A player's FrameSet only contains the frames in which he was on the pitch, so a
  substitute's FrameSet starts late and a substituted or sent-off player's ends early.
- Units and origin: X, Y in metres, origin at the pitch centre, X along the 105 m length
  (observed -55.4..+55.5 incl. run-off), Y across the 68 m width (-38.1..+36.3).
- Ball FrameSet: extra attributes Z (height), BallPossession (1/2) and BallStatus
  (1 = alive / in play, 0 = dead). In play = BallStatus 1.
- Frame attributes D, S, A, M are provider distance, speed, acceleration and a flag; we
  only use S as a cross-check in measures.py.

Output: public/data/tracking/J03WN1.bin (+ .json). Period time zero is the event-clock
KickOff of each half (the same zero as src/data/dfl/DFL-MAT-J03WN1.json), so shot times
line up with positions. The 25 Hz data is linearly interpolated onto the grid
t = k / rate, k = 0.. (both neighbouring frames must exist, otherwise the player is
absent at that sample). Only side (home/away as in the event fixture: the smaller club
id is "home") and shirt number are written. No names, no person ids.

Binary layout (little-endian Int16, centimetres relative to the pitch centre):
  record(frame) = for column c in 0..columns-1: x_c, y_c           (2 * columns Int16)
  columns       = roster.length + 1; column c < roster.length is roster[c]; the last
                  column is the ball
  file          = period 1 frames, then period 2 frames, no header
  index         = ((startFrame + f) * columns + c) * 2 (+ 1 for y)
  absent        = sentinel (-32768) in both x and y
Run: research/.venv/Scripts/python.exe -I research/tracking/convert.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import common
import geometry

SENTINEL = -32768
RATE_HZ = 4
MARGIN_M = 5.0
SOURCE = {
    "dataset": "An integrated dataset of spatiotemporal and event data in elite soccer",
    "authors": "Bassek, Manuel; Rein, Robert; Weber, Hendrik; Memmert, Daniel (2025)",
    "paper": "https://doi.org/10.1038/s41597-025-04505-y",
    "doi": "10.6084/m9.figshare.28196177.v1",
    "licence": "CC BY 4.0",
    "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
    "notice": "Positions resampled and reduced to side and shirt number; no names or personal ids.",
}


def build_roster(halves: dict) -> list[dict]:
    keys = {(p["side"], p["shirt"]) for h in halves.values() for p in h["players"]}
    ordered = sorted(keys, key=lambda k: (k[0] != "home", k[1]))
    return [{"slot": i, "side": s, "shirt": n} for i, (s, n) in enumerate(ordered)]


def resample(half: dict, kick: float, rate: int, roster: list[dict]) -> dict:
    """Interpolate one half onto the kick-off-relative grid. Returns int16 + diagnostics."""
    slot = {(r["side"], r["shirt"]): r["slot"] for r in roster}
    frames = half["frames"]
    offset_ms = round((kick - half["t0"]) * 1000)
    count = int(np.floor((frames - 1 - offset_ms / 40.0) * rate / 25.0)) + 1
    k = np.arange(count)
    raw_u = offset_ms / 40.0 + k * 25.0 / rate
    # Tracking can start after the event kick-off (offset < 0 in six of the seven matches, by
    # up to 1.6 s). Samples before the first frame repeat the first frame (a hold, not an
    # extrapolation), so sample 0 always has players on the pitch, as the reader requires.
    held = int((raw_u < 0).sum())
    u = np.maximum(raw_u, 0.0)
    low = np.floor(u).astype(np.int64)
    frac = u - low
    high = np.minimum(low + 1, frames - 1)
    columns = len(roster) + 1
    out = np.full((count, columns, 2), SENTINEL, dtype=np.int16)

    def put(column: int, x: np.ndarray, y: np.ndarray) -> None:
        ax, ay, bx, by = x[low], y[low], x[high], y[high]
        exact = frac == 0
        ok = ~np.isnan(ax) & ~np.isnan(ay) & (exact | (~np.isnan(bx) & ~np.isnan(by)))
        px = np.where(exact, ax, ax + (bx - ax) * frac)
        py = np.where(exact, ay, ay + (by - ay) * frac)
        out[ok, column, 0] = np.rint(px[ok] * 100).astype(np.int16)
        out[ok, column, 1] = np.rint(py[ok] * 100).astype(np.int16)

    # jump[k, column]: a raw one-frame step above common.JUMP_MPS lies between samples k and k + 1.
    jump = np.zeros((count, columns), dtype=bool)
    first_raw, last_raw = low[:-1], np.minimum(np.ceil(u[1:]).astype(np.int64), frames - 1)
    for player in half["players"]:
        column = slot[(player["side"], player["shirt"])]
        put(column, player["x"], player["y"])
        step = np.hypot(np.diff(player["x"]), np.diff(player["y"])) * common.FRAME_RATE
        total = np.concatenate(([0], np.cumsum(np.nan_to_num(step) > common.JUMP_MPS)))
        jump[:-1, column] = total[last_raw] - total[first_raw] > 0
    put(columns - 1, half["ball"]["x"], half["ball"]["y"])
    alive = half["ball"]["status"][np.rint(u).astype(np.int64)] == 1
    return {
        "frames": out,
        "alive": alive,
        "jump": jump,
        "held": held,
        "startsAfterKickoffMs": max(0, -offset_ms),
    }


def runs(mask: np.ndarray) -> list[list[int]]:
    """[start, end) index pairs of consecutive True values."""
    edges = np.diff(np.concatenate(([0], mask.astype(np.int8), [0])))
    return [[int(a), int(b)] for a, b in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1))]


def raw_speed_outliers(halves: dict) -> dict:
    """How noisy was the raw 25 Hz data? Count one-frame speeds and provider speeds > 12 m/s."""
    steps = 0
    over_steps = 0
    worst = 0.0
    for half in halves.values():
        for p in half["players"]:
            d = np.hypot(np.diff(p["x"]), np.diff(p["y"])) * common.FRAME_RATE
            d = d[~np.isnan(d)]
            steps += d.size
            over_steps += int((d > 12).sum())
            worst = max(worst, float(d.max()))
    return {
        "playerFrameSteps": steps,
        "rawOneFrameSpeedAbove12": over_steps,
        "rawMaxOneFrameSpeed": round(worst, 2),
    }


def sanity(tracking: geometry.Tracking, alive: list[np.ndarray], jumps: list[np.ndarray], raw_stats: dict) -> dict:
    meta = tracking.meta
    length, width = tracking.pitch
    lim_x, lim_y = length / 2 + MARGIN_M, width / 2 + MARGIN_M
    xy = tracking.raw.astype(np.float64) / 100.0
    present = tracking.raw[:, :, 0] != SENTINEL
    outside = int(((np.abs(xy[:, :, 0]) > lim_x) | (np.abs(xy[:, :, 1]) > lim_y))[present].sum())
    ball_col = tracking.cols - 1
    results: dict = {"coordinatesOutsidePitchPlus5m": outside, "ballAlwaysPresent": bool(present[:, ball_col].all())}
    # Moving objects (players + ball) while the ball is in play.
    counts = present.sum(axis=1)
    play = np.concatenate(alive)
    in_play = counts[play]
    results["inPlayFrames"] = int(play.sum())
    results["objectsInPlayMin"] = int(in_play.min())
    results["objectsInPlayMax"] = int(in_play.max())
    results["objectsInPlayHistogram"] = {str(v): int((in_play == v).sum()) for v in np.unique(in_play)}
    results["objectsInPlayBetween20And23"] = bool(in_play.min() >= 20 and in_play.max() <= 23)
    # Speeds between consecutive resampled frames, players only.
    speeds: list[np.ndarray] = []
    unexplained = 0
    for info, jump in zip(meta["periods"], jumps):
        block = xy[info["startFrame"] : info["startFrame"] + info["frameCount"], : ball_col]
        ok = present[info["startFrame"] : info["startFrame"] + info["frameCount"], :ball_col]
        step = np.hypot(np.diff(block[:, :, 0], axis=0), np.diff(block[:, :, 1], axis=0)) * tracking.rate
        both = ok[1:] & ok[:-1]
        speeds.append(step[both])
        # A fast resampled step with no raw one-frame jump above common.JUMP_MPS between its two
        # samples would be a conversion error, not a tracking glitch.
        unexplained += int((both & (step > common.JUMP_MPS) & ~jump[:-1, :ball_col]).sum())
    all_speeds = np.concatenate(speeds)
    results["medianPlayerSpeedMps"] = round(float(np.median(all_speeds)), 3)
    results["maxResampledSpeedMps"] = round(float(all_speeds.max()), 3)
    results["resampledSpeedsAbove12"] = int((all_speeds > 12).sum())
    results["resampledSpeedsAbove12WithoutRawJump"] = unexplained
    results["rawOutliers"] = raw_stats
    results["periodMinutes"] = {str(p["period"]): round(p["durationSeconds"] / 60, 2) for p in meta["periods"]}
    results["keepers"] = {}
    results["attackDirection"] = {}
    for info in meta["periods"]:
        keepers = tracking.keepers(info["period"])
        direction = tracking.attack_direction(info["period"])
        results["keepers"][str(info["period"])] = {s: meta["roster"][i]["shirt"] for s, i in keepers.items()}
        results["attackDirection"][str(info["period"])] = {
            s: ("+x" if d > 0 else "-x") for s, d in direction.items()
        }
    d1, d2 = (tracking.attack_direction(p) for p in (1, 2))
    results["directionsFlip"] = all(d1[s] == -d2[s] for s in ("home", "away"))
    results["passes"] = bool(
        outside == 0
        and results["objectsInPlayBetween20And23"]
        and 1 <= results["medianPlayerSpeedMps"] <= 3
        and results["resampledSpeedsAbove12WithoutRawJump"] == 0
        and 40 <= min(p["durationSeconds"] for p in meta["periods"]) / 60 <= 55
        and 40 <= max(p["durationSeconds"] for p in meta["periods"]) / 60 <= 55
        and results["directionsFlip"]
    )
    return results


def main() -> None:
    full = common.load_full()
    length, width = full["pitch"]
    halves = full["halves"]
    kicks = common.kickoff_times()
    roster = build_roster(halves)
    columns = len(roster) + 1
    size_by_rate: dict[str, int] = {}
    for candidate in (5, 4):
        size_by_rate[str(candidate)] = sum(
            resample(halves[h], kicks[h], candidate, roster)["frames"].size for h in common.HALVES
        ) * 2
    rate = RATE_HZ  # every match ships at 4 Hz, the format of the first match
    blocks = [resample(halves[h], kicks[h], rate, roster) for h in common.HALVES]
    data = np.concatenate([b["frames"] for b in blocks], axis=0)
    payload = data.astype("<i2").tobytes()
    geometry.TRACKING_DIR.mkdir(parents=True, exist_ok=True)
    geometry.BIN.write_bytes(payload)
    start = 0
    periods = []
    for index, block in enumerate(blocks, start=1):
        count = block["frames"].shape[0]
        periods.append(
            {
                "period": index,
                "startFrame": start,
                "frameCount": count,
                "durationSeconds": round((count - 1) / rate, 3),
                "ballAliveRuns": runs(block["alive"]),
            }
        )
        start += count
    manifest = json.loads((common.ROOT / "data" / "MANIFEST.json").read_text(encoding="utf-8"))
    holds = [
        f"Period {i}: the first {b['held']} samples (0 s to {(b['held'] - 1) / rate:.2f} s) repeat the first tracked frame, "
        f"because tracking starts {b['startsAfterKickoffMs'] / 1000:.2f} s after the event kick-off."
        for i, b in enumerate(blocks, start=1)
        if b["held"] > 0
    ]
    meta = {
        "formatVersion": 1,
        "match": common.MATCH,
        "source": {**SOURCE, "notice": " ".join([SOURCE["notice"], *holds]), "sourceFiles": {
            k: manifest[k]["sha256"]
            for k in manifest
            if k.startswith(("DFL_04", "DFL_02", "DFL_03")) and k.endswith(f"_{common.MATCH}.xml")
        }},
        "pitch": {"lengthMetres": length, "widthMetres": width},
        "sampleRateHz": rate,
        "coordinateUnit": "centimetre",
        "sentinel": SENTINEL,
        "columns": columns,
        "ballColumn": columns - 1,
        "roster": roster,
        "periods": periods,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }
    geometry.META.write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    tracking = geometry.Tracking()
    checks = sanity(
        tracking, [b["alive"] for b in blocks], [b["jump"] for b in blocks], raw_speed_outliers(halves)
    )
    report = {
        "rateHz": rate,
        "bytesByRate": size_by_rate,
        "chosenReason": (
            "5 Hz would be %d bytes (> 3 MB aim)" % size_by_rate["5"]
            if size_by_rate["5"] > 3_000_000
            else "fixed at 4 Hz like the first match (5 Hz would be %d bytes)" % size_by_rate["5"]
        ),
        "binaryBytes": len(payload),
        "binarySha256": meta["sha256"],
        "roster": len(roster),
        "periods": [{k: v for k, v in p.items() if k != "ballAliveRuns"} for p in periods],
        "ballAliveRunCounts": [len(p["ballAliveRuns"]) for p in periods],
        "heldSamplesAtStart": [b["held"] for b in blocks],
        "trackingStartsAfterKickoffMs": [b["startsAfterKickoffMs"] for b in blocks],
        "checks": checks,
    }
    common.OUT.mkdir(exist_ok=True)
    common.out_path("tracking_convert").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=1))
    if not checks["passes"]:
        raise SystemExit("sanity checks failed")


if __name__ == "__main__":
    main()
