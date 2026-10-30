# ratchet

Phase-gated SWE workflow for coding agents. A ratchet only turns one way:
forward, through gates, never slipping back to an unreviewed state. That is
the whole idea.

Ships as a single plugin for both **Claude Code** and **Codex**, from one
`skills/` tree, via the [open agent skills standard](https://agentskills.io)
(originated by Anthropic, adopted by both harnesses). No build step: both
harnesses read the identical `SKILL.md` files.

## What is in the box

- **swe-loop**: an explicit autonomous-delivery mode with an 8-phase workflow
  (grilling into an ADR with alternatives, task planning with a review-effort
  budget, reuse inventory, minimal-diff implementation, test-plan-before-tests,
  fresh-context review, drift-checked verification, gated delivery). It starts
  when invoked or clearly requested for end-to-end delivery, and keeps exactly
  two human checkpoints: design approval and final diff/PR review. See
  `skills/swe-loop/SKILL.md`.
- **grill-me**: Matt Pocock's standalone interview skill for sharpening an idea,
  plan, or decision. It delegates to **grilling**, also shipped unchanged.
  Standalone use carries no SWE-loop artifact, implementation, or testing
  requirements. Within SWE-loop, `grilling` resolves actual ambiguities and
  consequential technical choices before the ADR is approved at Gate A;
  detailed briefs do not need questions for their own sake.
- **diagram-loop**: an explicitly invoked 8-phase visual-production workflow
  for premium architecture stories and explainers. It compiles a small scene
  contract into measured geometry, a final PNG, boundary review frames, and
  optional MP4/WebM exports. It has exactly two human gates and keeps run state
  outside the target repository. See `skills/diagram-loop/SKILL.md`.
- **work-packages**: an always-on repository work-package DAG
  (`.ratchet/work-packages.yaml`) and external human-dependency ledger
  (`.ratchet/human-dependencies.md` with `Unblock-with` dark-launch defaults),
  backed by `SessionStart` and `PreToolUse` hooks (`hooks/session-start.mjs`,
  `hooks/pre-tool-use.mjs`) that brief active, ready-next, and untracked GitHub
  issues at session start/compaction, recover active `swe-loop` cursors, block
  `workspace`-mode commits, and gate `gh pr create` on updating
  `.ratchet/work-packages.yaml`. See `skills/work-packages/SKILL.md`.
- **consolidate**: a behavior-preserving de-sedimentation pass that strips
  prompt echoing, transition narration (`"Previously X, now Y"`), redundant
  comments, prompt-shaped test names, and transitional wrappers before Phase 5
  review or ad-hoc PR creation. See `skills/consolidate/SKILL.md`.
- **write-as-dejan**: a writing skill with two registers: maintainer
  documentation (READMEs, ADRs, design notes, docstrings, file and package
  naming) and outgoing messages (PR descriptions, issues, Slack, email). See
  `skills/write-as-dejan/SKILL.md`.

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
codex plugin add ratchet@ratchet
```

The Codex manifests (`.codex-plugin/`, `.agents/plugins/`) are grounded in
the published Codex plugin docs but have not been verified against a real
Codex install. If `codex plugin marketplace add` fails or behaves
unexpectedly, that is the first place to look, not the skill content itself.

Invoke the installed workflows as `/ratchet:swe-loop` or
`/ratchet:diagram-loop` in Claude Code, and as `$ratchet:swe-loop` or
`$ratchet:diagram-loop` in Codex.

For a standalone interview, invoke `/ratchet:grill-me` in Claude Code or
`$ratchet:grill-me` in Codex. It does not start `swe-loop`. The copied entrypoint
delegates to `grilling`; harnesses without a Skill tool can read and follow the
shipped `skills/grilling/SKILL.md` directly.

## Validate locally

```
claude plugin validate .          # authoritative check for the Claude Code side
uv run tools/validate.py          # manifests, skills, ADRs, and canonical Mermaid contracts
uv run pytest -q                  # repository validator tests
cd tools/diagrams
npm ci                            # exact Node and package versions are locked in this directory
npm test                          # renderer units and five-example corpus contract
npm run diagrams:check            # one full render; committed icon SVGs match both passes
cd ../../skills/diagram-loop/renderer
npm ci                            # isolated premium-renderer dependency tree
npm run typecheck                 # strict TypeScript boundary
npm test                          # schemas, state, geometry, layout, timing, and digests
npm run test:media                # reduced-cost real PNG, MP4, and WebM render smoke
cd ..
node scripts/run-renderer.mjs --help  # installed-plugin, external-cache entrypoint
```

CI (`.github/workflows/validate.yml`) runs the structural validator, Python
tests, both Mermaid checks, and the isolated diagram-loop checks on every push
and PR.

## Status

Private, 0.4.0. This repo is the workflow implementation itself, dogfooded to
build itself: its own first feature went through the loop it implements.
