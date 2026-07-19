# Loop state: <slug>

Lives in `~/.claude/swe-loops/<repo>/<slug>/` — never inside the repo.

- **Profile:** feature | bugfix | db/migration | frontend | infra
- **Mode:** branch (Gate B = PR) | workspace (Gate B = local diff + pr-description.md)
- **Repo / branch:** <repo> @ <branch>
- **Started:** <date>
- **Status:** in progress | blocked | done
- **ADR:** <path>

## Phase checklist

- [ ] 0 Design — ADR written, diagram plan + dark/light evidence recorded, architecture doc updated
- [ ] **GATE A — user approved design** (record date + wording)
- [ ] 1 Plan — tasks defined (done-check + S/M class each); analyze check passed (ADR/EARS ↔ tasks coverage)
- [ ] 2 Context — reuse inventory written (below)
- [ ] 3 Implement — all tasks landed (committed / staged per mode), no unrelated churn, no mechanical+semantic mixing
- [ ] 4 Test — test-plan.md written BEFORE tests; tests implemented
- [ ] 5 Review — standards + correctness + zoom-out passes done, findings triaged
- [ ] 6 Verify — full suite green, changed diagrams re-rendered/inspected, no drift from ADR
- [ ] 7 Deliver — summary written (PR opened / pr-description.md per mode)
- [ ] **GATE B — user approved** (PR or local diff; record date)
- [ ] Close — memory/docs updated, loop done

## Task pointer

Current task: <n of N> — <name>

| # | Task | Class (S/M/generated) | Done-check | Status |
|---|------|----------------------|-----------|--------|
| 1 |      |                      |           |        |

## Diagram evidence

Record every Phase 0 design diagram and every diagram source changed after
Gate A. Use `n/a` only with the guide's explicit trivial/code-level reason.

| Artifact | Purpose | Archetype | Rendering mode | Source | Dark inspected | Light inspected | Self-check |
|---|---|---|---|---|---|---|---|
|   |       | structural / narrative | GitHub-native / icon | | | | |

Gate A and Gate B approvals are recorded only in the phase checklist with the
user's date and wording. CI, PR, commit, and artifact state never imply them.

## Reuse inventory (Phase 2)

Existing functions / models / schemas this work uses or extends:

-

## Decision log

Deviations, waivers, amendments — with reasons:

-

## Zoom-out findings (Phase 5 — recorded, NOT applied)

Candidate future loops (refactors, test factories, architectural changes):

-
