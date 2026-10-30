---
name: consolidate
description: >
  Run a behavior-preserving consolidation pass over a branch or working-tree
  diff to strip agent-generated semantic sediment (prompt echoing, transition
  narration, redundant comments, transitional wrappers, and prompt-shaped test
  names) so the codebase reads as if the final architecture had been known from
  the beginning. Use when invoked as /consolidate or $consolidate, before
  opening an ad-hoc PR, or at the end of swe-loop Phase 4 before Phase 5 review.
---

# consolidate

Over multi-turn implementation and debugging sessions, coding agents accumulate
**semantic sediment**: comments written to prove prompt compliance to the
reviewer rather than explain invariants to a future maintainer, documentation
that narrates the transition (`"Previously X, now Y"`), variable or test names
borrowed from prompt phrasing or ticket IDs, and transitional helper wrappers
left behind after the design settled.

The consolidation pass removes that trajectory noise before review or PR
creation so the repository reads **as if the final design had been known from
the beginning**.

## Where this runs in the lifecycle

1. **Inside `swe-loop` (end of Phase 4, before Phase 5 review):**
   - Run **after** Phase 3 implementation and Phase 4 tests are green, and
     **before** Phase 5 fresh-context review starts.
   - Running after Phase 4 ensures test names, fixtures, and assertions are
     consolidated alongside production code; running before Phase 5 ensures the
     consolidation edits do not invalidate the reviewed Phase 5 tree SHA.
2. **In ad-hoc / coworking sessions (before `gh pr create`):**
   - Run once the feature or fix works and tests pass, immediately before
     committing the final branch state and opening the pull request.

## Execution protocol

When possible, run diagnosis in a **fresh-context subagent given only
`git diff <base>...HEAD` and the touched files** (without the conversation
transcript). A reader that never saw the user's intermediate correction prompts
immediately spots prompt-echoing comments and transitional naming that feel
normal to the in-session agent.

### 1. What to remove or rewrite

Inspect every added or modified file in the diff for:

- **Transition narration in comments and docs:** Cut `"Previously..."`,
  `"Now..."`, `"Changed from X to Y"`, `"Fixed issue where..."`, or `"Added per
  review"` where historical context has no durable runtime value. State the
  current contract directly (`"Failed rows are retried independently"`).
- **Prompt echoing:** Rename identifiers, fixtures, and test functions that
  echo chat phrasing, bug numbers, or review thread IDs (`test_q01_tuple_fix`)
  into domain terminology (`test_logging_probe_correlates_route_id_and_status`).
- **Redundant comments:** Delete comments that restate what the next line of
  code already says.
- **Transitional scaffolding:** Collapse pass-through wrapper functions, single-use
  adapter layers, dead compatibility shims, and duplicate validation added
  during iterative debugging.
- **Test-diff bloat:** Consolidate overlapping test cases that exercise the
  exact same failure mode with trivial input variations.

### 2. What to preserve (hard boundaries)

Consolidation must be **strictly behavior-preserving**:

- Do not alter externally observable behavior, public API contracts, or
  intentional backward-compatibility paths.
- Keep comments that explain genuinely non-obvious invariants, security
  boundaries, protocol quirks, or operational hazards (*why* a constraint
  exists).
- Re-run the affected test suite and typecheck/lint commands after applying
  consolidation edits. If any check fails, fix or revert the offending edit
  before proceeding to review or PR creation.
