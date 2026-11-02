# Native GitHub stack delivery

Use native GitHub PR stacks for branch-mode loops whose dependent changes
need several reviewable slices across components or systems. Keep a single
PR for a bounded change and separate PRs for independent changes. Workspace
mode still stages local work without committing or publishing.

A native stack belongs to one repository. For work spanning repositories,
create a stack only where that repository needs dependent slices, then link
the stacks and standalone PRs through the delivery plan and work-package DAG.
Record cross-repository merge, deployment, and compatibility prerequisites;
GitHub cannot enforce or propagate changes across those boundaries.

## Slice and publish

Choose whole-feature slices that remain understandable and safe to merge on
their own. A slice can contain several task commits; do not split merely by
file type or line count. Put shared contracts below their consumers and keep
intermediate behavior additive or opt-in. Preserve explicit live-verification
and activation packages from the work-package plan.

Before publishing, confirm the integration branch and fetch its current head.
Keep stack history linear. The bottom branch starts at the integration branch;
each subsequent branch starts at the preceding slice's head and its PR targets
that branch. Preserve unrelated dirty work in an isolated checkout.

Prefer GitHub's `gh stack` extension. Check its installed help and the
[current CLI documentation](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands)
before choosing commands. The usual sequence is:

```bash
gh stack init feature/contracts
# Implement, test, and commit the first slice.
gh stack add feature/service
# Implement, test, and commit the next slice; repeat as needed.
gh stack submit
```

Check the publication flags before submitting: each PR needs its own focused
description and any blocked activation PR must remain draft. If the extension
is unavailable, use the documented
[stack REST API](https://docs.github.com/en/rest/pulls/stacks) to register the
ordered PRs after creating and pushing their branches. Branches that merely
target one another are not yet a registered native GitHub stack. Verify the
persisted stack membership, branch heads, and base relationships on GitHub.

When the repository has `.ratchet/`, commit each slice's delivered work-package
update before publishing through either path. Inspect every branch's ledger
diff; an update on the top branch alone does not complete the lower slices.

Record the repository, stack URL or ID, ordered PR URLs, branch heads,
work-package mapping, and cross-repository prerequisites in `plan.md`.
Each PR description explains its own behavior and prerequisites. The Gate B
handoff links the complete delivery set and distinguishes local checks, CI,
merged changes, and verified deployments.

## Propagate fixes upward

Pushing a commit to a lower branch does not update the branches above it.
Make the fix in the slice that owns the behavior, then cascade it upward:

```bash
gh stack checkout feature/contracts
# Fix, test, and commit in the owning slice.
gh stack rebase --upstack
gh stack push
```

In an active SWE loop, record permission to publish and rewrite its branches
at Gate A. In a standalone work-package session, use the user's existing
publication and maintenance authorization and record it in the delivery plan;
do not activate a loop just to obtain Gate A. That permission permits the
leased history updates needed for stack maintenance; it does not permit
rewriting unrelated branches or merging PRs. Save recovery heads before
rebasing published work. Use exact
`--force-with-lease=<ref>:<expected-old-head>` values for manual pushes, and
stop on a lease failure to inspect concurrent changes. Never use an unleased
force push. The extension's push uses force-with-lease; inspect its behavior
before relying on it for an existing published stack.

Check that every higher branch contains the fix and retains its intended
incremental diff. Run the affected checks on the owning slice and its
consumers. During a SWE loop, a rebase changes delivered revisions:
re-establish Phase 5 review evidence for each changed head and complete Phase 6
before updating Gate B.

## Merge and release

For staged releases, merge the lowest open PR after its checks and required
approvals pass. GitHub automatically rebases and retargets the remaining stack
after a bottom PR merges; it does not automatically merge those higher PRs.
Merging a higher PR also merges all unmerged layers below it, so never use
that action to cross an outstanding deployment or human-verification gate.

Keep cross-repository release order explicit, retain dark-launch defaults,
and obtain the existing merge or deployment authority before taking either
action. Publishing or maintaining a stack supplies no such authority. Once
GitHub updates the remote stack, sync local branches before further work.

Sources: GitHub's [stack introduction](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs),
[stack maintenance](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests),
and [stack creation](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-stacked-pull-requests).
