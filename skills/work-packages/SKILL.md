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

Maintain a repository-committed execution cursor in `.ratchet/` so fragmented or
part-time sessions start with zero mental reload and features land on `main` in
small, non-breaking slices instead of accumulating in 10,000-line branches.

Unlike `swe-loop` (which is an explicit autonomous delivery mode for a single
unit of work), `.ratchet/` is **always active** whenever present in a
repository.

## Repository layout

```text
.ratchet/
  work-packages.yaml       # Machine-readable DAG of lanes and small, dark-launchable slices
  human-dependencies.md    # External blockers (HD-xx) and open questions (Q-xx) with Unblock-with defaults
```

Bootstrap a repository by copying
[templates/work-packages.yaml](templates/work-packages.yaml) and
[templates/human-dependencies.md](templates/human-dependencies.md) into
`.ratchet/`.

## Non-negotiables

1. **Non-breaking dark-launch invariant on `main`.** Slices `WP-1` through
   `WP-(N-1)` of any lane must merge to `main` as additive or opt-in changes
   (gated by a manifest declaration, `isActive: false`, feature flag, or
   exercised only by a designated test app). Never merge a half-finished slice
   that alters existing user or citizen behavior before the lane is complete.
2. **Every external blocker carries an `Unblock-with` default.** When a slice
   touches an unresolved human dependency (`HD-xx`: CISO approval, IT DNS,
   external credential, or live environment runbook) or open question (`Q-xx`),
   record the safe `Unblock-with` default in `.ratchet/human-dependencies.md`,
   build against that default, leave `TODO(HD-xx)` in code if applicable, and
   merge the dark slice instead of stalling a giant branch.
3. **Live runbooks are explicit `human_gate: true` work packages.** When a
   feature needs verification on a `main`-only deployment or live environment
   before user rollout, model that verification as its own `human_gate: true`
   work package (`WP-<LANE>.<K>`) between the dark infrastructure slice and the
   final cutover slice.
4. **Only the final cutover slice (`WP-N`) flips the user-facing switch.**
   Enabling the template, plugin version, or default flag happens in the last
   work package after all upstream code and `human_gate` runbook packages are
   `done`.
5. **PR diff sets `status: done` (enforced on `gh pr create`).** Inside the PR
   branch that delivers a work package, set that work package's `status: done`
   in `.ratchet/work-packages.yaml` as part of the PR diff. While the PR is
   open, `main` still shows `todo`, and the instant the PR merges on GitHub,
   `main` receives `status: done` atomically with zero follow-up commits.
   `hooks/pre-tool-use.mjs` blocks `gh pr create` (never `git push`) when
   `.ratchet/work-packages.yaml` has not been updated on the branch or has
   uncommitted changes.
6. **One flow-mapping line per work package.** Every work package in
   `.ratchet/work-packages.yaml` MUST be a **single flow-mapping line**
   (`- { id: ..., lane: ..., title: "...", ref: "...", depends_on: [...], blocked_by: [...], human_gate: false, status: todo, owner: null }`).
   Never write multi-line YAML blocks per package, never embed prose paragraphs
   (`deliverable_and_acceptance`, `dark_launch`, or GitHub API snapshots) in
   `work-packages.yaml`, and never include Dependabot/bot bumps.

## Splitting a feature or backlog into work packages

1. Assign a short lane slug (`key-vault`, `live-logs`, `ops-catalog`) and
   number packages `WP-<LANE>.1`, `WP-<LANE>.2`, and so on.
2. Keep each work package to **one reviewable concern** (`S` or `M` in
   `swe-loop` terms, typically 100 to 600 lines) that can merge to `main`
   independently.
3. Separate:
   - pure library/schema/validator slices (`human_gate: false`),
   - opt-in infrastructure/runtime slices (`human_gate: false` or `true`),
   - live test-app/runbook verification on `main` (`human_gate: true`),
   - final user-facing activation (`human_gate: false`, depends on the
     verification slice).
4. Record every prerequisite within or across lanes in `depends_on: [...]`.

## Session lifecycle

1. **Start of session:**
   - In Claude Code, `hooks/session-start.mjs` automatically reads `.ratchet/`
     on `startup`, `resume`, `clear`, and `compact` and injects the
     `<ratchet-work-packages>` briefing (`Active`, `Ready Next`, `Blocked`, and
     `Unblock-with` defaults).
   - In harnesses without `SessionStart` hooks (or when inspecting manually),
     run `node <plugin-root>/hooks/session-start.mjs` or read
     `.ratchet/work-packages.yaml` and `.ratchet/human-dependencies.md` at turn
     1.
2. **Picking work:**
   - Select a work package with `status: todo` whose `depends_on` entries are
     all `done`.
   - If the package lists an open `HD-xx` in `blocked_by`, implement the
     documented `Unblock-with` default from `.ratchet/human-dependencies.md`.
     Only treat a package as unstartable (`status: blocked`) when no safe
     `Unblock-with` default exists (for example, a pure manual runbook step
     waiting on an external admin).
3. **Finishing a slice (PR rule):**
   - Set the delivered work package's `status: done` in
     `.ratchet/work-packages.yaml` inside the PR branch before running
     `gh pr create`, so merging the PR on GitHub updates `main` to `done`
     atomically.
   - `hooks/pre-tool-use.mjs` intercepts `gh pr create` (not `git push`) and
     denies PR creation if `.ratchet/work-packages.yaml` was not updated on the
     branch or has uncommitted changes.
   - When a human dependency is fulfilled, mark its row `Done (<YYYY-MM-DD>)`
     in `.ratchet/human-dependencies.md` with the concrete evidence (resource
     ID, PR number, or runbook outcome).

## Interaction with `swe-loop`

- `.ratchet/` is always on; `swe-loop` remains explicit-only.
- When `/swe-loop <WP-ID>` is invoked in a repository with `.ratchet/`, scope
  the loop to that single work package, honor any `Unblock-with` defaults from
  `.ratchet/human-dependencies.md`, and update `.ratchet/work-packages.yaml` at
  Gate B.
- When `/swe-loop` designs a multi-PR initiative at Phase 0/1, record the
  lane's dark-launched work packages and `HD-xx` gates in `.ratchet/`.
