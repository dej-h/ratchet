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

## Diff hygiene & semantic sediment

- [ ] Churn: reformatting, renaming, or "improving" code the task doesn't
      touch.
- [ ] Documentation edited that the change didn't directly invalidate.
- [ ] Prompt echoing or transition narration in comments, docstrings, or test
      names (`"Previously X, now Y"`, `"Fixed issue..."`, names derived from
      prompt wording instead of the domain model). The code and docs must read
      as if the final architecture had been known from the beginning.
- [ ] Redundant comments that restate the code rather than explaining a
      non-obvious invariant, constraint, or hazard.
- [ ] Transitional scaffolding, single-use wrapper helpers, or dead
      compatibility branches left over from iterative debugging.

## Testing

- [ ] Tests that assert implementation details or mock call-order choreography
      instead of observable behavior at a real boundary.
- [ ] Low-signal filler tests (`isinstance`, `is not None`, copied constants,
      or testing the framework/Pydantic instead of repository logic).
- [ ] Parametrized or duplicated test cases added to inflate test count without
      covering a distinct production failure mode.
- [ ] Tests written to pass rather than to probe — no edge cases, no failure
      modes, happy path only, or mocking out the exact boundary the test claims
      to prove.

## Error handling

- [ ] Swallowed exceptions, bare `except`, or errors logged-and-ignored where
      the caller needs to know.
