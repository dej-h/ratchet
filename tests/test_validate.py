"""Tests for tools/validate.py.

Every failure case here is either a reviewer-reproduced bug from this repo's
own Phase 5 review (KeyError crash, never-closed-frontmatter false PASS) or
a check the validator explicitly claims to make. Fixture repos are built in
tmp_path so the tests never depend on this repo's own current state.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.validate import parse_frontmatter, run_checks

PLUGIN_NAME = "ratchet"
VERSION = "0.1.0"


def build_fixture_repo(root: Path) -> None:
    """Create a minimal repo layout that passes every check."""
    (root / ".claude-plugin").mkdir(parents=True)
    (root / ".codex-plugin").mkdir(parents=True)
    (root / ".agents" / "plugins").mkdir(parents=True)
    (root / "skills" / "demo").mkdir(parents=True)
    (root / "docs" / "architecture-decisions").mkdir(parents=True)

    plugin = {"name": PLUGIN_NAME, "version": VERSION}
    marketplace = {
        "name": PLUGIN_NAME,
        "plugins": [{"name": PLUGIN_NAME, "version": VERSION, "source": "./"}],
    }
    (root / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin))
    (root / ".claude-plugin" / "marketplace.json").write_text(json.dumps(marketplace))
    (root / ".codex-plugin" / "plugin.json").write_text(json.dumps(plugin))
    (root / ".agents" / "plugins" / "marketplace.json").write_text(json.dumps(marketplace))

    (root / "skills" / "demo" / "SKILL.md").write_text(
        "---\nname: demo\ndescription: a demo skill\n---\n\n# Demo\n"
    )
    (root / "docs" / "architecture-decisions" / "001-demo.md").write_text("# ADR 001\n")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A fixture repo that passes all checks before each test mutates it."""
    build_fixture_repo(tmp_path)
    return tmp_path


def rewrite_json(path: Path, mutate) -> None:
    """Load, mutate, and rewrite a JSON file."""
    data = json.loads(path.read_text())
    mutate(data)
    path.write_text(json.dumps(data))


class TestPassingRepo:
    def test_clean_repo_has_no_findings(self, repo: Path) -> None:
        assert run_checks(repo) == []

    def test_folded_scalar_description_is_accepted(self, repo: Path) -> None:
        """'description: >' with continuation lines is valid frontmatter (swe-loop uses it)."""
        (repo / "skills" / "demo" / "SKILL.md").write_text(
            "---\nname: demo\ndescription: >\n  folded scalar\n  over two lines\n---\n\n# Demo\n"
        )
        assert run_checks(repo) == []


class TestManifestConsistency:
    def test_version_mismatch_is_reported(self, repo: Path) -> None:
        rewrite_json(
            repo / ".codex-plugin" / "plugin.json",
            lambda d: d.update(version="9.9.9"),
        )
        findings = run_checks(repo)
        assert any("version mismatch" in finding for finding in findings)

    def test_name_mismatch_is_reported(self, repo: Path) -> None:
        rewrite_json(
            repo / ".agents" / "plugins" / "marketplace.json",
            lambda d: d["plugins"][0].update(name=PLUGIN_NAME),
        )
        rewrite_json(
            repo / ".codex-plugin" / "plugin.json",
            lambda d: d.update(name=PLUGIN_NAME.upper()),
        )
        findings = run_checks(repo)
        # The renamed codex plugin no longer matches its marketplace entry.
        assert findings, "expected findings for a name mismatch"

    def test_missing_name_is_a_finding_not_a_crash(self, repo: Path) -> None:
        """Reviewer repro: deleting 'name' must not raise a raw KeyError."""
        rewrite_json(
            repo / ".claude-plugin" / "plugin.json",
            lambda d: d.pop("name"),
        )
        findings = run_checks(repo)  # must not raise
        assert any("required field 'name'" in finding for finding in findings)

    def test_missing_manifest_file_is_a_finding(self, repo: Path) -> None:
        (repo / ".codex-plugin" / "plugin.json").unlink()
        findings = run_checks(repo)
        assert any("missing manifest" in finding for finding in findings)

    def test_invalid_json_is_a_finding(self, repo: Path) -> None:
        (repo / ".claude-plugin" / "marketplace.json").write_text("{not json")
        findings = run_checks(repo)
        assert any("invalid JSON" in finding for finding in findings)


class TestSkillFrontmatter:
    def test_missing_opening_delimiter_is_reported(self, repo: Path) -> None:
        (repo / "skills" / "demo" / "SKILL.md").write_text("# no frontmatter here\n")
        findings = run_checks(repo)
        assert any("frontmatter missing or never closed" in finding for finding in findings)

    def test_never_closed_frontmatter_with_body_hr_is_rejected(self, repo: Path) -> None:
        """Reviewer repro: an unclosed frontmatter must not borrow a body horizontal rule."""
        (repo / "skills" / "demo" / "SKILL.md").write_text(
            "---\n"
            "name: demo\n"
            "description: looks fine\n"
            "\n"
            "This prose means the frontmatter never closed.\n"
            "\n"
            "---\n"
            "name: decoy after the horizontal rule\n"
        )
        findings = run_checks(repo)
        assert any("never closed" in finding for finding in findings)

    def test_missing_description_is_reported(self, repo: Path) -> None:
        (repo / "skills" / "demo" / "SKILL.md").write_text("---\nname: demo\n---\nbody\n")
        findings = run_checks(repo)
        assert any("missing 'description'" in finding for finding in findings)

    def test_empty_skills_dir_is_reported(self, repo: Path) -> None:
        (repo / "skills" / "demo" / "SKILL.md").unlink()
        findings = run_checks(repo)
        assert any("no skills/*/SKILL.md" in finding for finding in findings)


class TestAdrPresence:
    def test_missing_adr_is_reported(self, repo: Path) -> None:
        (repo / "docs" / "architecture-decisions" / "001-demo.md").unlink()
        findings = run_checks(repo)
        assert any("no ADR found" in finding for finding in findings)


class TestParseFrontmatter:
    def test_returns_none_without_opening_delimiter(self) -> None:
        assert parse_frontmatter("# just markdown\n") is None

    def test_simple_frontmatter_parses(self) -> None:
        parsed = parse_frontmatter("---\nname: x\ndescription: y\n---\nbody\n")
        assert parsed == {"name": "x", "description": "y"}

    def test_comments_and_blank_lines_are_tolerated(self) -> None:
        parsed = parse_frontmatter("---\n# comment\n\nname: x\ndescription: y\n---\n")
        assert parsed is not None
        assert parsed["name"] == "x"
