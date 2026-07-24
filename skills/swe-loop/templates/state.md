# Loop state: <slug>

Lives in `~/.claude/swe-loops/<repo>/<slug>/` — never inside the repo.

## Cursor

- **Profile:** feature | bugfix | db/migration | frontend | infra
- **Mode:** branch (Gate B = PR) | workspace (Gate B = local diff + pr-description.md)
- **Repo / branch:** <repo> @ <branch>
- **Worktree:** <absolute path>
- **Started:** <date>
- **Status:** in progress | blocked | done
- **Current phase:** <0-7 + name>
- **Current boundary:** <next incomplete phase boundary>
- **Current task:** <task ID + name | n/a>
- **Next action:** <one concrete action>
- **ADR:** <path>
- **Last reviewed SHA:** pending | stale | <40-character SHA> (branch) | <base SHA> (workspace; pair with review evidence)
- **Review evidence:** <evidence reference | pending>

## Gate authority

| Gate | Status | Date | Exact user wording | Approved revision |
|---|---|---|---|---|
| A | pending / approved | | | <ADR path + revision> |
| B | pending / approved | | | <PR/SHA or workspace evidence> |

Gate authority is never inferred from CI, a PR, a commit, a checkbox, or any
other artifact. Preserve approved rows exactly during compaction.

## Phase status

| Phase | Status | Result / evidence reference |
|---|---|---|
| 0 Design | pending / active / blocked / done | |
| Gate A | pending / done | Gate authority row |
| 1 Plan | pending / active / blocked / done | |
| 2 Context | pending / active / blocked / done | |
| 3 Implement | pending / active / blocked / done | |
| 4 Test | pending / active / blocked / done | |
| 5 Review | pending / active / blocked / done | |
| 6 Verify | pending / active / blocked / done | |
| 7 Deliver | pending / active / blocked / done | |
| Gate B | pending / done | Gate authority row |
| Close | pending / done | |

## Task status

Task definitions, classes, and done-checks live in `plan.md`.

| ID | Status | Result / evidence reference |
|---|---|---|
| T1 | pending / active / blocked / done | |

## Active exceptions

Keep unresolved findings and every active waiver. Move resolved detail to its
owning evidence at the next phase transition.

| ID | Kind | Status | Summary | Evidence reference |
|---|---|---|---|---|
| | finding / waiver | unresolved / waived | | |

## Evidence references

References must be durable loop paths, repository paths, or PR/CI/issue URLs.
Do not point at terminal scrollback or temporary files.

| Ref | Owner / purpose | Path or URL |
|---|---|---|
| ADR | approved design | |
| PLAN | tasks, coverage, reuse inventory | `plan.md` |
| TEST | test intent and results | `test-plan.md` |
| EVIDENCE | optional diagram, review, and verification detail | `evidence.md` or n/a |
| DELIVERY | reviewer-facing summary | PR URL or `pr-description.md` |

## Compaction rule

At every phase transition, persist completed detail in its owning artifact,
verify the reference exists, update the cursor and status tables, then remove
copied commands, output, review narratives, ADR prose, and PR prose from this
file. Never compact exact gate wording, task status, active findings, waivers,
or the reviewed revision.
