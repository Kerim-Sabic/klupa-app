"""Shared parsing and loading for the DFL tracking scripts.

Positions XML structure (verified from the file, see also convert.py):
  PutDataRequest > Positions > MetaData(Type="pitch-size") > PitchSize X,Y (metres)
  Positions > FrameSet(GameSection, MatchId, TeamId, PersonId) > Frame*
  One FrameSet per object per half. TeamId is a club id for players, "referee" for
  officials and "BALL" for the ball. A player's FrameSet only holds the frames while
  that player is on the pitch (substitutes start late, substituted players end early).
  Frame attributes: N (frame number, 25 Hz, contiguous), T (UTC timestamp), X, Y
  (metres, origin at the pitch centre, x along the length, y across), D, S, A, M
  (provider distance, speed, acceleration and a flag we do not use). The ball
  FrameSet also has Z (height), BallPossession (1 home, 2 guest) and BallStatus
  (1 alive, 0 dead).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = Path(os.environ.get("KLUPA_RAW", ROOT / "data" / "raw"))
CACHE_DIR = Path(os.environ.get("KLUPA_CACHE_DIR", RAW))
OUT = ROOT / "out"
REPO = ROOT.parent
LEGACY_SHORT = "J03WN1"  # the first converted match keeps its original output file names
SHORT = os.environ.get("KLUPA_MATCH", LEGACY_SHORT)
MATCH = f"DFL-MAT-{SHORT}"


def _raw(prefix: str) -> Path:
    """The one raw file of this match with the given prefix (the competition id varies)."""
    found = sorted(RAW.glob(f"{prefix}_DFL-COM-*_{MATCH}.xml"))
    if len(found) != 1:
        raise FileNotFoundError(f"expected one {prefix} file for {MATCH} in {RAW}, found {len(found)}")
    return found[0]


POSITIONS = _raw("DFL_04_03_positions_raw_observed")
MATCHINFO = _raw("DFL_02_01_matchinformation")
EVENTS = _raw("DFL_03_02_events_raw")
CACHE_NAME = "tracking_full_cache.npz" if SHORT == LEGACY_SHORT else f"tracking_full_cache_{SHORT}.npz"
CACHE = CACHE_DIR / CACHE_NAME
if SHORT == LEGACY_SHORT and not CACHE.exists() and (RAW / CACHE_NAME).exists():
    CACHE = RAW / CACHE_NAME  # the first match's cache already lives in the raw folder
FIXTURE = REPO / "src" / "data" / "dfl" / f"{MATCH}.json"


def out_path(stem: str) -> Path:
    """research/out/<stem>.json; matches other than the first get a _<short id> suffix."""
    return OUT / (f"{stem}.json" if SHORT == LEGACY_SHORT else f"{stem}_{SHORT}.json")


HALVES = ("firstHalf", "secondHalf")
FRAME_RATE = 25
JUMP_MPS = 12.0  # no footballer reaches this speed: a faster step between two frames is a tracking jump


def parse_time(text: str) -> float:
    """ISO timestamp with offset -> seconds since the Unix epoch (float)."""
    return datetime.fromisoformat(text).astimezone(timezone.utc).timestamp()


def side_labels(events: Path | None = None) -> dict[str, str]:
    """Club id -> 'home'/'away' exactly as scripts/research/dfl_to_fixture.py does it:
    the lexicographically smaller club id is 'home' (NOT the DFL home team)."""
    root = ET.parse(events or EVENTS).getroot()
    for event in root.findall("Event"):
        node = event.find("KickOff")
        if node is not None and node.get("GameSection") == "firstHalf":
            teams = {node.attrib["TeamLeft"], node.attrib["TeamRight"]}
            return {team: ("home" if team == min(teams) else "away") for team in teams}
    raise ValueError("no first-half kick-off")


def kickoff_times() -> dict[str, float]:
    """Event-clock kick-off instants (UTC seconds) per half: the t=0 of the event fixture."""
    out: dict[str, float] = {}
    root = ET.parse(EVENTS).getroot()
    for event in root.findall("Event"):
        if event.find("Delete") is not None:
            continue
        for child in event:
            half = child.get("GameSection")
            if child.tag == "KickOff" and half in HALVES:
                out[half] = parse_time(event.attrib["EventTime"])
    return out


def read_match_info(path: Path | None = None) -> dict:
    """General facts and the two squads from a match information file.

    Returns {'general': {...attributes...}, 'teams': {club id: {'name', 'role', 'players':
    {person id: {'shirt': int, 'short': str}}}}}. Names are read here only for the
    physical-measures files; the binary tracking files never carry them.
    """
    root = ET.parse(path or MATCHINFO).getroot()
    teams = {}
    for team in root.iter("Team"):
        teams[team.attrib["TeamId"]] = {
            "name": team.attrib["TeamName"],
            "role": team.attrib["Role"],
            "players": {
                p.attrib["PersonId"]: {"shirt": int(p.attrib["ShirtNumber"]), "short": p.attrib["Shortname"]}
                for p in team.iter("Player")
            },
        }
    return {"general": dict(root.find("MatchInformation/General").attrib), "teams": teams}


def shirt_numbers() -> dict[str, int]:
    """PersonId -> shirt number, read from the match information (names are never kept)."""
    root = ET.parse(MATCHINFO).getroot()
    return {p.attrib["PersonId"]: int(p.attrib["ShirtNumber"]) for p in root.iter("Player")}


def parse_positions() -> dict:
    """Stream the large XML once, returning compact per-object arrays."""
    sets: list[dict] = []
    pitch = (0.0, 0.0)
    for _event, el in ET.iterparse(POSITIONS, events=("end",)):
        if el.tag == "PitchSize":
            pitch = (float(el.attrib["X"]), float(el.attrib["Y"]))
        elif el.tag == "FrameSet":
            frames = el.findall("Frame")
            item = {
                "half": el.attrib["GameSection"],
                "team": el.attrib["TeamId"],
                "person": el.attrib["PersonId"],
                "n": np.array([int(f.attrib["N"]) for f in frames], dtype=np.int64),
                "t": np.array([parse_time(frames[0].attrib["T"]), parse_time(frames[-1].attrib["T"])]),
                "x": np.array([float(f.attrib["X"]) for f in frames]),
                "y": np.array([float(f.attrib["Y"]) for f in frames]),
                "s": np.array([float(f.attrib["S"]) for f in frames]),
            }
            if el.attrib["TeamId"] == "BALL":
                item["z"] = np.array([float(f.attrib["Z"]) for f in frames])
                item["status"] = np.array([int(f.attrib["BallStatus"]) for f in frames], dtype=np.int8)
                item["poss"] = np.array([int(f.attrib["BallPossession"]) for f in frames], dtype=np.int8)
            sets.append(item)
            el.clear()
    return {"pitch": pitch, "sets": sets}


def _expand(s: dict, n0: int, frames: int) -> dict:
    idx = s["n"] - n0
    if len(np.unique(idx)) != len(idx) or (np.diff(idx) != 1).any():
        raise ValueError(f"non-contiguous frames for {s['person']} {s['half']}")
    span = float(s["t"][1] - s["t"][0])
    if abs(span - (int(s["n"][-1]) - int(s["n"][0])) / FRAME_RATE) > 0.002:
        raise ValueError(f"timestamps do not follow 25 Hz for {s['person']} {s['half']}")
    full = {k: np.full(frames, np.nan) for k in ("x", "y", "s")}
    for k in full:
        full[k][idx] = s[k]
    return full


def _build_halves(parsed: dict) -> dict[str, dict]:
    side = side_labels()
    shirts = shirt_numbers()
    halves: dict[str, dict] = {}
    for half in HALVES:
        sets = [s for s in parsed["sets"] if s["half"] == half]
        n0 = min(int(s["n"][0]) for s in sets)
        n1 = max(int(s["n"][-1]) for s in sets)
        frames = n1 - n0 + 1
        t0 = min(float(s["t"][0]) - (int(s["n"][0]) - n0) / FRAME_RATE for s in sets)
        players = []
        ball = None
        for s in sets:
            if s["team"] == "referee":
                continue
            full = _expand(s, n0, frames)
            if s["team"] == "BALL":
                z = np.full(frames, np.nan)
                z[s["n"] - n0] = s["z"]
                status = np.full(frames, -1, dtype=np.int8)
                status[s["n"] - n0] = s["status"]
                poss = np.full(frames, -1, dtype=np.int8)
                poss[s["n"] - n0] = s["poss"]
                ball = {**full, "z": z, "status": status, "poss": poss}
            else:
                players.append(
                    {"side": side[s["team"]], "shirt": shirts[s["person"]], "person": s["person"], **full}
                )
        players.sort(key=lambda p: (p["side"] != "home", p["shirt"]))
        halves[half] = {"n0": n0, "frames": frames, "t0": t0, "players": players, "ball": ball}
    return halves


def load_full() -> dict:
    """Full-rate (25 Hz) matrices per half, cached in the git-ignored raw folder.

    Returns {'pitch': (L, W), 'halves': {half: {...}}} where each half has
      n0 (first frame number), frames (count), t0 (UTC seconds of the first frame),
      players: list of dicts (side, shirt, person, x[F], y[F], s[F]; NaN when the
      player is not on the pitch), ball: dict(x, y, s, z, status, poss) with NaN / -1
      when absent. The 'person' ids exist only here, in the git-ignored cache path.
    """
    if CACHE.exists():
        return _load_cache(np.load(CACHE, allow_pickle=False))
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    parsed = parse_positions()
    halves = _build_halves(parsed)
    _save_cache(halves, parsed["pitch"])
    return {"pitch": parsed["pitch"], "halves": halves}


def _save_cache(halves: dict, pitch: tuple[float, float]) -> None:
    arrays: dict[str, np.ndarray] = {"pitch": np.array(pitch)}
    for h, half in enumerate(HALVES):
        d = halves[half]
        arrays[f"h{h}_meta"] = np.array([d["n0"], d["frames"], d["t0"]])
        arrays[f"h{h}_people"] = np.array([f"{p['side']}|{p['shirt']}|{p['person']}" for p in d["players"]])
        for key in ("x", "y", "s"):
            arrays[f"h{h}_{key}"] = np.stack([p[key] for p in d["players"]])
            arrays[f"h{h}_ball_{key}"] = d["ball"][key]
        for key in ("z", "status", "poss"):
            arrays[f"h{h}_ball_{key}"] = d["ball"][key]
    np.savez(CACHE, **arrays)


def _load_cache(data) -> dict:
    halves: dict[str, dict] = {}
    for h, half in enumerate(HALVES):
        n0, frames, t0 = data[f"h{h}_meta"]
        players = []
        for i, tag in enumerate(data[f"h{h}_people"]):
            side, shirt, person = str(tag).split("|")
            players.append(
                {
                    "side": side,
                    "shirt": int(shirt),
                    "person": person,
                    **{k: data[f"h{h}_{k}"][i] for k in ("x", "y", "s")},
                }
            )
        ball = {k: data[f"h{h}_ball_{k}"] for k in ("x", "y", "s", "z", "status", "poss")}
        halves[half] = {"n0": int(n0), "frames": int(frames), "t0": float(t0), "players": players, "ball": ball}
    return {"pitch": (float(data["pitch"][0]), float(data["pitch"][1])), "halves": halves}
