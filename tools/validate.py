"""Structural CI validator for the ratchet plugin repo.

Checks the things that are cheap to check deterministically and stdlib-only:
manifests parse, the four manifests agree on plugin name and version, and
every shipped SKILL.md carries the required frontmatter.

This is deliberately NOT a substitute for the real per-harness validators.
Run ``claude plugin validate .`` locally before tagging a release - it is
the authoritative check for the Claude Code side and catches things this
script does not (e.g. it rejected root-level ``$schema``/``description`` in
marketplace.json during this repo's own bootstrap). There is no known
equivalent Codex CLI check available yet; the Codex manifests here are
schema-grounded but unverified against a real Codex install.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATHS = {
    "claude_plugin": Path(".claude-plugin") / "plugin.json",
    "claude_marketplace": Path(".claude-plugin") / "marketplace.json",
    "codex_plugin": Path(".codex-plugin") / "plugin.json",
    "codex_marketplace": Path(".agents") / "plugins" / "marketplace.json",
}


class ValidationError(Exception):
    """Raised for any failed check; the message is the failure reason."""


def load_json(path: Path, repo_root: Path) -> dict[str, Any]:
    """Parse a manifest file as JSON, raising ValidationError on failure."""
    full_path = repo_root / path
    if not full_path.exists():
        raise ValidationError(f"missing manifest: {path}")
    try:
        loaded = json.loads(full_path.read_text())
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(loaded, dict):
        raise ValidationError(f"{path}: top-level JSON value must be an object")
    return loaded


def required_field(manifest: dict[str, Any], field: str, path: Path) -> str:
    """Read a required string field from a manifest, raising ValidationError if absent."""
    value = manifest.get(field)
    if not isinstance(value, str) or not value:
        raise ValidationError(f"{path}: missing or empty required field '{field}'")
    return value


def plugin_entry(marketplace: dict[str, Any], plugin_name: str, path: Path) -> dict[str, Any]:
    """Find a plugin's entry inside a marketplace.json's plugins array."""
    for entry in marketplace.get("plugins", []):
        if isinstance(entry, dict) and entry.get("name") == plugin_name:
            return entry
    raise ValidationError(f"{path}: no plugins[] entry named '{plugin_name}'")


def check_manifests_consistent(repo_root: Path) -> list[str]:
    """Verify all four manifests parse and agree on name and version."""
    findings: list[str] = []
    manifests = {key: load_json(path, repo_root) for key, path in MANIFEST_PATHS.items()}

    cc_plugin = manifests["claude_plugin"]
    cc_name = required_field(cc_plugin, "name", MANIFEST_PATHS["claude_plugin"])
    cc_entry = plugin_entry(
        manifests["claude_marketplace"], cc_name, MANIFEST_PATHS["claude_marketplace"]
    )
    cx_plugin = manifests["codex_plugin"]
    cx_name = required_field(cx_plugin, "name", MANIFEST_PATHS["codex_plugin"])
    cx_entry = plugin_entry(
        manifests["codex_marketplace"], cx_name, MANIFEST_PATHS["codex_marketplace"]
    )

    names = {cc_name, cc_entry.get("name"), cx_name, cx_entry.get("name")}
    if len(names) != 1:
        findings.append(f"plugin name mismatch across manifests: {sorted(str(n) for n in names)}")

    versions = {
        required_field(cc_plugin, "version", MANIFEST_PATHS["claude_plugin"]),
        cc_entry.get("version"),
        required_field(cx_plugin, "version", MANIFEST_PATHS["codex_plugin"]),
        cx_entry.get("version"),
    }
    if len(versions) != 1:
        findings.append(
            f"plugin version mismatch across manifests: {sorted(str(v) for v in versions)}"
        )

    return findings


def _is_yaml_ish(line: str) -> bool:
    """True when a line plausibly belongs inside a frontmatter block."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return True
    if line.startswith((" ", "\t")):
        return True  # continuation of a folded/indented value
    key = line.partition(":")[0].strip()
    return ":" in line and bool(key) and " " not in key


def parse_frontmatter(text: str) -> dict[str, str] | None:
    """Extract YAML-ish frontmatter as a flat key mapping, or None if malformed.

    Line-based on purpose. The closing delimiter must be a line that is
    exactly ``---`` (trailing whitespace allowed), AND every line between the
    delimiters must plausibly be YAML (key/value, indented continuation,
    comment, or blank). That second condition is what stops a never-closed
    frontmatter from borrowing a markdown horizontal rule further down the
    body as its "closing" delimiter: the prose between them fails the
    YAML-ish test and the whole block is rejected as malformed.
    """
    lines = text.splitlines()
    if not lines or lines[0].rstrip() != "---":
        return None
    for index, line in enumerate(lines[1:], start=1):
        if line.rstrip() == "---":
            block = lines[1:index]
            if not all(_is_yaml_ish(raw) for raw in block):
                return None
            keys: dict[str, str] = {}
            for position, raw in enumerate(block):
                if ":" in raw and not raw.startswith((" ", "\t", "#")):
                    key, _, value = raw.partition(":")
                    value = value.strip()
                    if value in {">", "|", ">-", "|-", ">+", "|+"}:
                        continuation = []
                        for follower in block[position + 1 :]:
                            if follower.startswith((" ", "\t")):
                                continuation.append(follower.strip())
                            elif follower.strip():
                                break
                        value = " ".join(continuation)
                    keys[key.strip()] = value
            return keys
    return None


def check_skill_frontmatter(repo_root: Path) -> list[str]:
    """Verify every skills/*/SKILL.md has name + description frontmatter."""
    findings: list[str] = []
    skill_files = sorted((repo_root / "skills").glob("*/SKILL.md"))
    if not skill_files:
        return ["no skills/*/SKILL.md files found"]

    for skill_file in skill_files:
        rel = skill_file.relative_to(repo_root)
        frontmatter = parse_frontmatter(skill_file.read_text())
        if frontmatter is None:
            findings.append(f"{rel}: frontmatter missing or never closed with a '---' line")
            continue
        for field in ("name", "description"):
            if not frontmatter.get(field, "").strip():
                findings.append(f"{rel}: frontmatter missing '{field}'")

    return findings


def check_adr_exists(repo_root: Path) -> list[str]:
    """Sanity check: at least one ADR exists (this repo should never ship without one)."""
    adr_dir = repo_root / "docs" / "architecture-decisions"
    if not adr_dir.exists() or not list(adr_dir.glob("*.md")):
        return ["no ADR found under docs/architecture-decisions/"]
    return []


def run_checks(repo_root: Path) -> list[str]:
    """Run all checks against a repo root and return the combined findings."""
    findings: list[str] = []
    for check in (check_manifests_consistent, check_skill_frontmatter, check_adr_exists):
        try:
            findings.extend(check(repo_root))
        except ValidationError as exc:
            findings.append(str(exc))
    return findings


def main() -> int:
    """Run all checks, print a PASS/FAIL report, return the process exit code."""
    findings = run_checks(REPO_ROOT)

    if findings:
        print("FAIL")
        for finding in findings:
            print(f"  - {finding}")
        return 1

    print("PASS: manifests consistent, SKILL.md frontmatter present, ADR present.")
    print("Reminder: run 'claude plugin validate .' locally for the authoritative")
    print("Claude Code check - this script does not replace it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
