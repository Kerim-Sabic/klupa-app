# 0001. The database is the security boundary

Status: accepted · 11 November 2026

## Context

A youth-sport app holds data about children from many clubs. An access bug in application code would expose one club to another.

## Decision

There is no application server. The browser talks to Postgres through Supabase with a publishable key, and every table has row-level security enabled and forced, scoped by club membership. Tenant tables use composite `(club_id, id)` foreign keys. Privileged logic lives in a private `app` schema that the API does not expose.

## Consequences

One place decides access, and it is tested with two clubs on every push. The cost is that rules are written in SQL, and anything that needs a secret (for example a paid API) needs an edge function.

## Alternatives considered

A Node API in front of the database (two places to get authorisation right); application-level tenant filters only (one forgotten `where` leaks data).
