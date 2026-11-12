"""Full-rate (25 Hz) helpers: kick-off-relative frame lookup and 0.4 s smoothed speed."""

from __future__ import annotations

import numpy as np

import common

SMOOTH_FRAMES = 10  # 0.4 s at 25 Hz: speed = displacement over +-5 frames / 0.4 s
HALF_WINDOW = SMOOTH_FRAMES // 2


def kick_offset_ms(half: dict, kick: float) -> int:
    """Milliseconds from the half's first frame to the event-clock kick-off."""
    return round((kick - half["t0"]) * 1000)


def first_frame_at_or_after_kickoff(half: dict, kick: float) -> int:
    """Index of the first frame at or after kick-off; 0 when tracking starts after it."""
    return max(0, int(np.ceil(kick_offset_ms(half, kick) / 40.0)))


def positions_at(half: dict, kick: float, times: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Linear interpolation of every player at event-clock `times` (seconds).

    Returns X, Y with shape (len(times), players) (NaN when absent, the same rule as
    convert.py: both neighbouring frames must exist) and the ball-alive flag per time.
    """
    # Before the first frame, hold it (the rule convert.py uses for samples before tracking starts).
    u = np.maximum(kick_offset_ms(half, kick) / 40.0 + times * common.FRAME_RATE, 0.0)
    low = np.floor(u).astype(np.int64)
    frac = u - low
    high = np.minimum(low + 1, half["frames"] - 1)
    exact = frac == 0
    players = half["players"]
    xs = np.full((len(times), len(players)), np.nan)
    ys = np.full_like(xs, np.nan)
    for j, p in enumerate(players):
        ax, ay, bx, by = p["x"][low], p["y"][low], p["x"][high], p["y"][high]
        ok = ~np.isnan(ax) & (exact | ~np.isnan(bx))
        xs[:, j] = np.where(ok, np.where(exact, ax, ax + (bx - ax) * frac), np.nan)
        ys[:, j] = np.where(ok, np.where(exact, ay, ay + (by - ay) * frac), np.nan)
    alive = half["ball"]["status"][np.rint(u).astype(np.int64)] == 1
    return xs, ys, alive


def smoothed_speed(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Speed in m/s over a 0.4 s centred window; NaN where the player is absent.

    Inside the player's single contiguous on-pitch run the window shrinks at both
    ends (one-sided difference over the frames that exist), so no frame is lost.
    """
    speed = np.full(x.shape, np.nan)
    present = np.flatnonzero(~np.isnan(x))
    if present.size == 0:
        return speed
    first, last = int(present[0]), int(present[-1])
    if last - first + 1 != present.size:
        raise ValueError("player has more than one on-pitch run in a half")
    idx = np.arange(first, last + 1)
    lo = np.maximum(idx - HALF_WINDOW, first)
    hi = np.minimum(idx + HALF_WINDOW, last)
    span = (hi - lo) / common.FRAME_RATE
    ok = span > 0
    speed[idx[ok]] = np.hypot(x[hi[ok]] - x[lo[ok]], y[hi[ok]] - y[lo[ok]]) / span[ok]
    return speed


def runs_at_least(mask: np.ndarray, minimum: int) -> int:
    """Number of runs of consecutive True values lasting at least `minimum` frames."""
    edges = np.diff(np.concatenate(([0], mask.astype(np.int8), [0])))
    starts = np.flatnonzero(edges == 1)
    ends = np.flatnonzero(edges == -1)
    return int(((ends - starts) >= minimum).sum())
