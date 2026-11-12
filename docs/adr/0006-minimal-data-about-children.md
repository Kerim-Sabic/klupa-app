# 0006. Store the minimum about children

Status: accepted · 11 November 2026

## Context

Players are minors. Every field stored is a field that can leak.

## Decision

A player is a label and a shirt number. The only age information is an optional birth quarter, used for the relative-age check. No names, birth dates, photos, contacts or health data. The audit log stores column names, not values. Guardian consent status is recorded per player.

## Consequences

There is little to lose in a breach, and export and erasure are simple. Some analyses (age-adjusted norms) are not possible, by design.

## Alternatives considered

Full profiles (more useful to a scout, far more harmful if exposed); birth dates (not needed: the quarter answers the fairness question).
