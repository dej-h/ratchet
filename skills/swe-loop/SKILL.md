---
name: swe-loop
description: >
  Explicit autonomous-delivery mode for cohesive features or modules taken
  end-to-end through design, implementation, verification, and handoff. Use
  when invoked as /swe-loop or $swe-loop, when resuming a loop, or when the
  user clearly asks for autonomous delivery. Keep inactive for coworking,
  co-audits, exploration, simpler variants, focused changes, and requests
  signaled only by task size, unattended work, or a commit/PR. If autonomy is
  ambiguous, ask before creating loop artifacts. Once active, enforce exactly
  two human checkpoints, test intent before tests, independent review, and
  verification against design.
---

# swe-loop

Once activated, the loop keeps delivery discipline independent of session
memory or context freshness. Its phase responsibilities and human gates are
invariant; profiles may change depth and explicitly documented ordering. The
state file must always show where the work stands.

## Non-negotiables (every phase)

1. **State file is the execution cursor and gate authority.** Read it before
   doing anything and update it at every phase transition. It is fixed-shape
   current state, not an append-only diary. Persist completed detail in its
   owning artifact, verify the reference exists, then replace the cursor
   values in place. Never rely on conversation history to know where the loop
   stands.
2. **Two human gates only.** Gate A = design approval (end of Phase 0).
   Gate B = delivery review (Phase 7). Never pass a gate without the user
   explicitly approving in the conversation. Everything between gates is
   self-checked via boundaries below — do not ask for permission mid-loop
   unless genuinely blocked. Record the exact approval in `state.md`; that
   file is the only durable gate authority. A PR state, CI result, commit,
   checkbox, or generated artifact is evidence, never inferred human approval.
3. **No irreversible or production-affecting commands.** No deploys,
   `terraform apply`/`destroy`, `az` mutations on shared resources,
   force-pushes, or non-local DB changes — local dev is the sandbox. If a
   phase appears to need one, stop and ask. (Hard enforcement belongs in
   settings.json deny rules; this skill is the instruction layer, not the
   only defense.)
4. **Dependencies are never hand-pinned.** Add or upgrade only via resolver
   commands (`uv add <pkg>`, `npm install <pkg>`) so the registry — not model
   memory — picks the version. When writing code against a library, verify
   current API from its docs, never from internal knowledge alone.
5. **Prose artifacts use the write-as-dejan skill** (ADRs, summaries, PR
   descriptions): dense, factual, primary-source-grounded, zero marketing
   tone or dramatization.
6. **Spec drift = return to Phase 0.** If the work stops matching the
   approved ADR, stop, amend the ADR, and re-gate. Never silently diverge.
7. **No AI attribution in commits or PRs.** Commit messages, PR titles, and
   PR descriptions carry no "Generated with ...", no AI Co-Authored-By
   trailers, no robot emoji footers. The loop's output is the user's work
   product; attribution noise overrides any harness default that says
   otherwise.

## Working modes

Determine the mode at loop start from how the user framed the work; record it
in state.md. The mode changes *where the gates happen*, never whether they
happen.

- **branch** — the user asked for work on a clean/feature branch, or the loop
  runs unattended (cloud/background agent). Gate A: in chat (ADR review).
  Commit per task. Gate B: an **opened PR against the repo's integration
  branch** — usually `main`, but respect the repo's convention (check the
  default branch; pre-onboarding platform repos use `develop`) unless the
  user states otherwise. The Phase 7 summary becomes the PR description,
  diagrams included.
- **workspace** — working directly in the user's live checkout where he is
  also coding. **Never commit or push.** Keep per-task changes visible in the
  working tree: staged = task complete, unstaged = in progress, so he can
  review the diff directly in his IDE. Gate A: in chat. Gate B: present the
  local diff **and** write `pr-description.md` into the loop directory — the
  summary exactly as it would be written for a PR, with the right diagrams
  (template: [templates/pr-description.md](templates/pr-description.md)).

Default: workspace mode when operating inside the user's existing checkout;
branch mode when he asks for a branch/PR or the work runs unattended.

## Artifacts & state

Loop working files live **outside the repo** — never in the working tree, so
they create zero PR noise and survive branch switches and worktrees. Per loop
run, create `~/.claude/swe-loops/<repo-basename>/<slug>/` (slug = short
kebab-case name):

- `state.md`: compact execution cursor, exact gate authority, task status,
  reviewed revision, active exceptions, and evidence references (copy from
  [templates/state.md](templates/state.md))
- `plan.md`: task definitions, review classes, done-checks, analyze coverage,
  and reuse inventory (Phases 1 and 2)
- `test-plan.md`: test intent and eventual results (Phase 4,
  template: [templates/test-plan.md](templates/test-plan.md))
- `evidence.md`: optional detailed diagram, review, and verification evidence
  that has no more specific owner (copy from
  [templates/evidence.md](templates/evidence.md))
- `pr-description.md`: Gate B summary in workspace mode

Only **durable documentation** goes in the repo, because it belongs in the
PR: the ADR and the architecture overview. The author-local loop path belongs
only in external `state.md`; never write it into a committed ADR or any other
repository document.

**ADR path resolution:** decide the location and filename before creating an
ADR. Follow this precedence order:

1. **Explicit direction** — follow a repository instruction or user choice.
2. **Existing convention** — inspect repository ADRs and preserve their
   directory and filename convention. Keep numbered filenames only when the
   repository already uses them.
3. **Descriptive fallback** — when no ADR convention exists, create
   `docs/architecture-decisions/<slug>.md`. Do not introduce a sequence number.

Create `docs/architecture-decisions/` only when neither an explicit location
nor an existing ADR directory is available. Never rename existing ADRs as part
of this resolution. Template: [templates/adr.md](templates/adr.md).

Architecture overview: maintain `docs/architecture.md` — a mermaid system
diagram of how the whole application connects. Create it on the first run in
a repo that lacks one; update it whenever a loop changes architecture.

**Resume rule:** if invoked and a state file for this work already exists,
read it first. Then load only the artifacts referenced by the active phase,
current task, or active exceptions. Do not load completed phase history by
default. Continue from the first incomplete boundary; never redo completed
phases or re-ask for a gate already granted. Exact gate wording in `state.md`
is the only durable approval authority.

**Repository `.ratchet/` work packages:** when `.ratchet/work-packages.yaml`
exists in the repository, it tracks multi-PR lanes and external human blockers
(`HD-xx` in `.ratchet/human-dependencies.md`) across sessions. If invoked for a
specific work package (`/swe-loop <WP-ID>`), scope the loop to that package,
build the documented `Unblock-with` safe default for any open `HD-xx` blocker,
and update `.ratchet/work-packages.yaml` at Gate B. See
[../work-packages/SKILL.md](../work-packages/SKILL.md).

## Phases

### Phase 0 — Design (ADR)

Start with the sibling [grilling skill](../grilling/SKILL.md) to improve the
agreement presented at Gate A. Invoke `ratchet:grilling` directly; the
`grill-me` entrypoint is for standalone, user-invoked interviews.

- Ground the interview in the user's brief, existing code, relevant documents,
  and decisions already settled in this conversation. Investigate facts before
  asking the user to decide; bring recommendations and concrete trade-offs.
- Ask about genuine ambiguity. A small change may need a short session; a
  detailed brief may leave no questions. Do not manufacture questions or repeat
  answered ones to satisfy an interview quota.
- Include the user in consequential technical choices: dependencies being
  introduced and why, module responsibilities and boundaries, failure handling,
  and, where relevant, retries, concurrency, and idempotency guarantees. Resolve
  what is guaranteed, under which conditions, and what happens when it fails.
- Use the skill's rounds to settle those decisions, then capture the agreement
  in the ADR below. The ADR is the design/specification produced by the
  interview; no separate spec or planning interview is required. Keep task
  planning in Phase 1, after Gate A.
- On resume, reuse settled decisions and the current ADR draft; continue only
  unresolved questions. Record open design questions in the draft and keep the
  execution cursor in `state.md`.
- Gate A approval of the resulting ADR also confirms the shared understanding
  required by `grilling`. Interview answers alone do not approve Gate A, and
  the interview introduces no additional approval gate.

Standalone `grill-me` or `grilling` does not activate this loop or inherit its
ADR, planning, integration, testing, or delivery requirements.

Do:
- Restate the problem in one paragraph.
- **Product and parity inventory (rebuilds, migrations, and replacements):**
  when the work replaces, migrates, or rebuilds an existing application,
  prototype, or workflow, record existing screens/modules, primary user
  journeys, high-value interactions, preserved behaviors, intentional
  removals, and source gaps being corrected so required parity items trace
  directly into the ADR and EARS criteria. For net-new work, record `n/a
  (net-new)`.
- **External contribution preflight (unowned repositories):** when the target
  repository belongs to an external open-source project, read
  `CONTRIBUTING.md`, issue templates, PR templates, and existing maintainer
  threads in Phase 0. Record assignment, design-approval, CLA, and branch
  rules in `state.md`. If upstream rules require maintainer approval or
  assignment before implementation, stop before coding; never post public
  issue comments or open an external PR without explicit user approval and
  satisfied upstream prerequisites.
- Before creating the ADR, inspect repository instructions and existing ADRs
  to resolve its path using the artifact-location precedence above. Record the
  selected convention in the ADR context when it materially affects review.
- Create the ADR with durable repository metadata only. External loop paths
  remain in `state.md` and never appear in the committed ADR.
- Develop the *real* alternatives. For architectural decisions, spawn 2–3
  **fresh-context subagents in parallel, each independently developing a
  distinct approach** (e.g. minimal / clean-architecture / pragmatic) —
  independent development prevents the strawman-options failure mode of one
  model listing choices it already half-decided between. For small
  decisions, inline enumeration with trade-offs is enough. Ground claims in
  primary sources (library docs, MS docs, deep-research) when the decision
  warrants it.
- Record the chosen option and why, per the ADR template.
- Write **acceptance criteria in EARS notation** — `WHEN <condition> THE
  SYSTEM SHALL <behavior>` — one per observable behavior the change must
  deliver. These become the spine of the Phase 4 test plan and the Phase 6
  drift check.
- Draw a mermaid diagram of the feature/change — communicate structure
  visually instead of a text blob. Follow
  [mermaid-guide.md](mermaid-guide.md): C4 discipline (one abstraction level,
  every element typed and labeled, every edge directional with intent +
  protocol, boundaries as styled subgraphs). Choose structural or narrative
  first, then choose GitHub-native or icon rendering. GitHub-native is the
  default; the icon track follows the guide's render-and-commit contract. If
  architecture changes, update `docs/architecture.md` in the same commit as
  the ADR.
- For every design diagram that exists before Gate A, render and inspect dark
  and light themes. Record purpose, archetype, rendering mode, source, both
  inspections, and the guide self-check result in `evidence.md`. Keep only
  the result and its durable evidence reference in `state.md`. A source-only
  diagram is not Gate A evidence.

Ordinary ADR, architecture-document, and PR diagrams stay on this Mermaid
path. Route to the sibling `diagram-loop` only when the user explicitly asks
for a premium, animated, publication-quality, website, hero, or explainer
visual in one of its five supported archetypes; `swe-loop` never invokes it
automatically.

Skills: grilling (design interview), write-as-dejan (prose),
graphify (codebase understanding),
deep-research / microsoft-docs (when the decision needs external grounding).

**Exit boundary (GATE A):** ADR written, both diagram themes inspected and
referenced, architecture doc updated if applicable, consequential design
questions resolved in the ADR, and the user has explicitly approved.
**No source-code edits are allowed before this gate,
none.** Record the user's approval wording in `state.md`; never infer it from
repository or CI state.

### Phase 1 — Plan

Do:
- Break the approved design into tasks. Each task = **one concern**, one
  reviewable unit with its own "done" check.
- **Review-effort budget** (not line counts — a rename can touch 40 files and
  still be trivial to review). Classify every task by what it demands from
  the reviewer:
  - **S (skim)** — purely mechanical: renames, moves, formatting, generated
    output. Any size, but must be pure — zero semantic edits hidden inside.
  - **M (sitting)** — a semantic change confined to one subsystem,
    reviewable in one sitting.
  - **L (loop)** — cross-cutting or architectural. Not allowed as a task:
    split it, or it becomes its own loop with its own ADR.
- **Mechanical and semantic changes never share a commit.** The expensive
  diff is not the big one — it's the one where 30 semantic lines hide inside
  a 2,000-line rename.
- **Generated content is exempt from review effort entirely** — lockfiles,
  generated API clients, snapshots, auto-generated migrations. Mark tasks
  that produce it as `generated` in plan.md so the reviewer knows to skip.
- Order tasks by dependency; write `plan.md`; set only task IDs, statuses, and
  the current pointer in `state.md`.
- **Analyze check — the pre-implementation drift gate.** Read-only
  cross-artifact check (fresh-context subagent when the plan is nontrivial):
  every ADR decision and every EARS criterion maps to at least one task;
  every task traces back to the ADR; nothing in the plan contradicts the ADR
  or the non-negotiables. Fix the plan now — drift caught here costs a plan
  edit; caught at Phase 6 it costs code.

**Exit boundary:** every task has a done-check and an S/M class; no L tasks
survive planning; mechanical and semantic work are separate tasks; the
analyze check passed with zero uncovered criteria.

### Phase 2 — Context & reuse inventory

Do:
- Read repo CLAUDE.md, `.claude/rules/`, and the coding standards
  (`.github/instructions/Coding-Standards.md` where present) before touching
  code.
- Write a **reuse inventory** into `plan.md`: which existing functions,
  datamodels, schemas, and utilities this work will use or extend. Search the
  codebase for existing implementations before planning any new one.
- For each new dependency: confirm it's needed, and that a maintained library
  isn't already doing this better than custom code would.

**Exit boundary:** reuse inventory written and referenced by `state.md`. An
*empty* inventory for a task touching existing domains is a red flag,
re-search before proceeding.

### Phase 3 — Implement

Do:
- One task at a time. Branch mode: commit per task with a clean message.
  Workspace mode: no commits — stage the task's files when it's done, leave
  in-progress work unstaged.
- For the bugfix profile, do not edit the production fix until the Phase 4
  test-intent boundary and failing reproduction are recorded. Follow the
  profile's explicit phase-order exception below.
- Minimal diff: never reformat, rename, or refactor code the task doesn't
  touch. Review capacity is the throughput bottleneck; every unnecessary
  changed line spends it.
- Leave existing documentation standing unless this change directly
  invalidates it — then fix it in the same task.
- Dependencies via resolver only (non-negotiable #4).

**Exit boundary (per task):** the task's unit (commit or staged set) contains
exactly one classifiable concern matching its S/M class from plan.md, with no
mechanical and semantic mixing; `git diff --stat` shows no unrelated file
churn. Update only the task status, current pointer, and evidence reference in
   `state.md`. Any source or test edit after a Phase 5 review pass, including a
   remediation made while Phase 5 is active, invalidates that pass, marks the
   last reviewed revision stale, and requires every review pass again on the new
   revision.

### Phase 4 — Test with intent

Do:
1. **Plan test intent.** Write `test-plan.md` first: what this change needs in terms of testing,
   including behaviors, edge cases, failure modes, integration surfaces, and
   what explicitly will not be tested and why. Start from the ADR's EARS
   criteria; each criterion maps to at least one test. A copied but empty
   template does not complete test intent. Every section needs concrete intent
   or an explicit `none` with a reason.
2. **Persist test intent.** Save the materially complete `test-plan.md`.
3. **Record the boundary.** Record the completed test-intent boundary and
   test-plan reference in `state.md`.
4. **Edit tests.** Only after the plan and state writes may test-code edits
   begin. The same agent turn may
   continue immediately; this is an artifact-ordering boundary, not a human
   checkpoint or required conversation pause.
   Implement the tests per plan. Tests assert behavior, not implementation
   details. Update their result and durable evidence in `test-plan.md` rather
   than copying output into `state.md`.
- **Test-level and quality discipline:** choose the cheapest level that proves
  the behavior (`unit`, `contract`, `integration`, `provider-replay`, `live`,
  `eval`). Use real domain objects for repository-owned code, narrow mocks only
  at external boundaries, small stateful fakes over mock call-order
  choreography, and deterministic events/futures instead of arbitrary sleeps in
  async tests. Use parametrization only for genuine decision tables, never to
  inflate test count. Prove each test can fail for its intended defect (via red
  reproduction on base revision for bugfixes, or focused mutation/negation for
  new behavior).
- Use the verify skill to exercise the affected flow end-to-end, not just
  unit tests.
- **Pre-review consolidation pass:** once the planned tests pass, run
  [../consolidate/SKILL.md](../consolidate/SKILL.md) and re-run the test suite
  before entering Phase 5.
- For genuinely high-risk work, a fresh-context review of the test plan is an
  available self-check before step 2. It is not mandatory for every task and
  never becomes a third human gate.

**Exit boundary:** `test-plan.md` and the state boundary existed before test
code was edited; every planned test is implemented or explicitly deferred
with a reason; consolidation pass completed and suite re-verified green.

### Phase 5 — Independent review

Do — in fresh-context subagents, never the implementing context:
- **Standards & anti-pattern pass:** subagent loads
  [anti-patterns.md](anti-patterns.md) plus the repo's coding standards and
  audits both the production diff and the test diff against them (verifying
  that proving tests use independent oracles, exercise real boundaries, avoid
  low-signal count padding, and carry zero semantic sediment).
- **Correctness pass:** run the code-review skill on the diff.
- **Zoom-out pass:** would a larger refactor, test factory, or architectural
  change increase simplicity or flow? Classify anything required for the
  approved design as a finding; it must be fixed or explicitly waived.
  Record non-blocking improvements separately as future-loop candidates in
  `evidence.md`; never auto-apply those observations because they are outside
  the approved change boundary.

**Exit boundary:** every finding is fixed or explicitly waived. A remediation
invalidates all review passes on the earlier revision, so repeat every pass
until they converge on one unchanged revision. Record that revision and the
evidence reference in `state.md`; in workspace mode record the base SHA and the
output of `git diff --binary HEAD | sha256sum`, which includes both staged and
unstaged tracked changes. The final reviewed revision must
equal the delivered revision. Keep only unresolved findings and active waivers
in state. Detailed resolved findings and non-blocking future-loop candidates
remain in `evidence.md`; a candidate is an observation, not an unresolved
finding or an additional exit disposition.

### Phase 6 — Verify against design

Do:
- Run the entire test suite.
- Cross-check the implementation against the ADR section by section — does
  what was built match what was approved? Verify every EARS criterion has a
  passing proving test and preserve the distinction between deterministic
  tests, recorded provider replay, live verification, and dataset evaluation.
  Confirm the architecture diagram is still accurate.
- If any diagram source changed after Gate A, render every changed diagram in
  dark and light, inspect the final pixels, repeat the guide self-check, and
  record the detail in `evidence.md`. When the repository provides a
  canonical render/check command, run it too. Passing syntax or CI never
  replaces the two visual inspections.

**Exit boundary:** suite green; changed diagrams have recorded final-theme
evidence; spec drift is zero, or the ADR was amended and the user informed
(non-negotiable #6). Keep the compact result and evidence reference in
`state.md`, not command output or copied verification detail.

### Phase 7 — Deliver & close

Do:
- Write the summary via write-as-dejan: what changed, manual testing if
  performed, architectural changes if any, review guide per task (S/M classes).
  Reference the ADR; include the right diagrams per
  [mermaid-guide.md](mermaid-guide.md). Keep automated commands, pass counts,
  and detailed results in `state.md`, `test-plan.md`, or loop evidence, then
  summarize their current result in the Gate B chat handoff. CI is the
  published source of automated check status, so do not copy those details
  into the PR description. Include a `Manual testing` section in the PR
  description only when hands-on verification produced evidence CI cannot
  expose; omit that section otherwise.
- **GATE B, per working mode:**
  - *branch* — open a PR against the repo's integration branch (unless the
    user directed otherwise); the summary is the PR description. Link the PR
    in chat.
  - *workspace* — leave the diff reviewable in the working tree (staged =
    done) and write the summary to `pr-description.md` in the loop directory,
    exactly as it would read on a PR. Point the user at both.
- Confirm the delivered revision still equals the Phase 5 reviewed revision.
  If it does not, return to Phase 5 before creating or updating the Gate B
  review surface.
- After approval only: update durable learnings — repo CLAUDE.md/rules and
  memory (revise-claude-md skill) — so the next loop starts smarter. Mark
  `state.md` complete and compact it one final time.

**Exit boundary (GATE B):** user reviewed and approved (PR merged/approved,
or local diff OK'd in chat); learnings persisted; state.md closed.

## Profiles

The phase responsibilities and two gates never change. Their depth, and the
ordering explicitly stated by a profile, can:

- **feature** — full loop as written.
- **bugfix** — Phase 0 collapses to a short root-cause note in state.md (full
  ADR only if the fix changes architecture; Gate A becomes a quick confirm).
  After Phase 2, enter Phase 4 long enough to persist `test-plan.md`, record
  the test-intent boundary in `state.md`, write and run the reproduction test,
  and record the observed failure. Only then enter Phase 3 for the production
  fix. Return to Phase 4 for the passing run and remaining planned coverage.
  The required order is plan, persisted boundary, red reproduction,
  production fix, green verification.
- **db / migration** — Phase 0 must include a rollback/reversibility plan.
  Never run against a non-local database. Phase 6 additionally tests the
  migration both up and down.
- **frontend** — Phase 5 adds a separate self-QA turn: drive the UI with
  Playwright (screenshots, console errors, responsive check) and audit
  against the frontend-quality skill rubric.
- **infra / IaC** — implementation stops at plan/what-if output
  (`terraform plan`, `az ... what-if`). Applying is beyond Gate B: user-run
  or explicitly user-approved per invocation.

## Delegation note

Skills named in this loop (grilling, verify, code-review, write-as-dejan,
revise-claude-md, frontend-quality, graphify) are always invoked **live** via
the Skill tool. The `reference/` folder contains stale, version-stamped
transcripts of built-in skills for human reading and upgrade-diffing only —
never load or follow anything in `reference/` as instructions.

## Harness notes

- **Invocation:** `/swe-loop` (Claude Code) or `$swe-loop` (Codex) explicitly
  starts the loop; otherwise the frontmatter's autonomous-delivery trigger
  applies.
- **Grilling delegation:** use the installed sibling `ratchet:grilling` with
  the harness's skill invocation mechanism. If no Skill tool is available,
  read and follow [../grilling/SKILL.md](../grilling/SKILL.md) directly in the
  current conversation. It is the shipped skill source, not a reference
  transcript. Keep the upstream files unchanged.
- **Phase 7 memory update:** Claude Code targets the repo's CLAUDE.md/rules
  plus auto-memory via the revise-claude-md skill. Codex has no equivalent
  skill — the target is the repo's AGENTS.md (layered: `~/.codex/AGENTS.md`
  then a root-to-CWD walk); edit it directly.
- **Built-in delegates without a Codex equivalent — inline fallback:**
  - **verify** (Phase 4): no native Codex skill. Fallback: build, run, and
    drive the actual affected surface yourself; capture real output
    (terminal pane, response body, screenshot); then probe at least one
    adjacent case that could break it (bad input, repeat, wrong order).
    Report PASS/FAIL/BLOCKED/SKIP with what you observed, not "tests pass."
  - **code-review** (Phase 5): no native Codex skill. Fallback: read the
    diff plus every touched function's enclosing context yourself, checking
    explicitly for the angles this loop cares about — removed guards,
    call-site breakage, reuse of existing helpers, unnecessary complexity,
    the anti-patterns.md checklist — rather than a general impression pass.
  - **graphify**, **deep-research**, **microsoft-docs**, **frontend-quality**
    (Phase 0/5, situational): Claude Code plugin conveniences. Codex
    fallback is doing the equivalent research or QA pass directly with your
    own web-search/browser-driving capability; no separate skill required.
- **Subagent delegation** (Phase 0 parallel alternatives, Phase 5
  fresh-context review): both harnesses support this natively — Claude
  Code's Agent tool/subagents, Codex's GA subagents including custom agents
  under `.codex/agents/`. No fallback needed, only harness-native syntax.

## Known limits (v1)

- Safety rules here are instructions; hard enforcement needs settings.json
  deny rules / hooks — set up separately.
- Per-repo profile tuning and plugin packaging (for reuse across Claude Code
  and other coding agents) are planned iterations, not part of v1.
