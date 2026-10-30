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

Strip trajectory noise from the active diff so the repository reads as if the
final design had been known from the beginning.

## When to run

1. **Inside `swe-loop`:** at the end of Phase 4 (after implementation and tests
   pass) and before Phase 5 review.
2. **Ad-hoc / coworking sessions:** after tests pass, immediately before final
   commit and `gh pr create`.

## Protocol

Diagnose in a **fresh-context subagent given only `git diff <base>...HEAD` and
the touched files** (no conversation transcript) when possible, then apply and
re-test.

### 1. Remove or rewrite

- **Transition narration in comments and docs:** cut `"Previously..."`,
  `"Now..."`, `"Changed from X to Y"`, `"Fixed issue where..."`, or `"Added per
  review"`. State the current contract directly.
- **Prompt echoing:** rename identifiers, fixtures, and test functions that
  echo chat phrasing, bug numbers, or review thread IDs (`test_q01_tuple_fix`)
  into domain terminology (`test_logging_probe_correlates_route_id_and_status`).
- **Redundant comments:** delete comments that restate the code.
- **Transitional scaffolding:** collapse pass-through wrappers, single-use
  adapters, dead shims, and duplicate validation.
- **Test-diff bloat:** consolidate overlapping test cases that cover the same
  failure mode.

### 2. Preserve

- Do not alter externally observable behavior, public API contracts, or
  intentional compatibility paths.
- Keep comments explaining non-obvious invariants, security boundaries, protocol
  quirks, or operational hazards.
- Re-run tests, typecheck, and lint after edits; revert any edit that breaks
  verification.
