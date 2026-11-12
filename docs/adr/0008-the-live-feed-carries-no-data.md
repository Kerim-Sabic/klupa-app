# 0008. The live feed says "something changed", nothing more

Status: accepted · 11 November 2026

## Context

An assistant coach, or a second phone on the bench, should see a match review change while the match is being recorded. The database can push row changes to subscribers.

## Decision

The page subscribes to changes for one match and uses each notification only to mark its queries stale. What is drawn always comes from the same reads every other screen uses. The pushed row itself is ignored.

## Consequences

There is one code path for what a person may see, and it is the one row-level security already guards and the isolation tests already cover. A dropped or duplicated notification costs at most one extra read. The page states whether it is connecting, live or cut off, so a frozen feed is never mistaken for a quiet match. The cost is one read per change instead of applying the pushed row in place, which is negligible at one coach's tapping rate.

## Alternatives considered

Applying pushed rows to local state (a second, untested path for the same data, with ordering and deduplication to get right); polling (wasteful on mobile data, and slower); a hand-written socket protocol (nothing the database's own feed does not already provide).
