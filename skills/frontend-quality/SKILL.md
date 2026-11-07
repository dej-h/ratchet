---
name: frontend-quality
description: >
  Build and review usable, visually consistent frontends with executable browser
  and data-loading checks. Use for visible UI changes, frontend data loading,
  interaction work, responsive fixes, and frontend review, including frontend
  portions of a larger feature. Preserves the application's brand and framework.
---

# Frontend quality

Every visible element should help someone understand state, decide, or act.
Apply this skill while building and verify the rendered result before finishing.
It is self-contained: no external frontend skill, brand bundle, router, or form
template is required. Use the target application's existing stack and identity.

## Establish the contract

Inspect the affected screen, related screens, routes, data ownership and existing
checks. State the audience, task, primary action, and visual elements the user
wants retained. Read [the quality rubric](references/rubric.md); select the
affected states and interactions rather than creating an unrelated redesign.

For data-loading work, also read [data loading](references/data-loading.md).
Declare independent resources and genuine dependencies before choosing loaders
or endpoints. Start independent work together, reuse canonical query definitions,
and isolate section loading. A prerequisite for permissions stays a prerequisite.

Choose proof for each applicable requirement: an executable assertion, a rendered
comparison, or a named reviewer judgment. Record an explicit reason for anything
not applicable or blocked. An automated pass cannot establish visual hierarchy,
good copy, or workflow suitability on its own.

## Implement and check

Use [verification](references/verification.md) to configure and run the bundled
checks against the actual affected routes and states. The runner captures two
fresh-browser passes, screenshots, accessibility violations, page overflow,
browser errors, and request-contract results. Data-loading scenarios additionally
check required requests, canonical parameters, duplicates, declared dependency
depth, and overlap of independent requests under network throttling.

Add application-specific interaction assertions through each scenario's
`exercise` callback: keyboard behavior, focus, meaningful state transitions,
preserved input, count-to-destination agreement, or whatever the change affects.
The example is a small catalog screen, not a product scaffold. Replace its
resources and assertions with the application's contract; do not copy its domain.

For TanStack Query consumers, use the bundled ESLint policy and upstream query
lint rules described in [data loading](references/data-loading.md). For other
stacks, enforce the same ownership and cache invariants through their existing
tools. Do not install a new router or query framework just to satisfy this skill.

## Verify a second time

Fix findings and rerun the affected checks on the final revision. Both browser
passes must succeed; one successful run does not cancel a later failure. They
retest invariants in fresh contexts and do not prove warm-cache navigation.
Test prefetch and cache reuse within one session as a separate interaction.

Then have a fresh reviewer inspect the contract, final diff, screenshots and
report, with enough product context to judge the rubric. Give the reviewer the
task and raw evidence, not the implementer's conclusions. They check whether
the scenarios cover the affected routes, states and keyboard interactions, and
whether the assertions would fail for the intended regression. Use a separate
agent when available; otherwise perform a distinct review pass and disclose the
lack of independent review. Do not claim full verification while required checks
or this review remain blocked.

Report observed failures, fixes, remaining limitations and evidence locations.
Keep screenshots and runtime reports in the application's existing test-artifact
location or an external run directory, never in the installed plugin tree.

## Integration and maintenance

In `swe-loop`, this applies to every frontend portion of the work regardless of
profile: contract before implementation, executable checks during testing,
independent evidence review in Phase 5, and verification on the delivered revision.
It adds no human approval gate and does not activate `swe-loop` by itself.

To evaluate changes to this skill, use [the behavioral evaluations](evals/scenarios.md)
in isolated workspaces. The package's deliberately defective browser fixtures and
query-cache tests provide failure proof; the fresh-agent evaluation checks whether
the instructions lead an agent to use those mechanisms correctly.
