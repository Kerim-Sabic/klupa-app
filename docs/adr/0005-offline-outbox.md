# 0005. Pitch-side events go through an idempotent outbox

Status: accepted · 11 November 2026

## Context

Signal at a youth pitch is poor. A coach who taps "goal" must never lose it or record it twice.

## Decision

Each event gets a client-generated id and is queued locally, then sent with an insert that ignores duplicates on `(match_id, client_id)`. Network failures retry; permanent failures are shown to the coach.

## Consequences

A retry is always safe, and the coach can see what is still waiting. Only events are queued; lineup changes need a connection.

## Alternatives considered

Optimistic writes without a queue (lost on a dropped connection); full offline sync of every table (far more than the match needs).
