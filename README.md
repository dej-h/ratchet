# ratchet

Phase-gated software delivery, work-package tracking, and deterministic diagram
compilation for **Claude Code** and **Codex**.

Ships as one plugin tree read directly by both harnesses via the
[open agent skills standard](https://agentskills.io).

## Skills & hooks

- **`swe-loop`** (`skills/swe-loop/SKILL.md`): 8-phase autonomous delivery mode
  with two human gates (Gate A: ADR + EARS acceptance criteria; Gate B: reviewed
  diff/PR), S/M review-effort commit budgeting, reuse inventory, persisted
  pre-code test plans (`test-plan.md`), pre-review consolidation, and
  fresh-context review. Large branch-mode loops use
  [native GitHub PR stacks](skills/swe-loop/native-stacks.md) for dependent
  delivery slices, with separate stacks and linked prerequisites across repos.
- **`work-packages`** (`skills/work-packages/SKILL.md`): always-on multi-session
  DAG (`.ratchet/work-packages.yaml`) and external blocker ledger
  (`.ratchet/human-dependencies.md` with `Unblock-with` dark-launch defaults).
  Backed by `hooks/session-start.mjs` (briefs active, ready-next, and untracked
  GitHub issues on startup and after compaction, and recovers active `swe-loop`
  cursors) and `hooks/pre-tool-use.mjs` (gates `gh pr create` on updating
  `.ratchet/work-packages.yaml` and blocks `git commit`/`git push` in
  `workspace`-mode loops).
- **`consolidate`** (`skills/consolidate/SKILL.md`): behavior-preserving
  de-sedimentation pass that strips prompt echoing, transition narration
  (`"Previously X, now Y"`), redundant comments, prompt-shaped test names, and
  transitional wrappers from a diff before review or PR creation.
- **`frontend-quality`** ([skill](skills/frontend-quality/SKILL.md)): standalone
  UI quality rubric, canonical data-loading policy, and locked browser checks
  for accessibility, overflow, errors, request concurrency and repeated runs.
  Applies to frontend portions of every `swe-loop` profile and preserves the
  application's brand and framework. See [verification](skills/frontend-quality/references/verification.md)
  for route configuration and evidence review.
- **`diagram-loop`** (`skills/diagram-loop/SKILL.md`): 8-phase visual-production
  workflow that compiles a declarative `scene.yaml` contract into measured
  geometry, style frames, contact sheets, PNGs, and optional MP4/WebM exports.
- **`grill-me` / `grilling`** (`skills/grill-me/SKILL.md`,
  `skills/grilling/SKILL.md`): design interview skill used standalone or in
  `swe-loop` Phase 0 before Gate A.
- **`writing-house-style`** (`skills/writing-house-style/SKILL.md`):
  register-separated writing rules for documentation (`documentation.md`), PR
  descriptions (`pr-descriptions.md`), and outgoing messages (`messages.md`).

## Install

**Claude Code:**

```bash
claude plugin marketplace add dej-h/ratchet
claude plugin install ratchet
```

or in-session:

```text
/plugin install ratchet --marketplace dej-h/ratchet
```

**Codex:**

```bash
codex plugin marketplace add dej-h/ratchet
codex plugin add ratchet@ratchet
```

### Usage

Invoke skills in Claude Code with `/ratchet:<skill>` (for example
`/ratchet:swe-loop`, `/ratchet:consolidate`, `/ratchet:work-packages`,
`/ratchet:frontend-quality`, `/ratchet:diagram-loop`, `/ratchet:grill-me`) and in Codex with
`$ratchet:<skill>`.

When a repository contains `.ratchet/work-packages.yaml`, the `SessionStart` and
`PreToolUse` hooks run automatically.

## Validate locally

```bash
claude plugin validate .
uv run tools/validate.py
uv run pytest -q
cd skills/frontend-quality/checks && npm ci && npx playwright install chromium && npm test
cd ../../..
cd tools/diagrams && npm ci && npm test && npm run diagrams:check
cd ../../skills/diagram-loop/renderer && npm ci && npm run typecheck && npm test && npm run test:media
```

