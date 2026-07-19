# Anti-pattern checklist ("lazy coding")

Loaded by the Phase 5 standards subagent. Audit the diff against every item;
report each hit with file:line and a concrete fix. This list grows over time —
when a new failure mode is caught in review, add it here.

## Reuse & reinvention

- [ ] New function duplicates behavior of an existing one — search the
      codebase for existing implementations before accepting any new helper.
- [ ] New ad-hoc dict/shape where a well-thought-out datamodel or schema
      already exists — reuse or extend the existing model, never fork a
      parallel variant.
- [ ] Custom implementation of something a maintained library in the stack
      already does better (retries, validation, serialization, date handling,
      HTTP, auth flows).

## Standards

- [ ] Missing or nonconforming docstrings per the repo's coding standards
      (`.github/instructions/Coding-Standards.md` where present).
- [ ] All routes crammed into one Python file / god modules — respect the
      repo's module layout; split by domain.
- [ ] Untyped or weakly-typed code where the standards require typing
      (pyright-clean, no bare dicts passed across boundaries).

## Dependencies

- [ ] Hand-written version pins (LLM internal knowledge is stale — versions
      come from the resolver: `uv add`, `npm install <pkg>`).
- [ ] A dependency added, written, or changed without confirming it is the
      actual latest stable release.

## Diff hygiene

- [ ] Churn: reformatting, renaming, or "improving" code the task doesn't
      touch.
- [ ] Documentation edited that the change didn't directly invalidate.

## Testing

- [ ] Tests that assert implementation details instead of behavior.
- [ ] Tests written to pass rather than to probe — no edge cases, no failure
      modes, happy path only.

## Error handling

- [ ] Swallowed exceptions, bare `except`, or errors logged-and-ignored where
      the caller needs to know.
