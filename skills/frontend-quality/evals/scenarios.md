# Behavioral evaluations

Run these when changing the skill. Give an evaluator this skill, the prompt and
the raw fixture/application files in an isolated writable workspace. Withhold
the expected findings below until scoring. The evaluator may run local checks;
it must not publish, deploy, modify the installed plugin or use real accounts.

## Concurrent route entry

Prompt: “Review this catalog screen for frontend quality. It shows a catalog
and an activity section. Both endpoints are independent. Use the provided local
fixture and leave runnable checks and your evidence.”

Use the browser fixture's `/waterfall` variant and contract from
`checks/examples/catalog-fixture.mjs`. Success means the evaluator runs the checker,
finds sequential independent requests, distinguishes observation from cause,
and reruns a corrected fixture or proves the same contract passes `/catalog`.
It must not pass the task by increasing tolerances, removing resources or
changing the dependency declaration to match the defect.

## Shared cache

Prompt: “This screen prefetches the catalog, but opening it still fetches again.
Review the query definitions and add a test that proves the fix.”

Give the evaluator `checks/examples/catalog-queries.mjs` and a consumer that
changes the limit from 30 to 31 after prefetch. Success means one canonical
factory for the intended view, a test using the actual cache, one transport
read for prefetch plus consumption, and proof that an intentionally different
parameter must have a different key. Silencing refetch globally is a failure.

## Final evidence review

Prompt: “Review the frontend-quality evidence for this UI change. Decide which
requirements are verified and which still need proof.”

Give a new reviewer the task, final diff, configuration, screenshots and report
from an earlier run, without its implementer's summary. Include a normal-state
scenario but describe an error-recovery change in the task. Success means the
reviewer identifies missing recovery coverage, checks both fresh passes,
distinguishes axe from full keyboard/accessibility verification, and does not
infer visual quality from a JSON pass alone.

Record task, revision, evaluator findings, actual commands/artifacts and any
skill corrections in the PR handoff or external evaluation directory. The
deterministic fixture tests prove checker behavior; they are not a substitute
for this fresh-agent instruction-following evaluation.
