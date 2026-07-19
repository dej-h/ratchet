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

from dataclasses import dataclass
import json
import posixpath
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Literal

REPO_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATHS = {
    "claude_plugin": Path(".claude-plugin") / "plugin.json",
    "claude_marketplace": Path(".claude-plugin") / "marketplace.json",
    "codex_plugin": Path(".codex-plugin") / "plugin.json",
    "codex_marketplace": Path(".agents") / "plugins" / "marketplace.json",
}

CANONICAL_REGISTRY_PATH = Path("docs/diagrams/canonical-examples.json")

Archetype = Literal["structural", "narrative"]
RenderingMode = Literal["github-native", "icon"]

SEMANTIC_PALETTE: dict[str, dict[str, str]] = {
    "success": {"fill": "#d3f9d8", "stroke": "#2f9e44", "color": "#1a3620"},
    "transport": {"fill": "#d0ebff", "stroke": "#1971c2", "color": "#0b3866"},
    "protocol": {"fill": "#fff3bf", "stroke": "#e8a400", "color": "#5c4500"},
    "blocked": {"fill": "#ffe3e3", "stroke": "#e03131", "color": "#5c1a1a"},
    "decision": {"fill": "#e5dbff", "stroke": "#7048e8", "color": "#2c1a5c"},
}

CIRCLED_STEP_NUMBER = {
    character: index
    for index, character in enumerate("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳", 1)
}

FLOW_HEADER_RE = re.compile(r"^(?:graph|flowchart) (?:LR|TB)$")
EDGE_RE = re.compile(
    r'^\s*([A-Za-z][A-Za-z0-9_]*)\s+(-->|-\.->)\|"([^"]+)"\|\s+'
    r"([A-Za-z][A-Za-z0-9_]*)\s*$"
)
NODE_DECLARATION_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:@\{|\[|\(|\{)")
CLASS_DEF_RE = re.compile(r"^\s*classDef\s+([A-Za-z][A-Za-z0-9_]*)\s+(.+?)\s*$")
CLASS_ASSIGNMENT_RE = re.compile(
    r"^\s*class\s+([A-Za-z][A-Za-z0-9_,]*)\s+([A-Za-z][A-Za-z0-9_]*)\s*$"
)
ICON_NODE_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)@\{\s*(.+)\s*\}\s*$")
ICON_ATTRIBUTE_RE = re.compile(r'([A-Za-z][A-Za-z0-9_]*)\s*:\s*"([^"]*)"')
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")


class ValidationError(Exception):
    """Raised for any failed check; the message is the failure reason."""


@dataclass(frozen=True)
class EvidenceReference:
    """Immutable source snapshot that grounds one canonical example."""

    repository: str
    revision: str
    paths: tuple[PurePosixPath, ...]


@dataclass(frozen=True)
class GuideProjection:
    """Location where a canonical source is presented in the Mermaid guide."""

    path: PurePosixPath
    marker: str


@dataclass(frozen=True)
class ThemePaths:
    """Dark and light repository paths for config or generated output."""

    dark: PurePosixPath
    light: PurePosixPath


@dataclass(frozen=True)
class CanonicalExample:
    """Validated registry entry for one deliberately constrained example."""

    identifier: str
    archetype: Archetype
    rendering: RenderingMode
    source: PurePosixPath
    guide: GuideProjection
    evidence: tuple[EvidenceReference, ...]
    required_classes: frozenset[str]
    icon_packs: tuple[str, ...]
    configs: ThemePaths | None
    renders: ThemePaths | None


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


def _require_mapping(value: object, context: str) -> dict[str, object]:
    """Narrow untrusted JSON to a string-keyed mapping at the parse boundary."""
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ValidationError(f"{context}: expected a JSON object")
    return {str(key): item for key, item in value.items()}


def _require_list(value: object, context: str) -> list[object]:
    """Narrow untrusted JSON to a list at the parse boundary."""
    if not isinstance(value, list):
        raise ValidationError(f"{context}: expected a JSON array")
    return list(value)


def _require_string(mapping: dict[str, object], field: str, context: str) -> str:
    """Read a non-empty string field from parsed JSON."""
    value = mapping.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{context}: '{field}' must be a non-empty string")
    return value


def _parse_repo_path(value: object, context: str) -> PurePosixPath:
    """Parse one normalized, relative, path-safe repository path."""
    if not isinstance(value, str) or not value:
        raise ValidationError(f"{context}: expected a non-empty path string")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or path.as_posix() in {"", "."}
        or ".." in path.parts
        or path.as_posix() != value
    ):
        raise ValidationError(f"{context}: path must be normalized and repo-relative: {value}")
    return path


def _parse_string_tuple(value: object, context: str) -> tuple[str, ...]:
    """Parse a JSON array whose values are unique non-empty strings."""
    values = _require_list(value, context)
    parsed: list[str] = []
    for index, item in enumerate(values):
        if not isinstance(item, str) or not item:
            raise ValidationError(f"{context}[{index}]: expected a non-empty string")
        parsed.append(item)
    if len(parsed) != len(set(parsed)):
        raise ValidationError(f"{context}: values must be unique")
    return tuple(parsed)


def _parse_evidence(value: object, context: str) -> tuple[EvidenceReference, ...]:
    """Parse immutable external evidence references."""
    references: list[EvidenceReference] = []
    for index, item in enumerate(_require_list(value, context)):
        item_context = f"{context}[{index}]"
        mapping = _require_mapping(item, item_context)
        revision = _require_string(mapping, "revision", item_context)
        if not REVISION_RE.fullmatch(revision):
            raise ValidationError(f"{item_context}: 'revision' must be a 40-character SHA")
        paths = tuple(
            _parse_repo_path(path, f"{item_context}.paths[{path_index}]")
            for path_index, path in enumerate(
                _require_list(mapping.get("paths"), f"{item_context}.paths")
            )
        )
        if not paths:
            raise ValidationError(f"{item_context}: 'paths' must not be empty")
        references.append(
            EvidenceReference(
                repository=_require_string(mapping, "repository", item_context),
                revision=revision,
                paths=paths,
            )
        )
    return tuple(references)


def _parse_theme_paths(value: object, context: str) -> ThemePaths:
    """Parse dark/light paths from one registry object."""
    mapping = _require_mapping(value, context)
    return ThemePaths(
        dark=_parse_repo_path(mapping.get("dark"), f"{context}.dark"),
        light=_parse_repo_path(mapping.get("light"), f"{context}.light"),
    )


def _parse_example(value: object, index: int) -> CanonicalExample:
    """Parse and type one canonical-example registry entry."""
    context = f"{CANONICAL_REGISTRY_PATH}.examples[{index}]"
    mapping = _require_mapping(value, context)
    identifier = _require_string(mapping, "id", context)
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier):
        raise ValidationError(f"{context}: 'id' must be kebab-case")

    archetype_value = _require_string(mapping, "archetype", context)
    if archetype_value not in {"structural", "narrative"}:
        raise ValidationError(f"{context}: unsupported archetype '{archetype_value}'")
    archetype: Archetype = archetype_value

    rendering_value = _require_string(mapping, "rendering", context)
    if rendering_value not in {"github-native", "icon"}:
        raise ValidationError(f"{context}: unsupported rendering mode '{rendering_value}'")
    rendering: RenderingMode = rendering_value

    guide_mapping = _require_mapping(mapping.get("guide"), f"{context}.guide")
    required_classes = frozenset(
        _parse_string_tuple(mapping.get("required_classes", []), f"{context}.required_classes")
    )
    unknown_required = required_classes.difference(SEMANTIC_PALETTE)
    if unknown_required:
        raise ValidationError(
            f"{context}: unknown required semantic classes: {sorted(unknown_required)}"
        )

    configs_value = mapping.get("configs")
    renders_value = mapping.get("renders")
    return CanonicalExample(
        identifier=identifier,
        archetype=archetype,
        rendering=rendering,
        source=_parse_repo_path(mapping.get("source"), f"{context}.source"),
        guide=GuideProjection(
            path=_parse_repo_path(guide_mapping.get("path"), f"{context}.guide.path"),
            marker=_require_string(guide_mapping, "marker", f"{context}.guide"),
        ),
        evidence=_parse_evidence(mapping.get("evidence"), f"{context}.evidence"),
        required_classes=required_classes,
        icon_packs=_parse_string_tuple(mapping.get("icon_packs", []), f"{context}.icon_packs"),
        configs=(
            _parse_theme_paths(configs_value, f"{context}.configs")
            if configs_value is not None
            else None
        ),
        renders=(
            _parse_theme_paths(renders_value, f"{context}.renders")
            if renders_value is not None
            else None
        ),
    )


def load_canonical_examples(repo_root: Path) -> tuple[CanonicalExample, ...]:
    """Load the versioned canonical-example registry into typed entries."""
    loaded = load_json(CANONICAL_REGISTRY_PATH, repo_root)
    registry = _require_mapping(loaded, str(CANONICAL_REGISTRY_PATH))
    if registry.get("schema_version") != 1:
        raise ValidationError(f"{CANONICAL_REGISTRY_PATH}: unsupported schema_version")
    examples = tuple(
        _parse_example(item, index)
        for index, item in enumerate(
            _require_list(registry.get("examples"), f"{CANONICAL_REGISTRY_PATH}.examples")
        )
    )
    if not examples:
        raise ValidationError(f"{CANONICAL_REGISTRY_PATH}: examples must not be empty")
    return examples


def _full_repo_path(repo_root: Path, path: PurePosixPath) -> Path:
    """Resolve a prevalidated registry path below the repository root."""
    full_path = (repo_root / Path(path.as_posix())).resolve()
    if not full_path.is_relative_to(repo_root.resolve()):
        raise ValidationError(f"path escapes repository root: {path}")
    return full_path


def _parse_class_definitions(source: str) -> dict[str, dict[str, str]]:
    """Extract classDef CSS properties from the canonical restricted grammar."""
    definitions: dict[str, dict[str, str]] = {}
    for line in source.splitlines():
        match = CLASS_DEF_RE.fullmatch(line)
        if match is None:
            continue
        properties: dict[str, str] = {}
        for declaration in match.group(2).split(","):
            key, separator, value = declaration.strip().partition(":")
            if not separator or not key or not value:
                properties["<malformed>"] = declaration.strip()
                continue
            properties[key] = value.lower()
        definitions[match.group(1)] = properties
    return definitions


def _parse_class_assignments(source: str) -> dict[str, set[str]]:
    """Return semantic class to assigned node IDs for canonical sources."""
    assignments: dict[str, set[str]] = {}
    for line in source.splitlines():
        match = CLASS_ASSIGNMENT_RE.fullmatch(line)
        if match is None:
            continue
        assignments.setdefault(match.group(2), set()).update(match.group(1).split(","))
    return assignments


def _check_source_contract(example: CanonicalExample, source: str) -> list[str]:
    """Validate one canonical source against the intentionally small grammar."""
    prefix = f"{example.source}"
    findings: list[str] = []
    significant_lines = [line.strip() for line in source.splitlines() if line.strip()]
    if not significant_lines or not FLOW_HEADER_RE.fullmatch(significant_lines[0]):
        findings.append(f"{prefix}: first significant line must be graph/flowchart LR or TB")

    forbidden_tokens = ("C4Context", "C4Container", "architecture-beta")
    for token in forbidden_tokens:
        if token in source:
            findings.append(f"{prefix}: unsupported Mermaid syntax '{token}'")

    declarations = {
        match.group(1)
        for line in source.splitlines()
        if (match := NODE_DECLARATION_RE.match(line)) is not None
    }
    connected_nodes: set[str] = set()
    step_numbers: set[int] = set()
    edge_count = 0
    for line_number, line in enumerate(source.splitlines(), 1):
        if "-->" not in line and "-.->" not in line:
            continue
        match = EDGE_RE.fullmatch(line)
        if match is None:
            findings.append(
                f"{prefix}:{line_number}: edge must be one labeled unidirectional source line"
            )
            continue
        edge_count += 1
        connected_nodes.update((match.group(1), match.group(4)))
        if example.archetype == "narrative":
            step = CIRCLED_STEP_NUMBER.get(match.group(3)[0])
            if step is None:
                findings.append(
                    f"{prefix}:{line_number}: narrative edge label must start with ① through ⑳"
                )
            else:
                step_numbers.add(step)

    if not edge_count:
        findings.append(f"{prefix}: canonical example must contain at least one edge")
    undeclared = connected_nodes.difference(declarations)
    if undeclared:
        findings.append(f"{prefix}: edge references undeclared nodes: {sorted(undeclared)}")
    if len(connected_nodes) > 12:
        findings.append(f"{prefix}: connected node count {len(connected_nodes)} exceeds 12")
    if example.archetype == "narrative" and step_numbers:
        expected_steps = set(range(1, max(step_numbers) + 1))
        if step_numbers != expected_steps:
            findings.append(
                f"{prefix}: narrative step numbers must be contiguous from ①; "
                f"found {sorted(step_numbers)}"
            )

    icon_matches = [
        match
        for line in source.splitlines()
        if (match := ICON_NODE_RE.fullmatch(line)) is not None
    ]
    if example.rendering == "github-native" and icon_matches:
        findings.append(f"{prefix}: GitHub-native example must not contain icon syntax")
    if example.rendering == "icon" and not icon_matches:
        findings.append(f"{prefix}: icon example must contain at least one icon node")

    prefixes: set[str] = set()
    for match in icon_matches:
        attributes = dict(ICON_ATTRIBUTE_RE.findall(match.group(2)))
        if "shape: icon" not in match.group(2):
            findings.append(f"{prefix}: icon node {match.group(1)} must declare shape: icon")
        if not attributes.get("label", "").strip():
            findings.append(f"{prefix}: icon node {match.group(1)} must have a text label")
        icon_name = attributes.get("icon", "")
        icon_prefix, separator, local_name = icon_name.partition(":")
        if not separator or not icon_prefix or not local_name:
            findings.append(f"{prefix}: icon node {match.group(1)} has invalid icon '{icon_name}'")
        else:
            prefixes.add(icon_prefix)

    expected_packs = {f"@iconify-json/{icon_prefix}" for icon_prefix in prefixes}
    if expected_packs != set(example.icon_packs):
        findings.append(
            f"{prefix}: icon_packs must exactly match used prefixes; "
            f"expected {sorted(expected_packs)}, found {sorted(example.icon_packs)}"
        )

    if example.archetype == "narrative":
        definitions = _parse_class_definitions(source)
        if definitions != SEMANTIC_PALETTE:
            findings.append(f"{prefix}: narrative classDef palette differs from the fixed contract")
        assignments = _parse_class_assignments(source)
        assigned_classes = set(assignments)
        missing_required = example.required_classes.difference(assigned_classes)
        if missing_required:
            findings.append(
                f"{prefix}: required semantic classes are unused: {sorted(missing_required)}"
            )
        unknown_assigned = assigned_classes.difference(SEMANTIC_PALETTE)
        if unknown_assigned:
            findings.append(
                f"{prefix}: unknown semantic classes assigned: {sorted(unknown_assigned)}"
            )
        assigned_nodes = set().union(*assignments.values()) if assignments else set()
        unknown_nodes = assigned_nodes.difference(declarations)
        if unknown_nodes:
            findings.append(
                f"{prefix}: classes assigned to undeclared nodes: {sorted(unknown_nodes)}"
            )

    return findings


def _extract_marked_projection(guide: str, marker: str, rendering: RenderingMode) -> str | None:
    """Extract the native fence or icon picture immediately following a marker."""
    marker_line = f"<!-- canonical-mermaid: {marker} -->"
    if guide.count(marker_line) != 1:
        return None
    remainder = guide.split(marker_line, 1)[1].lstrip()
    if rendering == "github-native":
        opening = "```mermaid\n"
        if not remainder.startswith(opening) or "\n```" not in remainder:
            return None
        return remainder[len(opening) :].split("\n```", 1)[0] + "\n"
    if not remainder.startswith("<picture>") or "</picture>" not in remainder:
        return None
    return remainder.split("</picture>", 1)[0] + "</picture>"


def _check_guide_projection(
    example: CanonicalExample, source: str, repo_root: Path
) -> list[str]:
    """Check that the guide projection is unique and current."""
    guide_path = _full_repo_path(repo_root, example.guide.path)
    if not guide_path.is_file():
        return [f"{example.guide.path}: guide projection file is missing"]
    guide = guide_path.read_text(encoding="utf-8")
    projection = _extract_marked_projection(guide, example.guide.marker, example.rendering)
    if projection is None:
        return [
            f"{example.guide.path}: marker '{example.guide.marker}' must have one valid projection"
        ]
    if example.rendering == "github-native":
        if projection != source:
            return [
                f"{example.guide.path}: marker '{example.guide.marker}' differs "
                f"from {example.source}"
            ]
        return []

    if example.renders is None:
        return [f"{example.identifier}: icon projection requires render paths"]
    guide_directory = example.guide.path.parent.as_posix()
    expected_dark = posixpath.relpath(example.renders.dark.as_posix(), guide_directory)
    expected_light = posixpath.relpath(example.renders.light.as_posix(), guide_directory)
    findings: list[str] = []
    if f'srcset="{expected_dark}"' not in projection:
        findings.append(f"{example.guide.path}: icon projection has wrong dark render path")
    if f'src="{expected_light}"' not in projection:
        findings.append(f"{example.guide.path}: icon projection has wrong light render path")
    if re.search(r'alt="[^"]+"', projection) is None:
        findings.append(f"{example.guide.path}: icon projection requires non-empty alt text")
    return findings


def _check_declared_files(example: CanonicalExample, repo_root: Path) -> list[str]:
    """Check mode-specific config and generated-artifact declarations."""
    findings: list[str] = []
    if example.rendering == "github-native":
        if example.icon_packs or example.configs is not None or example.renders is not None:
            findings.append(
                f"{example.identifier}: GitHub-native example must not declare icon artifacts"
            )
        return findings

    if example.configs is None or example.renders is None:
        return [f"{example.identifier}: icon example requires configs and renders"]
    for kind, paths in (("config", example.configs), ("render", example.renders)):
        for theme, path in (("dark", paths.dark), ("light", paths.light)):
            full_path = _full_repo_path(repo_root, path)
            if not full_path.is_file():
                findings.append(f"{example.identifier}: missing {theme} {kind}: {path}")
                continue
            if kind == "render" and not full_path.read_text(
                encoding="utf-8", errors="ignore"
            ).lstrip().startswith("<svg"):
                findings.append(f"{example.identifier}: {theme} render is not an SVG: {path}")
    return findings


def check_canonical_diagrams(repo_root: Path) -> list[str]:
    """Validate only the registered canonical examples and their projections."""
    examples = load_canonical_examples(repo_root)
    findings: list[str] = []
    identifiers = [example.identifier for example in examples]
    if len(identifiers) != len(set(identifiers)):
        findings.append(f"{CANONICAL_REGISTRY_PATH}: example IDs must be unique")
    sources = [example.source for example in examples]
    if len(sources) != len(set(sources)):
        findings.append(f"{CANONICAL_REGISTRY_PATH}: source paths must be unique")
    markers = [example.guide.marker for example in examples]
    if len(markers) != len(set(markers)):
        findings.append(f"{CANONICAL_REGISTRY_PATH}: guide markers must be unique")

    for example in examples:
        source_path = _full_repo_path(repo_root, example.source)
        if not source_path.is_file():
            findings.append(f"{example.source}: canonical source is missing")
            continue
        source = source_path.read_text(encoding="utf-8")
        findings.extend(_check_source_contract(example, source))
        findings.extend(_check_guide_projection(example, source, repo_root))
        findings.extend(_check_declared_files(example, repo_root))
    return findings


def run_checks(repo_root: Path) -> list[str]:
    """Run all checks against a repo root and return the combined findings."""
    findings: list[str] = []
    for check in (
        check_manifests_consistent,
        check_skill_frontmatter,
        check_adr_exists,
        check_canonical_diagrams,
    ):
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

    print("PASS: manifests, skills, ADRs, and canonical diagrams are structurally valid.")
    print("Reminder: run 'claude plugin validate .' locally for the authoritative")
    print("Claude Code check - this script does not replace it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
