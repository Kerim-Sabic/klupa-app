# 0003. No momentum forecaster is shipped

Status: accepted · 11 November 2026

## Context

Momentum tools are expected to predict what happens next. We tested it: on seven matches, leave-one-match-out, adding the 5-minute xG leader to a recency baseline made next-shot log loss worse (1.0954 to 1.1235).

## Decision

The product describes and qualifies what happened. It does not predict. A model may be added only if it beats the recency baseline on held-out matches first.

## Consequences

Nothing on screen claims more than the evidence supports. We give up a feature that demos well.

## Alternatives considered

Ship a forecaster with a disclaimer (a disclaimer does not make a wrong number right); train a larger model (the evidence gave no reason to expect a gain).
