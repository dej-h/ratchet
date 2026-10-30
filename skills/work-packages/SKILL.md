---
name: work-packages
description: >
  Manage the always-on .ratchet/work-packages.yaml DAG and
  .ratchet/human-dependencies.md ledger for multi-session, multi-PR, and
  part-time work. Use when initializing .ratchet/ in a repository, splitting a
  large feature or open PR into small dark-launchable slices, recording external
  human/runbook blockers with Unblock-with defaults, or checking/updating work
  package status during ad-hoc or swe-loop sessions.
---

# work-packages

## Repository layout

```text
.ratchet/
  work-packages.yaml       # Machine-readable DAG of lanes and small, dark-launchable slices
  human-dependencies.md    # External blockers (HD-xx) and open questions (Q-xx) with Unblock-with defaults
```

Bootstrap by copying
[templates/work-packages.yaml](templates/work-packages.yaml) and
[templates/human-dependencies.md](templates/human-dependencies.md) into
`.ratchet/`.

## Non-negotiables

1. **Dark-launch intermediate slices on `main`.** Slices `WP-1` through
   `WP-(N-1)` of any lane must merge to `main` as additive or opt-in changes
   (gated by a manifest declaration, `isActive: false`, feature flag, or test
   app). Never alter existing user behavior before `WP-N`.
2. **Every external blocker carries an `Unblock-with` default.** For any open
   `HD-xx` or `Q-xx`, record the safe `Unblock-with` default in
   `.ratchet/human-dependencies.md`, build against that default, and leave
   `TODO(HD-xx)` where applicable.
3. **Live runbooks are explicit `human_gate: true` packages.** Model `main`-only
   deployment or live environment verification as its own `human_gate: true`
   package (`WP-<LANE>.<K>`) between dark code slices and final cutover.
4. **Only the final slice (`WP-N`) flips the user-facing switch** after all
   upstream code and `human_gate` packages are `done`.
5. **PR diff sets `status: done` (enforced on `gh pr create`).** Inside the PR
   branch delivering a slice, set that slice's `status: done` in
   `.ratchet/work-packages.yaml` so merging updates `main` atomically.
   `hooks/pre-tool-use.mjs` blocks `gh pr create` (not `git push`) when
   `.ratchet/work-packages.yaml` is unchanged on the branch or has uncommitted
   edits.
6. **One flow-mapping line per work package.** Format every entry as
   `- { id: ..., lane: ..., title: "...", ref: "...", depends_on: [...], blocked_by: [...], human_gate: false, status: todo, owner: null }`.
   No multi-line YAML blocks, no embedded prose fields, no GitHub API dumps, and
   no Dependabot bumps.

## Splitting work

1. Assign a lane slug (`key-vault`, `live-logs`, `ops-catalog`) and number
   slices `WP-<LANE>.1`, `WP-<LANE>.2`, ...
2. Keep each slice to one reviewable concern (`S` or `M`, 100 to 600 lines) in
   dependency order (`depends_on: [...]`):
   - pure library/schema/validator slices (`human_gate: false`),
   - opt-in infrastructure/runtime slices (`human_gate: false` or `true`),
   - live test-app/runbook verification on `main` (`human_gate: true`),
   - final user-facing activation (`human_gate: false`).

## Session lifecycle

1. **Start:** `hooks/session-start.mjs` injects `<ratchet-work-packages>` on
   `startup`, `resume`, `clear`, and `compact`.
2. **Pick:** choose a `status: todo` package whose `depends_on` are all `done`.
   If it lists an open `HD-xx` in `blocked_by`, build its `Unblock-with`
   default. Use `status: blocked` only when no safe `Unblock-with` default
   exists.
3. **Finish:** set the delivered package's `status: done` in
   `.ratchet/work-packages.yaml` before `gh pr create`. When an `HD-xx` is
   fulfilled, mark its row `Done (<YYYY-MM-DD>)` in
   `.ratchet/human-dependencies.md` with the concrete evidence.
4. **With `swe-loop`:** `/swe-loop <WP-ID>` scopes the loop to that package;
   multi-PR `/swe-loop` designs write their lane into `.ratchet/` at Gate A.
