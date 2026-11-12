# 0002. Evidence is summed in exact integer units

Status: accepted · 11 November 2026

## Context

The product's central claim is whether removing one chance would change who is on top. With floating-point sums that comparison can be wrong at the margin.

## Decision

Chance quality is stored and summed as integers in 1/10,000 units. Provider decimals are parsed from strings without passing through a float.

## Consequences

The robustness check is an exact comparison, and the TypeScript engine and the Python research agree count for count on 2.2 million moments. Values finer than 0.0001 are rounded once, at the edge.

## Alternatives considered

Floats with a tolerance (the tolerance becomes a hidden parameter); a decimal library (a dependency for something integers already do).
