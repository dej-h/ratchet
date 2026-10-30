# <imperative title — what this change does>

ADR: <link to resolved ADR path>

## What changed

The problem and the final behavior, for a reviewer who has not seen the
conversation; not the journey. write-as-dejan register.

## Architecture

Only if applicable. Feature-overview diagram per mermaid-guide.md; note the
delta to `docs/architecture.md` if the overall picture moved.

```mermaid
%% structure or sequence diagram — whichever answers the reviewer's
%% actual question about this change
```

## Manual testing

Include this section only for hands-on verification that CI cannot expose:
browser flows, provider-backed requests, device behavior, or
live-environment checks. State what was observed, not the local command or
pass count. Delete this section entirely when no hands-on verification was
performed.

-

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
