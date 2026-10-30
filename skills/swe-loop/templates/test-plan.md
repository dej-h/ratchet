# Test plan: <slug>

Written BEFORE any test code. Testing with intent: what does this change
need, not what is easy to cover. `state.md` owns the persisted test-intent
boundary and Phase 4 status; do not duplicate either status here.

Intent is complete only when every EARS criterion maps to a planned test and
every section below contains concrete intent or an explicit `none` with a
reason. Copying this template does not complete the boundary.

## Behaviors under test

Start from the ADR's EARS criteria — every criterion gets at least one proving
test that states the realistic production defect it catches, why its chosen
level (`unit`, `contract`, `integration`, `provider-replay`, `live`, `eval`) is
the cheapest level that proves the behavior, the boundary exercised, the
independent oracle, and how failure is proven:

| EARS criterion (from ADR) | Production defect caught | Level | Boundary & fakes | Independent oracle | Failure proof | Status / result |
|---|---|---|---|---|---|---|
| | | unit / contract / integration / provider-replay / live / eval | | | | planned |

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

## Bugfix reproduction

Use `n/a` for non-bugfix profiles. For a bugfix, plan the reproduction before
the production fix and record durable red and green evidence here.

| Reproduction | Red evidence | Production fix revision | Green evidence |
|---|---|---|---|
| n/a | n/a | n/a | n/a |
