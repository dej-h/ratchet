# Changelog

## 0.1.0 (2026-07-19)

Initial release. Bootstraps the repo per ADR 001 (single skills tree, dual
native manifests, no build step).

- Added `swe-loop` skill, verbatim from `~/.claude/skills/swe-loop/`, plus an
  additive Harness notes section for Codex parity (invocation syntax,
  memory-file target, inline fallbacks for Claude-only built-in delegates).
- Added `write-as-dejan` skill, verbatim from
  `~/.claude/skills/write-as-dejan/`.
- Added Claude Code plugin and marketplace manifests, validated with
  `claude plugin validate .`.
- Added Codex plugin and marketplace manifests, grounded in published docs;
  not yet verified against a real Codex install.
- Added a structural CI validator (`tools/validate.py`, stdlib only) and a
  GitHub Actions workflow running it on push and PR.
- Added version-stamped transcripts of the Claude Code built-in `verify`,
  `code-review`, and `simplify` skills under `docs/reference/`, for human
  reading and upgrade-diffing only.
