"""Tests for tools/validate.py.

Every failure case here is either a reviewer-reproduced bug from this repo's
own Phase 5 review (KeyError crash, never-closed-frontmatter false PASS) or
a check the validator explicitly claims to make. Fixture repos copy the
shipped SWE-loop contract into `tmp_path`, then mutate that isolated copy.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess

import pytest

from tools.validate import (
    DIAGRAM_LOOP_REQUIRED_DEPENDENCIES,
    DIAGRAM_LOOP_REQUIRED_FILES,
    WORK_PACKAGES_REQUIRED_FILES,
    parse_frontmatter,
    run_checks,
)

PLUGIN_NAME = "ratchet"
VERSION = "0.4.0"
PROJECT_ROOT = Path(__file__).resolve().parents[1]

PALETTE = """    classDef success   fill:#d3f9d8,stroke:#2f9e44,color:#1a3620
    classDef transport fill:#d0ebff,stroke:#1971c2,color:#0b3866
    classDef protocol  fill:#fff3bf,stroke:#e8a400,color:#5c4500
    classDef blocked   fill:#ffe3e3,stroke:#e03131,color:#5c1a1a
    classDef decision  fill:#e5dbff,stroke:#7048e8,color:#2c1a5c
"""


def write_canonical_fixture(root: Path) -> None:
    """Create one minimal registered structural example and guide projection."""
    diagrams = root / "docs" / "diagrams"
    guide = root / "skills" / "swe-loop" / "mermaid-guide.md"
    diagrams.mkdir(parents=True)
    guide.parent.mkdir(parents=True, exist_ok=True)
    source = 'graph LR\n    A["Caller"]\n    B["Service"]\n    A -->|"HTTPS"| B\n'
    (diagrams / "example.mmd").write_text(source)
    guide.write_text(f"<!-- canonical-mermaid: example -->\n```mermaid\n{source}```\n")
    registry = {
        "schema_version": 1,
        "examples": [
            {
                "id": "example",
                "archetype": "structural",
                "rendering": "github-native",
                "source": "docs/diagrams/example.mmd",
                "guide": {
                    "path": "skills/swe-loop/mermaid-guide.md",
                    "marker": "example",
                },
                "evidence": [],
            }
        ],
    }
    (diagrams / "canonical-examples.json").write_text(json.dumps(registry, indent=2))


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
    write_swe_loop_contract_fixture(root)
    for relative_path in DIAGRAM_LOOP_REQUIRED_FILES:
        full_path = root / relative_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text("fixture\n")
    diagram_package = {
        "name": "ratchet-diagram-loop-renderer",
        "version": "0.1.0",
        "private": True,
        "scripts": {
            "diagram": "node src/cli.ts",
            "typecheck": "tsc --noEmit",
            "test": "node --test",
            "test:media": "node --test test/media/media-smoke.test.ts",
        },
        "dependencies": {
            dependency: "1.0.0" for dependency in DIAGRAM_LOOP_REQUIRED_DEPENDENCIES
        },
    }
    (root / "skills" / "diagram-loop" / "SKILL.md").write_text(
        "---\nname: diagram-loop\ndescription: a premium diagram skill\n---\n\n# Diagram loop\n"
    )
    (root / "skills" / "diagram-loop" / "renderer" / "package.json").write_text(
        json.dumps(diagram_package)
    )
    (root / "skills" / "diagram-loop" / "renderer" / "package-lock.json").write_text(
        json.dumps(
            {
                "name": diagram_package["name"],
                "version": diagram_package["version"],
                "packages": {
                    "": {
                        "name": diagram_package["name"],
                        "version": diagram_package["version"],
                    }
                },
            }
        )
    )
    (root / "tools" / "diagrams").mkdir(parents=True)
    (root / "tools" / "diagrams" / ".node-version").write_text("24.14.0\n")
    (root / "skills" / "diagram-loop" / "renderer" / ".node-version").write_text(
        "24.14.0\n"
    )
    for relative_path in WORK_PACKAGES_REQUIRED_FILES:
        target = root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((PROJECT_ROOT / relative_path).read_text())
    write_canonical_fixture(root)


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


def write_swe_loop_contract_fixture(root: Path) -> None:
    """Copy the shipped contract so mutations test the actual release surface."""
    contract_paths = (
        Path("skills/swe-loop/SKILL.md"),
        Path("skills/swe-loop/templates/state.md"),
        Path("skills/swe-loop/templates/test-plan.md"),
        Path("skills/swe-loop/templates/evidence.md"),
        Path("skills/swe-loop/templates/adr.md"),
        Path("skills/swe-loop/templates/pr-description.md"),
    )
    for relative_path in contract_paths:
        target = root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((PROJECT_ROOT / relative_path).read_text())


def replace_once(path: Path, old: str, new: str) -> None:
    """Replace one fixture marker and fail loudly if the fixture drifted."""
    text = path.read_text()
    assert text.count(old) == 1, f"expected one occurrence of {old!r} in {path}"
    path.write_text(text.replace(old, new, 1))


def registry_path(root: Path) -> Path:
    """Return the canonical registry path in a fixture repo."""
    return root / "docs" / "diagrams" / "canonical-examples.json"


def set_source(root: Path, source: str, *, sync_guide: bool = True) -> None:
    """Replace the example source and optionally keep its native guide fence current."""
    (root / "docs" / "diagrams" / "example.mmd").write_text(source)
    if sync_guide:
        (root / "skills" / "swe-loop" / "mermaid-guide.md").write_text(
            f"<!-- canonical-mermaid: example -->\n```mermaid\n{source}```\n"
        )


def set_narrative_mode(root: Path, source: str, required_classes: list[str]) -> None:
    """Turn the fixture example into a GitHub-native narrative."""
    set_source(root, source)

    def mutate(registry: dict) -> None:
        example = registry["examples"][0]
        example["archetype"] = "narrative"
        example["required_classes"] = required_classes

    rewrite_json(registry_path(root), mutate)


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
        (repo / "skills" / "swe-loop" / "SKILL.md").unlink()
        (repo / "skills" / "diagram-loop" / "SKILL.md").unlink()
        (repo / "skills" / "work-packages" / "SKILL.md").unlink()
        findings = run_checks(repo)
        assert any("no skills/*/SKILL.md" in finding for finding in findings)


class TestAdrPresence:
    def test_missing_adr_is_reported(self, repo: Path) -> None:
        (repo / "docs" / "architecture-decisions" / "001-demo.md").unlink()
        findings = run_checks(repo)
        assert any("no ADR found" in finding for finding in findings)


class TestSweLoopContract:
    @pytest.mark.parametrize(
        "term",
        [
            "/swe-loop",
            "$swe-loop",
            "autonomous",
            "end-to-end",
            "focused changes",
            "ambiguous",
            "before creating loop artifacts",
        ],
    )
    def test_missing_activation_concept_is_reported(self, repo: Path, term: str) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        text = skill.read_text()
        frontmatter, separator, body = text[3:].partition("\n---\n")
        assert separator and term in frontmatter
        skill.write_text(f"---{frontmatter.replace(term, 'removed')}{separator}{body}")
        findings = run_checks(repo)
        assert any("activation.explicit-autonomy" in finding for finding in findings)

    @pytest.mark.parametrize(
        "broad_trigger",
        [
            "Use for any substantive implementation task.",
            "Use for any change that ends in a commit or PR.",
        ],
    )
    def test_broad_activation_trigger_is_reported(
        self,
        repo: Path,
        broad_trigger: str,
    ) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        text = skill.read_text()
        skill.write_text(text.replace("description: >", f"description: >\n  {broad_trigger}", 1))
        findings = run_checks(repo)
        assert any("activation.no-size-trigger" in finding for finding in findings)

    @pytest.mark.parametrize(
        ("marker", "contract_id"),
        [
            ("- **Profile:**", "state.cursor.profile"),
            ("- **Mode:**", "state.cursor.mode"),
            ("- **Repo / branch:**", "state.cursor.repo-branch"),
            ("- **Worktree:**", "state.cursor.worktree"),
            ("- **Started:**", "state.cursor.started"),
            ("- **Status:** in progress", "state.cursor.status"),
            ("- **Current phase:**", "state.cursor.current-phase"),
            ("- **Current boundary:**", "state.cursor.current-boundary"),
            ("- **Current task:**", "state.cursor.current-task"),
            ("- **Next action:**", "state.cursor.next-action"),
            ("- **ADR:**", "state.cursor.adr"),
            ("- **Test intent:**", "state.cursor.test-intent"),
            ("- **Bugfix reproduction:**", "state.cursor.bugfix-reproduction"),
            (
                "- **Last reviewed revision:**",
                "state.cursor.last-reviewed-revision",
            ),
            ("- **Review evidence:**", "state.cursor.review-evidence"),
        ],
    )
    def test_missing_cursor_field_is_reported(
        self,
        repo: Path,
        marker: str,
        contract_id: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, marker, f"removed {contract_id}")
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    def test_cursor_field_moved_to_another_section_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text()
        profile_line = next(
            line for line in text.splitlines() if line.startswith("- **Profile:**")
        )
        text = text.replace(f"{profile_line}\n", "", 1)
        text = text.replace(
            "## Gate authority\n",
            f"## Gate authority\n\n{profile_line}\n",
            1,
        )
        state.write_text(text)
        findings = run_checks(repo)
        assert any("state.cursor.profile" in finding for finding in findings)

    def test_duplicate_cursor_field_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        profile_line = next(
            line for line in state.read_text().splitlines() if line.startswith("- **Profile:**")
        )
        replace_once(state, profile_line, f"{profile_line}\n{profile_line}")
        findings = run_checks(repo)
        assert any(
            "state.cursor.profile" in finding and "found 2" in finding
            for finding in findings
        )

    @pytest.mark.parametrize(
        "duplicate",
        [
            "- Profile: duplicate",
            "* _Profile_: duplicate",
            "+ `Profile`: duplicate",
            "Profile: duplicate",
        ],
    )
    def test_alternate_duplicate_cursor_field_is_reported(
        self,
        repo: Path,
        duplicate: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, "## Gate authority", f"{duplicate}\n\n## Gate authority")
        findings = run_checks(repo)
        assert any(
            "state.cursor.profile" in finding and "found 2" in finding
            for finding in findings
        )

    @pytest.mark.parametrize(
        "heading",
        [
            "## Phase checklist",
            "## Diagram evidence",
            "## Reuse inventory",
            "## Decision log",
            "## Zoom-out findings",
            "# Decision log",
            "### Decision log",
            "#### Decision log",
            "##### Decision log",
            "###### Decision log",
        ],
    )
    def test_diary_heading_is_reported(self, repo: Path, heading: str) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        state.write_text(f"{state.read_text()}\n{heading}\n")
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    def test_reordered_state_sections_are_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text()
        text = text.replace("## Cursor", "## TEMP", 1)
        text = text.replace("## Gate authority", "## Cursor", 1)
        text = text.replace("## TEMP", "## Gate authority", 1)
        state.write_text(text)
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    def test_unknown_third_level_state_section_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        state.write_text(f"{state.read_text()}\n### Decision log\n")
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    @pytest.mark.parametrize("heading", ["   ## Notes", "   ### Gate C"])
    def test_indented_unknown_state_section_is_reported(
        self,
        repo: Path,
        heading: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        state.write_text(f"{state.read_text()}\n{heading}\n")
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    @pytest.mark.parametrize("heading", ["## Cursor", "### Gate A"])
    def test_indented_required_heading_is_accepted(
        self,
        repo: Path,
        heading: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, heading, f"   {heading}")
        assert run_checks(repo) == []

    def test_space_delimited_atx_closing_hash_is_accepted(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, "## Cursor", "## Cursor #")
        assert run_checks(repo) == []

    def test_attached_trailing_hash_changes_heading_name(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, "## Cursor", "## Cursor#")
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    def test_heading_in_gate_wording_is_not_a_state_section(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text().replace(
            "<verbatim user message | pending>",
            "## Notes",
        )
        state.write_text(text)
        assert run_checks(repo) == []

    def test_third_gate_block_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, "## Phase status", "### Gate C\n\n## Phase status")
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    def test_differently_named_third_gate_block_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, "## Phase status", "### Approval C\n\n## Phase status")
        findings = run_checks(repo)
        assert any("state.sections" in finding for finding in findings)

    def test_missing_gate_field_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text().replace(
            "- **Date:** <date | pending>",
            "removed gate date",
            1,
        )
        state.write_text(text)
        findings = run_checks(repo)
        assert any("state.gate-a.date" in finding for finding in findings)

    def test_gate_wording_without_text_fence_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text().replace(
            "```text\n<verbatim user message | pending>\n```",
            "<verbatim user message | pending>",
            1,
        )
        state.write_text(text)
        findings = run_checks(repo)
        assert any(
            contract_id in finding
            for contract_id in ("state.sections", "state.gate-a.wording-block")
            for finding in findings
        )

    def test_unclosed_gate_wording_fence_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text().replace(
            "<verbatim user message | pending>\n```",
            "<verbatim user message | pending>",
            1,
        )
        state.write_text(text)
        findings = run_checks(repo)
        assert any(
            contract_id in finding
            for contract_id in ("state.sections", "state.gate-a.wording-block")
            for finding in findings
        )

    def test_reversed_gate_wording_fence_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        text = state.read_text().replace(
            "```text\n<verbatim user message | pending>\n```",
            "```\n<verbatim user message | pending>\n```text",
            1,
        )
        state.write_text(text)
        findings = run_checks(repo)
        assert any(
            contract_id in finding
            for contract_id in ("state.sections", "state.gate-a.wording-block")
            for finding in findings
        )

    def test_gate_wording_fence_before_field_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        original = (
            "- **Exact user wording:**\n\n"
            "```text\n<verbatim user message | pending>\n```"
        )
        replacement = (
            "```text\n<verbatim user message | pending>\n```\n\n"
            "- **Exact user wording:**"
        )
        state.write_text(state.read_text().replace(original, replacement, 1))
        findings = run_checks(repo)
        assert any("state.gate-a.wording-block" in finding for finding in findings)

    @pytest.mark.parametrize("blank_wording", ["", "   ", "\t"])
    def test_blank_gate_wording_is_reported(
        self,
        repo: Path,
        blank_wording: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        gate_a_wording = (
            "### Gate A\n\n"
            "- **Status:** pending | approved\n"
            "- **Date:** <date | pending>\n"
            "- **Approved revision:** <ADR path + revision | pending>\n"
            "- **Exact user wording:**\n\n"
            "```text\n"
            "<verbatim user message | pending>\n"
            "```"
        )
        replace_once(
            state,
            gate_a_wording,
            gate_a_wording.replace(
                "<verbatim user message | pending>",
                blank_wording,
            ),
        )
        findings = run_checks(repo)
        assert any("state.gate-a.wording-block" in finding for finding in findings)

    @pytest.mark.parametrize(
        ("old", "contract_id"),
        [
            ("| Phase | Status | Result / evidence reference |", "state.phase-status.header"),
            (
                "| 4 Test | pending / active / blocked / done | |",
                "state.phase-status.rows",
            ),
            ("| ID | Status | Result / evidence reference |", "state.task-status.header"),
            (
                "| T1 | pending / active / blocked / done | |",
                "state.task-status.rows",
            ),
            ("| Ref | Owner / purpose | Path or URL |", "state.evidence-references.header"),
            (
                "| DELIVERY | reviewer-facing summary | PR URL or `pr-description.md` |",
                "state.evidence-references.rows",
            ),
        ],
    )
    def test_incomplete_state_table_is_reported(
        self,
        repo: Path,
        old: str,
        contract_id: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, old, f"| removed {contract_id} |")
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    def test_missing_table_separator_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        state.write_text(state.read_text().replace("|---|---|---|", "", 1))
        findings = run_checks(repo)
        assert any("state.phase-status.separator" in finding for finding in findings)

    def test_short_table_row_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        original = "| 4 Test | pending / active / blocked / done | |"
        replace_once(state, original, "| 4 Test |")
        findings = run_checks(repo)
        assert any("state.phase-status.columns" in finding for finding in findings)

    def test_duplicate_required_table_row_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        row = "| 4 Test | pending / active / blocked / done | |"
        replace_once(state, row, f"{row}\n{row}")
        findings = run_checks(repo)
        assert any("state.phase-status.rows" in finding for finding in findings)

    @pytest.mark.parametrize(
        ("original", "replacement", "contract_id"),
        [
            (
                "| 4 Test | pending / active / blocked / done | |",
                "| 4 Test | | |",
                "state.phase-status.rows",
            ),
            (
                "| T1 | pending / active / blocked / done | |",
                "| T1 | | |",
                "state.task-status.rows",
            ),
            (
                "| | finding / waiver | unresolved / waived | | |",
                "| | finding / waiver | | | |",
                "state.active-exceptions.rows",
            ),
        ],
    )
    def test_empty_status_value_is_reported(
        self,
        repo: Path,
        original: str,
        replacement: str,
        contract_id: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, original, replacement)
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    def test_reordered_test_intent_steps_are_reported(self, repo: Path) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        text = skill.read_text()
        text = text.replace(
            "1. **Plan test intent.**",
            "1. **Persist test intent.**",
            1,
        )
        text = text.replace(
            "2. **Persist test intent.**",
            "2. **Plan test intent.**",
            1,
        )
        skill.write_text(text)
        findings = run_checks(repo)
        assert any("phase4.persisted-test-intent" in finding for finding in findings)

    def test_reversed_test_intent_ordinals_are_reported(self, repo: Path) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        text = skill.read_text()
        replacements = (
            ("1. **Plan test intent.**", "4. **Plan test intent.**"),
            ("2. **Persist test intent.**", "3. **Persist test intent.**"),
            ("3. **Record the boundary.**", "2. **Record the boundary.**"),
            ("4. **Edit tests.**", "1. **Edit tests.**"),
        )
        for old, new in replacements:
            text = text.replace(old, new, 1)
        skill.write_text(text)
        findings = run_checks(repo)
        assert any("phase4.persisted-test-intent" in finding for finding in findings)

    def test_fenced_test_intent_step_is_reported(self, repo: Path) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        replace_once(
            skill,
            "1. **Plan test intent.** Write `test-plan.md` first:",
            (
                "```markdown\n"
                "1. **Plan test intent.**\n"
                "```\n\n"
                "Plan test intent, then write `test-plan.md` first:"
            ),
        )
        findings = run_checks(repo)
        assert any("phase4.persisted-test-intent" in finding for finding in findings)

    @pytest.mark.parametrize(
        "marker",
        [
            "1. **Explicit direction** — follow a repository instruction or user choice.",
            "2. **Existing convention** — inspect repository ADRs and preserve their",
            "3. **Descriptive fallback** — when no ADR convention exists, create",
            "`docs/architecture-decisions/<slug>.md`. Do not introduce a sequence number.",
        ],
    )
    def test_missing_adr_path_resolution_guidance_is_reported(
        self,
        repo: Path,
        marker: str,
    ) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        replace_once(skill, marker, "removed ADR path resolution guidance")
        findings = run_checks(repo)
        assert any("adr.path-resolution" in finding for finding in findings)

    @pytest.mark.parametrize(
        "marker",
        [
            "CI is the\n  published source of automated check status",
            "do not copy those details\n  into the PR description",
            "only when hands-on verification produced evidence CI cannot\n  expose",
            "omit that section otherwise",
        ],
    )
    def test_missing_automation_ownership_guidance_is_reported(
        self,
        repo: Path,
        marker: str,
    ) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        replace_once(skill, marker, "removed automation ownership guidance")
        findings = run_checks(repo)
        assert any("pr.automation-ownership" in finding for finding in findings)

    def test_missing_manual_testing_heading_is_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "pr-description.md"
        replace_once(template, "## Manual testing", "## Evidence")
        findings = run_checks(repo)
        assert any("pr.sections" in finding for finding in findings)

    def test_manual_testing_omission_guidance_is_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "pr-description.md"
        replace_once(
            template,
            "Delete this section entirely when no hands-on verification was",
            "removed manual testing omission guidance",
        )
        findings = run_checks(repo)
        assert any("pr.manual-testing-omission" in finding for finding in findings)

    def test_restored_automated_test_section_is_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "pr-description.md"
        replace_once(template, "## Manual testing", "## What was tested")
        findings = run_checks(repo)
        assert any("pr.sections" in finding for finding in findings)

    def test_extra_automated_verification_section_is_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "pr-description.md"
        template.write_text(f"{template.read_text()}\n## Verification\n\n- CI status\n")
        findings = run_checks(repo)
        assert any("pr.sections" in finding for finding in findings)

    def test_automated_command_and_pass_count_are_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "pr-description.md"
        template.write_text(f"{template.read_text()}\n- `uv run pytest -q`: 137 passed\n")
        findings = run_checks(repo)
        assert any("pr.no-automated-test-evidence" in finding for finding in findings)

    def test_numbered_adr_template_title_is_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "adr.md"
        replace_once(template, "# ADR: <title>", "# ADR NNN: <title>")
        findings = run_checks(repo)
        assert any("adr.no-imposed-number" in finding for finding in findings)

    def test_numbered_pr_adr_reference_is_reported(self, repo: Path) -> None:
        template = repo / "skills" / "swe-loop" / "templates" / "pr-description.md"
        replace_once(
            template,
            "ADR: <link to resolved ADR path>",
            "ADR: <link to docs/architecture-decisions/NNN-<slug>.md>",
        )
        findings = run_checks(repo)
        assert any("pr.resolved-adr-reference" in finding for finding in findings)

    @pytest.mark.parametrize(
        "loop_field",
        [
            "- **Loop:** external\n",
            "- **Loop**: external\n",
            "** Loop : ** external\n",
            "- *Loop*: external\n",
            "- `Loop`: external\n",
            "+ **Loop:** external\n",
            "Loop: external\n",
        ],
    )
    def test_adr_loop_field_is_reported(self, repo: Path, loop_field: str) -> None:
        adr = repo / "skills" / "swe-loop" / "templates" / "adr.md"
        replace_once(adr, "\n## Context", f"\n{loop_field}\n## Context")
        findings = run_checks(repo)
        assert any("adr.no-loop-field" in finding for finding in findings)
        assert not any("adr.no-local-loop-reference" in finding for finding in findings)

    @pytest.mark.parametrize(
        "local_metadata",
        [
            "- **Notes:** docs/loops/example/\n",
            "- **Notes:** docs/loops\n",
            "- **Notes:** ~/.claude/swe-loops/repo/slug/\n",
            "- **Notes:** ~/.claude/swe-loops\n",
            "- **Notes:** $HOME/.claude/swe-loops/repo/slug/\n",
            "- **Notes:** /home/dejan/.claude/swe-loops/repo/slug/\n",
            "- **Notes:** /Users/dejan/.claude/swe-loops/repo/slug/\n",
            "- **Notes:** C:\\Users\\dejan\\.claude\\swe-loops\\repo\\slug\\\n",
        ],
    )
    def test_local_adr_path_is_reported(
        self,
        repo: Path,
        local_metadata: str,
    ) -> None:
        adr = repo / "skills" / "swe-loop" / "templates" / "adr.md"
        replace_once(adr, "\n## Context", f"\n{local_metadata}\n## Context")
        findings = run_checks(repo)
        assert any("adr.no-local-loop-reference" in finding for finding in findings)
        assert not any("adr.no-loop-field" in finding for finding in findings)

    def test_missing_contract_document_is_a_finding(self, repo: Path) -> None:
        (repo / "skills" / "swe-loop" / "templates" / "evidence.md").unlink()
        findings = run_checks(repo)
        assert any(
            "required SWE-loop contract document is missing" in finding
            for finding in findings
        )
class TestDiagramLoopPackage:
    def test_missing_required_file_is_reported(self, repo: Path) -> None:
        missing = repo / "skills" / "diagram-loop" / "templates" / "state.md"
        missing.unlink()
        findings = run_checks(repo)
        assert any("required file is missing or empty" in finding for finding in findings)

    def test_renderer_must_remain_private(self, repo: Path) -> None:
        package = repo / "skills" / "diagram-loop" / "renderer" / "package.json"
        rewrite_json(package, lambda data: data.update(private=False))
        findings = run_checks(repo)
        assert any("renderer package must remain private" in finding for finding in findings)

    def test_required_dependency_is_reported(self, repo: Path) -> None:
        package = repo / "skills" / "diagram-loop" / "renderer" / "package.json"
        rewrite_json(package, lambda data: data["dependencies"].pop("remotion"))
        findings = run_checks(repo)
        assert any("missing runtime dependency 'remotion'" in finding for finding in findings)

    def test_required_script_is_reported(self, repo: Path) -> None:
        package = repo / "skills" / "diagram-loop" / "renderer" / "package.json"
        rewrite_json(package, lambda data: data["scripts"].pop("test:media"))
        findings = run_checks(repo)
        assert any("missing script 'test:media'" in finding for finding in findings)

    def test_root_lock_mismatch_is_reported(self, repo: Path) -> None:
        lock = repo / "skills" / "diagram-loop" / "renderer" / "package-lock.json"
        rewrite_json(lock, lambda data: data["packages"][""].update(version="9.9.9"))
        findings = run_checks(repo)
        assert any("root 'version' does not match" in finding for finding in findings)

    def test_node_version_drift_is_reported(self, repo: Path) -> None:
        node_version = repo / "skills" / "diagram-loop" / "renderer" / ".node-version"
        node_version.write_text("23.0.0\n")
        findings = run_checks(repo)
        assert any("Node version must match" in finding for finding in findings)


class TestWorkPackagesContract:
    def test_missing_required_file_is_reported(self, repo: Path) -> None:
        missing = repo / "skills" / "work-packages" / "templates" / "work-packages.yaml"
        missing.unlink()
        findings = run_checks(repo)
        assert any(
            "work-packages required file is missing or empty" in finding
            for finding in findings
        )

    def test_session_start_matcher_must_cover_compact(self, repo: Path) -> None:
        hooks_path = repo / "hooks" / "hooks.json"
        rewrite_json(
            hooks_path,
            lambda data: data["hooks"]["SessionStart"][0].update(matcher="startup"),
        )
        findings = run_checks(repo)
        assert any("SessionStart matcher must cover 'compact'" in f for f in findings)

    def test_session_start_hook_is_silent_when_ratchet_dir_absent(
        self, tmp_path: Path
    ) -> None:
        script = PROJECT_ROOT / "hooks" / "session-start.mjs"
        res = subprocess.run(
            ["node", str(script), str(tmp_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        assert res.stdout == ""

    def test_session_start_hook_renders_active_ready_and_unblock_with(
        self, tmp_path: Path
    ) -> None:
        ratchet_dir = tmp_path / ".ratchet"
        ratchet_dir.mkdir()
        (ratchet_dir / "work-packages.yaml").write_text(
            "work_packages:\n"
            "  - { id: WP-KV.1, lane: key-vault, title: Runtime schema, depends_on: [], blocked_by: [], human_gate: false, status: done, owner: dejan }\n"
            "  - { id: WP-KV.2, lane: key-vault, title: Vault Bicep dark launch, depends_on: [WP-KV.1], blocked_by: [HD-01], human_gate: false, status: todo, owner: null }\n"
            "  - { id: WP-LOG.1, lane: live-logs, title: ASGI probe, depends_on: [], blocked_by: [], human_gate: true, status: in_review, owner: dejan }\n"
            "  - { id: WP-LOG.2, lane: live-logs, title: Release plugin, depends_on: [WP-LOG.1], blocked_by: [HD-02], human_gate: true, status: blocked, owner: null }\n"
        )
        (ratchet_dir / "human-dependencies.md").write_text(
            "| ID | What | Owner | Blocks | Unblock-with (safe default on `main` until Done) | Status |\n"
            "|---|---|---|---|---|---|\n"
            "| HD-01 | Seed prod vault | Ops | WP-KV.2 | Keep manifest optional on main | Open |\n"
            "| HD-02 | CISO sign-off | CISO | WP-LOG.2 | Keep plugin in draft | Open |\n"
        )
        script = PROJECT_ROOT / "hooks" / "session-start.mjs"
        res = subprocess.run(
            ["node", str(script), str(tmp_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        assert "<ratchet-work-packages>" in res.stdout
        assert "1/4 done" in res.stdout
        assert "WP-LOG.1 [live-logs] (in_review): ASGI probe [human_gate] (owner: dejan)" in res.stdout
        assert "WP-KV.2 [key-vault]: Vault Bicep dark launch | Open blockers: HD-01 (Unblock-with: Keep manifest optional on main)" in res.stdout
        assert "WP-LOG.2 [live-logs]: Release plugin (blocked_by: HD-02)" in res.stdout

    def test_session_start_hook_handles_commas_and_hash_refs_inside_flow_line(
        self, tmp_path: Path
    ) -> None:
        ratchet_dir = tmp_path / ".ratchet"
        ratchet_dir.mkdir()
        (ratchet_dir / "work-packages.yaml").write_text(
            "work_packages:\n"
            "  - { id: WP-KV.1, lane: key-vault, title: Extract schema, policy validator & planner for #30, ref: \"#30\", depends_on: [], blocked_by: [], human_gate: false, status: todo, owner: null }\n"
        )
        script = PROJECT_ROOT / "hooks" / "session-start.mjs"
        res = subprocess.run(
            ["node", str(script), str(tmp_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        assert (
            "WP-KV.1 [key-vault]: Extract schema, policy validator & planner for #30"
            in res.stdout
        )



class TestCanonicalRegistry:
    def test_unsupported_schema_is_reported(self, repo: Path) -> None:
        rewrite_json(registry_path(repo), lambda registry: registry.update(schema_version=2))
        findings = run_checks(repo)
        assert any("unsupported schema_version" in finding for finding in findings)

    def test_duplicate_identity_is_reported(self, repo: Path) -> None:
        def duplicate(registry: dict) -> None:
            registry["examples"].append(dict(registry["examples"][0]))

        rewrite_json(registry_path(repo), duplicate)
        findings = run_checks(repo)
        assert any("example IDs must be unique" in finding for finding in findings)
        assert any("source paths must be unique" in finding for finding in findings)
        assert any("guide markers must be unique" in finding for finding in findings)

    def test_path_escape_is_a_finding_not_an_exception(self, repo: Path) -> None:
        def escape(registry: dict) -> None:
            registry["examples"][0]["source"] = "../outside.mmd"

        rewrite_json(registry_path(repo), escape)
        findings = run_checks(repo)
        assert any("path must be normalized and repo-relative" in finding for finding in findings)

    def test_malformed_evidence_sha_is_reported(self, repo: Path) -> None:
        def add_evidence(registry: dict) -> None:
            registry["examples"][0]["evidence"] = [
                {
                    "repository": "example/repo",
                    "revision": "not-a-sha",
                    "paths": ["workflow.yml"],
                }
            ]

        rewrite_json(registry_path(repo), add_evidence)
        findings = run_checks(repo)
        assert any("revision' must be a 40-character SHA" in finding for finding in findings)


class TestCanonicalSourceContract:
    def test_invalid_flow_header_is_reported(self, repo: Path) -> None:
        set_source(repo, 'sequenceDiagram\n    A->>B: call\n')
        findings = run_checks(repo)
        assert any("first significant line" in finding for finding in findings)

    def test_unlabeled_edge_is_reported(self, repo: Path) -> None:
        set_source(repo, 'graph LR\n    A["A"]\n    B["B"]\n    A --> B\n')
        findings = run_checks(repo)
        assert any(
            "edge must be one labeled unidirectional source line" in finding
            for finding in findings
        )

    @pytest.mark.parametrize(
        "operator", ["---", "==>", "~~~", "o--o", "--x", "<-->"]
    )
    def test_alternate_edge_operator_is_reported(self, repo: Path, operator: str) -> None:
        set_source(repo, f'graph LR\n    A["A"]\n    B["B"]\n    A {operator} B\n')
        findings = run_checks(repo)
        assert any(
            "edge must be one labeled unidirectional source line" in finding
            for finding in findings
        )

    @pytest.mark.parametrize(
        "alternate_edge",
        [
            'C["C"] --- D["D"]',
            "C((C)) ==> D",
            "C & D --- E",
        ],
    )
    def test_inline_or_multi_source_alternate_edge_is_reported(
        self, repo: Path, alternate_edge: str
    ) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    C["C"]\n    D["D"]\n    E["E"]\n'
            '    A -->|"calls"| B\n'
            f"    {alternate_edge}\n"
        )
        set_source(repo, source)
        findings = run_checks(repo)
        assert any(
            "edge must be one labeled unidirectional source line" in finding
            for finding in findings
        )

    def test_comment_quote_cannot_hide_alternate_edge(self, repo: Path) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    C["C"]\n    D["D"]\n'
            '    A -->|"calls"| B\n'
            '    %% unmatched comment quote: "\n'
            "    C --- D\n"
        )
        set_source(repo, source)
        findings = run_checks(repo)
        assert any(
            "edge must be one labeled unidirectional source line" in finding
            for finding in findings
        )

    def test_inline_class_is_reported(self, repo: Path) -> None:
        set_source(
            repo,
            'graph LR\n    A["A"]:::success\n    B["B"]\n    A -->|"calls"| B\n',
        )
        findings = run_checks(repo)
        assert any("inline class syntax is outside" in finding for finding in findings)

    def test_multiple_classes_are_reported(self, repo: Path) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    A -->|"① calls"| B\n'
            "    class B success,blocked\n" + PALETTE
        )
        set_narrative_mode(repo, source, ["success"])
        findings = run_checks(repo)
        assert any(
            "class assignment must name nodes and one class" in finding
            for finding in findings
        )

    def test_undeclared_node_is_reported(self, repo: Path) -> None:
        set_source(repo, 'graph LR\n    A["A"]\n    A -->|"calls"| Missing\n')
        findings = run_checks(repo)
        assert any("edge references undeclared nodes" in finding for finding in findings)

    def test_node_limit_is_reported(self, repo: Path) -> None:
        nodes = "".join(f'    N{index}["N{index}"]\n' for index in range(13))
        edges = "".join(
            f'    N{index} -->|"next"| N{index + 1}\n' for index in range(12)
        )
        set_source(repo, f"graph LR\n{nodes}{edges}")
        findings = run_checks(repo)
        assert any("connected node count 13 exceeds 12" in finding for finding in findings)

    def test_narrative_numbering_gap_is_reported(self, repo: Path) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    C["C"]\n'
            '    A -->|"① first"| B\n    B -->|"③ third"| C\n'
            "    class C success\n" + PALETTE
        )
        set_narrative_mode(repo, source, ["success"])
        findings = run_checks(repo)
        assert any("step numbers must be contiguous" in finding for finding in findings)

    def test_narrative_edge_without_circled_number_is_reported(self, repo: Path) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    A -->|"first"| B\n'
            "    class B success\n" + PALETTE
        )
        set_narrative_mode(repo, source, ["success"])
        findings = run_checks(repo)
        assert any("must start with ① through ⑳" in finding for finding in findings)

    def test_palette_drift_is_reported(self, repo: Path) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    A -->|"① first"| B\n'
            "    class B success\n" + PALETTE.replace("#d3f9d8", "#ffffff")
        )
        set_narrative_mode(repo, source, ["success"])
        findings = run_checks(repo)
        assert any("classDef palette differs" in finding for finding in findings)

    def test_missing_required_class_is_reported(self, repo: Path) -> None:
        source = (
            'graph LR\n    A["A"]\n    B["B"]\n    A -->|"① first"| B\n'
            "    class B success\n" + PALETTE
        )
        set_narrative_mode(repo, source, ["success", "blocked"])
        findings = run_checks(repo)
        assert any("required semantic classes are unused" in finding for finding in findings)


class TestCanonicalProjectionAndIconMode:
    def test_native_icon_syntax_is_reported(self, repo: Path) -> None:
        source = (
            "graph LR\n"
            '    A@{ shape: icon, icon: "mdi:account", label: "User" }\n'
            '    B["B"]\n    A -->|"calls"| B\n'
        )
        set_source(repo, source)
        findings = run_checks(repo)
        assert any(
            "GitHub-native example must not contain icon syntax" in finding
            for finding in findings
        )

    def test_native_guide_drift_is_reported(self, repo: Path) -> None:
        source = 'graph LR\n    A["Changed"]\n    B["B"]\n    A -->|"calls"| B\n'
        set_source(repo, source, sync_guide=False)
        findings = run_checks(repo)
        assert any("differs from docs/diagrams/example.mmd" in finding for finding in findings)

    def test_duplicate_guide_marker_is_reported(self, repo: Path) -> None:
        guide = repo / "skills" / "swe-loop" / "mermaid-guide.md"
        guide.write_text(guide.read_text() + "\n<!-- canonical-mermaid: example -->\n")
        findings = run_checks(repo)
        assert any("must have one valid projection" in finding for finding in findings)

    def test_icon_label_and_pack_mismatch_are_reported(self, repo: Path) -> None:
        source = (
            "graph LR\n"
            '    A@{ shape: icon, icon: "mdi:account", label: "" }\n'
            '    B@{ shape: icon, icon: "mdi:server", label: "Server" }\n'
            '    A -->|"① call"| B\n' + PALETTE
        )
        set_source(repo, source, sync_guide=False)
        guide = repo / "skills" / "swe-loop" / "mermaid-guide.md"
        guide.write_text(
            '<!-- canonical-mermaid: example -->\n<picture>\n'
            '<source media="(prefers-color-scheme: dark)" '
            'srcset="../../docs/diagrams/example-dark.svg">\n'
            '<img src="../../docs/diagrams/example-light.svg" alt="Example">\n'
            "</picture>\n"
        )
        diagrams = repo / "docs" / "diagrams"
        (diagrams / "dark.json").write_text("{}")
        (diagrams / "light.json").write_text("{}")
        (diagrams / "example-dark.svg").write_text("<svg></svg>")
        (diagrams / "example-light.svg").write_text("<svg></svg>")

        def make_icon(registry: dict) -> None:
            example = registry["examples"][0]
            example["archetype"] = "narrative"
            example["rendering"] = "icon"
            example["icon_packs"] = ["@iconify-json/logos"]
            example["configs"] = {
                "dark": "docs/diagrams/dark.json",
                "light": "docs/diagrams/light.json",
            }
            example["renders"] = {
                "dark": "docs/diagrams/example-dark.svg",
                "light": "docs/diagrams/example-light.svg",
            }

        rewrite_json(registry_path(repo), make_icon)
        findings = run_checks(repo)
        assert any("must have a text label" in finding for finding in findings)
        assert any("icon_packs must exactly match used prefixes" in finding for finding in findings)

    def test_missing_icon_artifact_is_reported(self, repo: Path) -> None:
        source = (
            "graph LR\n"
            '    A@{ shape: icon, icon: "mdi:account", label: "User" }\n'
            '    B@{ shape: icon, icon: "mdi:server", label: "Server" }\n'
            '    A -->|"① call"| B\n' + PALETTE
        )
        set_source(repo, source, sync_guide=False)
        guide = repo / "skills" / "swe-loop" / "mermaid-guide.md"
        guide.write_text(
            '<!-- canonical-mermaid: example -->\n<picture>\n'
            '<source media="(prefers-color-scheme: dark)" '
            'srcset="../../docs/diagrams/example-dark.svg">\n'
            '<img src="../../docs/diagrams/example-light.svg" alt="Example">\n'
            "</picture>\n"
        )

        def make_icon(registry: dict) -> None:
            example = registry["examples"][0]
            example["archetype"] = "narrative"
            example["rendering"] = "icon"
            example["icon_packs"] = ["@iconify-json/mdi"]
            example["configs"] = {
                "dark": "docs/diagrams/dark.json",
                "light": "docs/diagrams/light.json",
            }
            example["renders"] = {
                "dark": "docs/diagrams/example-dark.svg",
                "light": "docs/diagrams/example-light.svg",
            }

        rewrite_json(registry_path(repo), make_icon)
        findings = run_checks(repo)
        assert any("missing dark config" in finding for finding in findings)
        assert any("missing light render" in finding for finding in findings)

    def test_unresolved_icon_artifact_is_reported(self, repo: Path) -> None:
        source = (
            "graph LR\n"
            '    A@{ shape: icon, icon: "mdi:account", label: "User" }\n'
            '    B@{ shape: icon, icon: "mdi:server", label: "Server" }\n'
            '    A -->|"① call"| B\n' + PALETTE
        )
        set_source(repo, source, sync_guide=False)
        guide = repo / "skills" / "swe-loop" / "mermaid-guide.md"
        guide.write_text(
            '<!-- canonical-mermaid: example -->\n<picture>\n'
            '<source media="(prefers-color-scheme: dark)" '
            'srcset="../../docs/diagrams/example-dark.svg">\n'
            '<img src="../../docs/diagrams/example-light.svg" alt="Example">\n'
            "</picture>\n"
        )
        diagrams = repo / "docs" / "diagrams"
        (diagrams / "dark.json").write_text("{}")
        (diagrams / "light.json").write_text("{}")
        (diagrams / "example-dark.svg").write_text(
            '<svg><tspan x="0" y="0">?</tspan></svg>'
        )
        (diagrams / "example-light.svg").write_text("<svg></svg>")

        def make_icon(registry: dict) -> None:
            example = registry["examples"][0]
            example["archetype"] = "narrative"
            example["rendering"] = "icon"
            example["required_classes"] = []
            example["icon_packs"] = ["@iconify-json/mdi"]
            example["configs"] = {
                "dark": "docs/diagrams/dark.json",
                "light": "docs/diagrams/light.json",
            }
            example["renders"] = {
                "dark": "docs/diagrams/example-dark.svg",
                "light": "docs/diagrams/example-light.svg",
            }

        rewrite_json(registry_path(repo), make_icon)
        findings = run_checks(repo)
        assert any(
            "render contains an unresolved icon placeholder" in finding
            for finding in findings
        )


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
