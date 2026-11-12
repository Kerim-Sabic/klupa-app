# 0004. Sign-in uses one-time codes; demos use anonymous sessions

Status: accepted · 11 November 2026

## Context

Volunteer coaches reuse passwords, and a password table is a liability the product does not need.

## Decision

Sign-in is an emailed one-time code. Trying the product needs no account: an anonymous session creates a demo club that is purged after seven days.

## Consequences

No password is created, stored or reset. Email delivery limits apply, so the demo path does not depend on email.

## Alternatives considered

Email and password (credential storage, lockout and reset flows to build and defend); social login only (excludes coaches without those accounts).
