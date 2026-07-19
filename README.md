# ratchet

Phase-gated SWE workflow for coding agents. A ratchet only turns one way:
forward, through gates, never slipping back to an unreviewed state. That is
the whole idea.

Ships as a single plugin for both **Claude Code** and **Codex**, from one
`skills/` tree, via the [open agent skills standard](https://agentskills.io)
(originated by Anthropic, adopted by both harnesses). No build step: both
harnesses read the identical `SKILL.md` files.

## What is in the box

- **swe-loop**: an 8-phase workflow (ADR with alternatives, task planning
  with a review-effort budget, reuse inventory, minimal-diff implementation,
  test-plan-before-tests, fresh-context review, drift-checked verification,
  gated delivery). Exactly two human checkpoints: design approval and final
  diff/PR review. See `skills/swe-loop/SKILL.md`.
- **write-as-dejan**: a writing-voice skill for prose artifacts (ADRs, PR
  descriptions, summaries). See `skills/write-as-dejan/SKILL.md`.

Design rationale for the repo structure itself:
`docs/architecture-decisions/001-repo-plugin-structure.md`.

## Install

**Claude Code**, from a CLI session:

```
claude plugin marketplace add dej-h/ratchet
claude plugin install ratchet
```

or the in-session slash-command form:

```
/plugin marketplace add dej-h/ratchet
/plugin install ratchet
```

**Codex**:

```
codex plugin marketplace add dej-h/ratchet
codex plugin install ratchet
```

The Codex manifests (`.codex-plugin/`, `.agents/plugins/`) are grounded in
the published Codex plugin docs but have not been verified against a real
Codex install. If `codex plugin marketplace add` fails or behaves
unexpectedly, that is the first place to look, not the skill content itself.

## Validate locally

```
claude plugin validate .          # authoritative check for the Claude Code side
uv run tools/validate.py          # structural check: manifest consistency, SKILL.md frontmatter, ADR presence
```

CI (`.github/workflows/validate.yml`) runs the second on every push and PR.

## Status

Private, 0.1.0. This repo is the swe-loop workflow itself, dogfooded to
build itself: its own first feature went through the loop it implements.
