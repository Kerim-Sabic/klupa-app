# 0007. Writes that touch several rows are database functions

Status: accepted · 11 November 2026

## Context

There is no application server, so the browser talks to the database's REST API. One request is one statement. Planning a session (the session, its drills, an attendance row per player), a substitution (one stint closed, another opened) and loading the sample season were therefore several requests in a row, with clean-up code for the case where a later one failed. The first production-readiness scan flagged both halves of that: writes with no transaction around them, and deletes issued by the client.

## Decision

Every write that touches more than one row or table, and every erasure, is one named function in the database: `plan_session`, `record_attendance`, `record_observation`, `apply_lineup`, `import_season`, `erase_player`, `delete_club`. Each runs as the caller (`security invoker`), so row-level security, column grants, audit triggers, the match state machine and the write limits apply exactly as they do to a single write. The client calls the function and never strings writes together or issues a delete.

## Consequences

A failure half-way stores nothing; there is no clean-up code to get wrong. The rules are tested where they live: `supabase/tests/atomic_writes.sql` (30 checks) proves all-or-nothing behaviour and that another club or a signed-out visitor is refused. The cost is that part of the write logic is SQL, reviewed in migrations rather than in TypeScript, and the generated types describe function arguments more loosely than tables.

## Alternatives considered

An application server with transactions (a second thing to secure, deploy and keep in step with the policies); edge functions holding a privileged key (moves the security boundary out of the database, against decision 0001); keeping client-side clean-up (cannot be made correct when the connection drops between requests).
