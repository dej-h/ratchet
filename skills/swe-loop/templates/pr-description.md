# <imperative title — what this change does>

ADR: <link to docs/architecture-decisions/NNN-<slug>.md>

## What changed

Dense summary — the change itself, not the journey. write-as-dejan register.

## Architecture

Only if applicable. Feature-overview diagram per mermaid-guide.md; note the
delta to `docs/architecture.md` if the overall picture moved.

```mermaid
%% structure or sequence diagram — whichever answers the reviewer's
%% actual question about this change
```

## What was tested

From test-plan.md: behaviors covered, edge cases, what was explicitly not
tested and why. Full-suite result.

## Review guide

Where to spend attention, per task:

| Task | Class | What to look at |
|------|-------|-----------------|
| <name> | S — mechanical | skim: pure rename/move, no semantics |
| <name> | M — semantic | <the actual logic worth reading> |
| <name> | generated | skip: lockfile / generated client |

## Notes

Waivers, known limitations, recorded zoom-out findings that became candidate
future loops.
