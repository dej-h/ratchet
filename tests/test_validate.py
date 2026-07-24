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

SWE_LOOP_CONTRACT = """---
name: swe-loop
description: fixture workflow
---

# swe-loop

**Two human gates only.**

- `state.md`: compact execution cursor
- `plan.md`: task definitions
- `test-plan.md`: test intent
- `evidence.md`: optional detailed evidence
- `pr-description.md`: Gate B summary

Resume by reading state: read it first. Then load only the artifacts referenced
by the active phase, current task, or active exceptions. Do not load completed
phase history by default.

### Phase 0 — Design (ADR)

External loop paths remain in `state.md` and never appear in the committed ADR.

### Phase 4 — Test with intent

Write `test-plan.md` **first**. A copied but empty template does not complete
test intent. Persist `test-plan.md`, then record the completed test-intent
boundary. Only after both writes may test-code edits begin. The same agent turn
may continue immediately.

## Profiles

For a bugfix, persist `test-plan.md`, record the test-intent boundary, run the
reproduction test, apply the production fix, then record the passing run.
"""

STATE_CONTRACT = """# Loop state

## Cursor

- **Profile:** feature
- **Mode:** branch
- **Repo / branch:** example/repo @ feature
- **Status:** in progress
- **Current phase:** 4 Test
- **Current task:** T1
- **Test intent:** persisted (`test-plan.md`)
- **Last reviewed SHA:** pending | stale | <sha>

## Gate authority

| Gate | Status | Date | Exact user wording | Approved revision |
|---|---|---|---|---|
| A | approved | | words | ADR |
| B | pending | | | |

## Phase status

## Task status

## Active exceptions

| ID | Kind |
|---|---|
| X | finding / waiver |

## Evidence references

## Compaction rule
"""

TEST_PLAN_CONTRACT = """# Test plan

- **Intent status:** persisted
- **Execution status:** not started

Copying this template does not complete the boundary.

## Behaviors under test

## Edge cases & failure modes

## Integration surfaces

## Explicitly not tested

## Verification beyond tests

## Bugfix reproduction
"""

EVIDENCE_CONTRACT = """# Evidence

## Diagram inspections

## Review findings

## Verification

Revision
"""

ADR_CONTRACT = """# ADR NNN

- **Status:** proposed
- **Date:** <date>

## Context
"""

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
    """Write the smallest complete workflow contract accepted by the validator."""
    template_directory = root / "skills" / "swe-loop" / "templates"
    template_directory.mkdir(parents=True)
    (template_directory.parent / "SKILL.md").write_text(SWE_LOOP_CONTRACT)
    (template_directory / "state.md").write_text(STATE_CONTRACT)
    (template_directory / "test-plan.md").write_text(TEST_PLAN_CONTRACT)
    (template_directory / "evidence.md").write_text(EVIDENCE_CONTRACT)
    (template_directory / "adr.md").write_text(ADR_CONTRACT)


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
        findings = run_checks(repo)
        assert any("no skills/*/SKILL.md" in finding for finding in findings)


class TestAdrPresence:
    def test_missing_adr_is_reported(self, repo: Path) -> None:
        (repo / "docs" / "architecture-decisions" / "001-demo.md").unlink()
        findings = run_checks(repo)
        assert any("no ADR found" in finding for finding in findings)


class TestSweLoopContract:
    @pytest.mark.parametrize(
        ("marker", "contract_id"),
        [
            ("- **Profile:**", "state.profile"),
            ("- **Mode:**", "state.mode"),
            ("- **Repo / branch:**", "state.repository"),
            ("- **Status:**", "state.status"),
            ("- **Current phase:**", "state.current-phase"),
            ("- **Current task:**", "state.current-task"),
            ("- **Test intent:**", "state.test-intent"),
            ("- **Last reviewed SHA:**", "state.reviewed-sha"),
            ("Exact user wording", "state.gate-wording"),
            ("## Active exceptions", "state.active-exceptions"),
            ("## Evidence references", "state.evidence-references"),
        ],
    )
    def test_missing_state_cursor_marker_is_reported(
        self,
        repo: Path,
        marker: str,
        contract_id: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, marker, f"removed {contract_id}")
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    @pytest.mark.parametrize(
        ("heading", "contract_id"),
        [
            ("## Phase checklist", "state.no-phase-checklist"),
            ("## Diagram evidence", "state.no-diagram-diary"),
            ("## Reuse inventory", "state.no-reuse-diary"),
            ("## Decision log", "state.no-decision-diary"),
            ("## Zoom-out findings", "state.no-zoomout-diary"),
        ],
    )
    def test_diary_heading_is_reported(
        self,
        repo: Path,
        heading: str,
        contract_id: str,
    ) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        state.write_text(f"{state.read_text()}\n{heading}\n")
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    def test_third_gate_is_reported(self, repo: Path) -> None:
        state = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(state, "| B | pending | | | |", "| B | pending | | | |\n| C | pending | | | |")
        findings = run_checks(repo)
        assert any("state.exactly-two-gates" in finding for finding in findings)

    @pytest.mark.parametrize(
        ("marker", "contract_id"),
        [
            ("read it first", "resume.state-first"),
            ("active phase, current task, or active exceptions", "resume.active-references"),
            ("Do not load completed\nphase history by default.", "resume.no-history"),
        ],
    )
    def test_resume_contract_regression_is_reported(
        self,
        repo: Path,
        marker: str,
        contract_id: str,
    ) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        replace_once(skill, marker, f"removed {contract_id}")
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    def test_reordered_test_intent_boundary_is_reported(self, repo: Path) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        old = (
            "Persist `test-plan.md`, then record the completed test-intent\n"
            "boundary. Only after both writes may test-code edits begin."
        )
        new = (
            "Only after both writes may test-code edits begin. Persist `test-plan.md`, "
            "then record the completed test-intent boundary."
        )
        replace_once(skill, old, new)
        findings = run_checks(repo)
        assert any("phase4.persisted-test-intent" in finding for finding in findings)

    def test_required_separate_turn_is_reported(self, repo: Path) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        replace_once(
            skill,
            "### Phase 4 — Test with intent",
            "### Phase 4 — Test with intent\n\nDo as a separate turn from implementation.",
        )
        findings = run_checks(repo)
        assert any("phase4.no-required-pause" in finding for finding in findings)

    @pytest.mark.parametrize(
        ("marker", "contract_id"),
        [
            ("same agent turn\nmay", "phase4.same-turn"),
            (
                "Copying this template does not complete the boundary.",
                "test-plan.material-intent",
            ),
            ("stale", "state.review-invalidated"),
            ("finding / waiver", "state.exception-kinds"),
        ],
    )
    def test_behavioral_marker_removal_is_reported(
        self,
        repo: Path,
        marker: str,
        contract_id: str,
    ) -> None:
        if contract_id.startswith("phase4"):
            path = repo / "skills" / "swe-loop" / "SKILL.md"
        elif contract_id.startswith("test-plan"):
            path = repo / "skills" / "swe-loop" / "templates" / "test-plan.md"
        else:
            path = repo / "skills" / "swe-loop" / "templates" / "state.md"
        replace_once(path, marker, f"removed {contract_id}")
        findings = run_checks(repo)
        assert any(contract_id in finding for finding in findings)

    def test_bugfix_fix_before_reproduction_is_reported(self, repo: Path) -> None:
        skill = repo / "skills" / "swe-loop" / "SKILL.md"
        replace_once(
            skill,
            "run the\nreproduction test, apply the production fix",
            "apply the production fix, then run the reproduction test",
        )
        findings = run_checks(repo)
        assert any("bugfix.red-before-green" in finding for finding in findings)

    @pytest.mark.parametrize(
        "local_metadata",
        [
            "- **Loop:** docs/loops/<slug>/\n",
            "- **Loop:** ~/.claude/swe-loops/repo/slug/\n",
            "- **Loop:** /home/dejan/.claude/swe-loops/repo/slug/\n",
            "- **Loop:** /Users/dejan/.claude/swe-loops/repo/slug/\n",
        ],
    )
    def test_local_adr_metadata_is_reported(
        self,
        repo: Path,
        local_metadata: str,
    ) -> None:
        adr = repo / "skills" / "swe-loop" / "templates" / "adr.md"
        replace_once(adr, "\n## Context", f"\n{local_metadata}\n## Context")
        findings = run_checks(repo)
        assert any("adr.no-" in finding for finding in findings)

    def test_missing_contract_document_is_a_finding(self, repo: Path) -> None:
        (repo / "skills" / "swe-loop" / "templates" / "evidence.md").unlink()
        findings = run_checks(repo)
        assert any("required SWE-loop contract document is missing" in finding for finding in findings)


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
