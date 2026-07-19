# Loop state: <slug>

Lives in `~/.claude/swe-loops/<repo>/<slug>/` — never inside the repo.

- **Profile:** feature | bugfix | db/migration | frontend | infra
- **Mode:** branch (Gate B = PR) | workspace (Gate B = local diff + pr-description.md)
- **Repo / branch:** <repo> @ <branch>
- **Started:** <date>
- **Status:** in progress | blocked | done
- **ADR:** <path>

## Phase checklist

- [ ] 0 Design — ADR written, diagram renders, architecture doc updated
- [ ] **GATE A — user approved design** (record date + wording)
- [ ] 1 Plan — tasks defined (done-check + S/M class each); analyze check passed (ADR/EARS ↔ tasks coverage)
- [ ] 2 Context — reuse inventory written (below)
- [ ] 3 Implement — all tasks landed (committed / staged per mode), no unrelated churn, no mechanical+semantic mixing
- [ ] 4 Test — test-plan.md written BEFORE tests; tests implemented
- [ ] 5 Review — standards + correctness + zoom-out passes done, findings triaged
- [ ] 6 Verify — full suite green, no drift from ADR
- [ ] 7 Deliver — summary written (PR opened / pr-description.md per mode)
- [ ] **GATE B — user approved** (PR or local diff; record date)
- [ ] Close — memory/docs updated, loop done

## Task pointer

Current task: <n of N> — <name>

| # | Task | Class (S/M/generated) | Done-check | Status |
|---|------|----------------------|-----------|--------|
| 1 |      |                      |           |        |

## Reuse inventory (Phase 2)

Existing functions / models / schemas this work uses or extends:

-

## Decision log

Deviations, waivers, amendments — with reasons:

-

## Zoom-out findings (Phase 5 — recorded, NOT applied)

Candidate future loops (refactors, test factories, architectural changes):

-
