# Test plan: <slug>

Written BEFORE any test code. Testing with intent: what does this change
need, not what is easy to cover.

## Behaviors under test

Start from the ADR's EARS criteria — every criterion gets at least one test:

| EARS criterion (from ADR) | Test type (unit/integration/e2e) | Test |
|---------------------------|----------------------------------|------|
|                           |                                  |      |

## Edge cases & failure modes

Boundary values, empty/None inputs, concurrency, partial failures, bad
external responses:

-

## Integration surfaces

Where this change meets the rest of the system (DB, API contracts, queues,
other modules) and how each seam is exercised:

-

## Explicitly not tested

What is out of scope, and why that is acceptable:

-

## Verification beyond tests

End-to-end check of the affected flow (verify skill), migrations up+down
(db profile), Playwright QA (frontend profile):

-
