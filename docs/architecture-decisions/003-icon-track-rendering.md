# ADR 003: Icon and sticker-fill rendering track (render-and-commit)

- **Status:** accepted
- **Date:** 2026-07-20
- **Loop:** mermaid-icons (`~/.claude/swe-loops/ratchet/mermaid-icons/`)

## Context

ADR 002 shipped the editorial 80% of ByteByteGo's diagram style: numbered
steps, a fixed semantic palette, micro-copy discipline, all native GitHub
mermaid. The remaining 20% — real icons and pastel sticker fills — needs
tooling GitHub's inline renderer doesn't have: GitHub registers no iconify
packs, so icon shapes render as unresolved placeholder boxes there. This PR
stacks on ADR 002's branch and adds that remaining piece as a
render-and-commit track: pre-render with mermaid-cli locally (where icon
packs and full theming work), commit the resulting images, embed them.

Alternatives were compared in the prior conversation's research (D2,
mermaid+render-and-commit, mingrammer); this ADR selects among them and adds
verification the conversation research couldn't do — actually running the
tools rather than reading about them.

## Options considered

### Option A — D2 (d2lang.com)

A second diagram language with first-class icon support and a
purpose-built architecture layout engine (TALA, proprietary; ELK free at
~90% of TALA's quality).

- Pros: closest match to the ByteByteGo look; best-in-class layout for this
  specific job.
- Cons: a second language alongside mermaid, which ADR 001 deliberately
  avoided introducing without proven need (Option C in that ADR: duplication
  is the disease this workflow exists to prevent, and two diagram languages
  is a milder version of the same problem — two things to keep mentally
  consistent). No GitHub-native rendering either way, so D2's main advantage
  over mermaid+icons is layout quality, not capability we're missing.
- Future-feature fit: adopting D2 later, if native mermaid's icon track
  proves insufficient, is a clean superset move — nothing here forecloses it.

### Option B — mermaid + render-and-commit (chosen)

Keep mermaid as the only diagram language (per ADR 001's existing
commitment); for diagrams that warrant the icon/sticker treatment,
pre-render locally with mermaid-cli's `--iconPacks` flag and commit the
result.

- Pros: zero new language, reuses the render-QA pipeline ADR 001 already
  established (mermaid-cli is already a dependency of that workflow), and —
  verified empirically this loop, not assumed — the icon and theming
  features actually work: `--iconPacks @iconify-json/mdi` turns unresolved
  "?" placeholders into real icons (reproduced, see Phase 3), and a targeted
  `themeVariables.titleColor` config override fixes subgraph-title
  legibility on sticker-filled containers in dark mode without disturbing
  anything else (also reproduced).
- Cons: two rendering paths now exist (inline GitHub-native for structural/
  most narrative diagrams, render-and-commit for icon-track diagrams) — a
  reader must know which a given diagram is. Mitigated by the icon track
  living under its own clearly-labeled subsection with its own worked
  example, same pattern ADR 002 used to separate narrative from structural.
- Future-feature fit: this is additive to ADR 002, not a replacement — most
  diagrams stay simple/native; the icon track is reached for deliberately,
  same as narrative vs structural.

### Option C — mingrammer `diagrams` (Python, cloud-provider icon sets)

- Pros: official AWS/Azure/GCP/K8s icons, very agent-writable Python.
- Cons: PNG-only (no dark-theme story at all — verified in the prior
  conversation's research, not just asserted), graphviz layout is rigid, and
  it only covers cloud-topology iconography, not the general-purpose case
  (workflow narratives, arbitrary concepts) this repo needs. Rejected as a
  narrower tool for a narrower slice of the problem than Option B already
  covers more generally.

## Decision

Option B. Given up versus Option A: layout quality (mermaid's dagre-based
default is adequate but not TALA-grade) and a slightly smaller icon
ecosystem than D2's curated architecture set. Accepted, because Option B
needed zero new tooling commitments and every technical claim in this ADR
was verified by actually running the render, not inferred from
documentation — the empirical gaps that would have made D2 clearly worth
its cost (does mermaid's icon support actually work? does theming survive
sticker fills?) turned out not to exist.

## Acceptance criteria (EARS)

- WHEN an icon-track diagram is rendered without `--iconPacks`
  THE SYSTEM SHALL show unresolved placeholder icons — documented as the
  reason the flag is mandatory, not assumed.
- WHEN an icon-track diagram is rendered with `--iconPacks @iconify-json/<set>`
  THE SYSTEM SHALL render the real icons from that set, verified by
  reproduction in both dark and light themes.
- WHEN a sticker-fill container (pastel fill, thick dark stroke) is used in
  the dark-theme render THE SYSTEM SHALL keep the container's title text
  legible via an explicit `themeVariables.titleColor` config override,
  verified by reproduction — the same failure mode ADR 001 found for
  native subgraphs recurs here and gets the analogous fix.
- WHEN icon-track artifacts are committed THE SYSTEM SHALL include the
  `.mmd` source, both theme renders, and the config file(s) used, so the
  render is reproducible, not a one-off image with no provenance.
- WHEN this repo's structural or narrative diagrams are unaffected by this
  PR THE SYSTEM SHALL continue rendering GitHub-native with zero new
  tooling — the icon track is additive, opt-in, and does not change how
  ADR 001/002 diagrams work.

## Feature overview

```mermaid
graph LR
    Author(["👤 Dejan"])
    Source["diagram.mmd"]
    CLI["mermaid-cli
    --iconPacks + config"]
    Dark["dark.svg"]
    Light["light.svg"]
    MD["markdown
    picture tag"]
    GH["GitHub
    render"]

    Author -->|"① write"| Source
    Source -->|"② render x2"| CLI
    CLI -->|"③ dark theme"| Dark
    CLI -->|"③ light theme"| Light
    Dark -->|"④ embed"| MD
    Light -->|"④ embed"| MD
    MD -->|"⑤ view"| GH
```

`docs/architecture.md` is not introduced: this is a documentation-tooling
decision, not a change to the shipped system's architecture.

## Consequences

Easier: diagrams meant to be social/teaching objects (README hero images,
flagship ADRs) can now use real icons and sticker fills with a verified,
reproducible recipe instead of ad hoc one-off image edits. Harder: every
icon-track diagram now ships 3-4 committed files (source + 2 renders +
maybe a config) instead of one markdown code block, and regenerating on
change is a manual step (no CI wiring for this yet — flagged as a known gap
below, not silently absent). Constrains: icon-track diagrams must still
follow the shared rules (numbered steps, micro-copy, node-count ceiling)
from ADR 002 — this ADR adds rendering capability, not a license to abandon
the editorial discipline.

## Known gap (stated, not hidden)

No CI check regenerates or verifies icon-track SVGs stay in sync with their
`.mmd` source. `tools/validate.py` checks manifests/frontmatter/ADR
presence only. A committed SVG could silently drift from its source if
someone edits one without the other. Left unaddressed in this PR
deliberately — it is exactly the kind of machinery-on-probation the loop's
own control-group principle warns against building before it is needed;
revisit if drift actually happens in practice, not preemptively.
