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

REPO_ROOT = Path(__file__).resolve().parent.parent

MANIFESTS = {
    "claude_plugin": REPO_ROOT / ".claude-plugin" / "plugin.json",
    "claude_marketplace": REPO_ROOT / ".claude-plugin" / "marketplace.json",
    "codex_plugin": REPO_ROOT / ".codex-plugin" / "plugin.json",
    "codex_marketplace": REPO_ROOT / ".agents" / "plugins" / "marketplace.json",
}


class ValidationError(Exception):
    """Raised for any failed check; the message is the failure reason."""


def load_json(path: Path) -> dict:
    """Parse a manifest file as JSON, raising ValidationError on failure."""
    if not path.exists():
        raise ValidationError(f"missing manifest: {path.relative_to(REPO_ROOT)}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid JSON in {path.relative_to(REPO_ROOT)}: {exc}") from exc


def plugin_entry(marketplace: dict, plugin_name: str) -> dict:
    """Find a plugin's entry inside a marketplace.json's plugins array."""
    for entry in marketplace.get("plugins", []):
        if entry.get("name") == plugin_name:
            return entry
    raise ValidationError(f"marketplace has no entry named '{plugin_name}'")


def check_manifests_consistent() -> list[str]:
    """Verify all four manifests parse and agree on name and version."""
    findings: list[str] = []
    manifests = {key: load_json(path) for key, path in MANIFESTS.items()}

    cc_plugin = manifests["claude_plugin"]
    cc_entry = plugin_entry(manifests["claude_marketplace"], cc_plugin["name"])
    cx_plugin = manifests["codex_plugin"]
    cx_entry = plugin_entry(manifests["codex_marketplace"], cx_plugin["name"])

    names = {cc_plugin.get("name"), cc_entry.get("name"), cx_plugin.get("name"), cx_entry.get("name")}
    if len(names) != 1:
        findings.append(f"plugin name mismatch across manifests: {names}")

    versions = {
        cc_plugin.get("version"),
        cc_entry.get("version"),
        cx_plugin.get("version"),
        cx_entry.get("version"),
    }
    if len(versions) != 1:
        findings.append(f"plugin version mismatch across manifests: {versions}")

    return findings


def check_skill_frontmatter() -> list[str]:
    """Verify every skills/*/SKILL.md has name + description frontmatter."""
    findings: list[str] = []
    skills_dir = REPO_ROOT / "skills"
    skill_files = sorted(skills_dir.glob("*/SKILL.md"))
    if not skill_files:
        findings.append("no skills/*/SKILL.md files found")
        return findings

    for skill_file in skill_files:
        text = skill_file.read_text()
        rel = skill_file.relative_to(REPO_ROOT)
        if not text.startswith("---"):
            findings.append(f"{rel}: missing opening frontmatter delimiter")
            continue
        end = text.find("\n---", 3)
        if end == -1:
            findings.append(f"{rel}: missing closing frontmatter delimiter")
            continue
        frontmatter = text[3:end]
        if "name:" not in frontmatter:
            findings.append(f"{rel}: frontmatter missing 'name'")
        if "description:" not in frontmatter:
            findings.append(f"{rel}: frontmatter missing 'description'")

    return findings


def check_adr_exists() -> list[str]:
    """Sanity check: at least one ADR exists (this repo should never ship without one)."""
    adr_dir = REPO_ROOT / "docs" / "architecture-decisions"
    if not adr_dir.exists() or not list(adr_dir.glob("*.md")):
        return ["no ADR found under docs/architecture-decisions/"]
    return []


def main() -> int:
    """Run all checks, print a PASS/FAIL report, return the process exit code."""
    all_findings: list[str] = []
    for check in (check_manifests_consistent, check_skill_frontmatter, check_adr_exists):
        try:
            all_findings.extend(check())
        except ValidationError as exc:
            all_findings.append(str(exc))

    if all_findings:
        print("FAIL")
        for finding in all_findings:
            print(f"  - {finding}")
        return 1

    print("PASS: manifests consistent, SKILL.md frontmatter present, ADR present.")
    print("Reminder: run 'claude plugin validate .' locally for the authoritative")
    print("Claude Code check - this script does not replace it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
