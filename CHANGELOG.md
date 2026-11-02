# Changelog

## 0.5.0 (2026-11-02)

- Added `work-packages` skill and `.ratchet/` templates (`work-packages.yaml`,
  `human-dependencies.md`) with `SessionStart` and `PreToolUse` hooks for
  multi-session dark-launched delivery, untracked GitHub issue detection, active
  `swe-loop` cursor recovery, `workspace`-mode commit blocking, and `gh pr create`
  gating.
- Added `consolidate` skill and Phase 4 pre-review consolidation pass to remove
  prompt echoing, transition narration, and transitional scaffolding before
  review.
- Expanded `test-plan.md` and Phase 4/5/6 contracts to require defect, level,
  boundary, independent oracle, and failure proof per test.
- Added Phase 0 product/parity inventory for rebuilds and upstream preflight for
  external open-source contributions.
- Replaced `write-as-dejan` with `writing-house-style` and register-specific
  references (`documentation.md`, `pr-descriptions.md`, `messages.md`).
- Added standalone `grill-me` and `grilling` skills.

## 0.4.0 (2026-09-03)

- Added the explicitly invoked `diagram-loop` skill for phase-gated architecture
  diagrams and explainers with deterministic geometry and reviewable run state.
- Added a locked, isolated TypeScript renderer that emits a final PNG, boundary
  review frames, contact sheets, and optional MP4/WebM exports.
- Added mechanical validation for scene, asset, rendering, review, and provenance
  contracts, plus local and CI media-smoke coverage.

## 0.3.0 (2026-07-24)

- Added separate structural and narrative Mermaid conventions, five
  repository-grounded canonical examples, and an opt-in icon rendering track.
- Added a locked local Mermaid renderer with deterministic dark/light output,
  source-to-artifact checks, local Iconify data, and CI diagnostics for render
  drift.
- Reduced `state.md` to the current execution cursor, exact gate authority,
  task status, active exceptions, reviewed revision, and evidence references.
  Detailed design, test, review, verification, and delivery records now stay
  in the artifact that owns them.
- Replaced Phase 4's mandatory conversation pause with a persisted ordering
  boundary: write `test-plan.md`, record the completed boundary in `state.md`,
  then edit test code. The bugfix profile keeps red-before-green.
- Removed author-local loop paths from new committed ADR metadata.
- Added structural validation for the compact-state, test-intent ordering, and
  durable ADR template contracts.

## 0.1.0 (2026-07-19)

Initial release. Bootstraps the repo per ADR 001 (single skills tree, dual
native manifests, no build step).

- Added `swe-loop` skill, verbatim from `~/.claude/skills/swe-loop/`, plus an
  additive Harness notes section for Codex parity (invocation syntax,
  memory-file target, inline fallbacks for Claude-only built-in delegates).
- Added `write-as-dejan` skill, verbatim from
  `~/.claude/skills/write-as-dejan/`.
- Added Claude Code plugin and marketplace manifests, validated with
  `claude plugin validate .`.
- Added Codex plugin and marketplace manifests, grounded in published docs;
  not yet verified against a real Codex install.
- Added a structural CI validator (`tools/validate.py`, stdlib only) and a
  GitHub Actions workflow running it on push and PR.
- Added version-stamped transcripts of the Claude Code built-in `verify`,
  `code-review`, and `simplify` skills under `docs/reference/`, for human
  reading and upgrade-diffing only.
