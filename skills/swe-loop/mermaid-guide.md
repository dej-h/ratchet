# Mermaid diagram guide

Rules for every diagram produced in this loop (ADRs, architecture overview,
PR descriptions). Grounded in the C4 model notation rules
(https://c4model.com/diagrams/notation, /diagrams/checklist), Microsoft's
architecture-diagram guidance
(https://learn.microsoft.com/en-us/azure/well-architected/architect-role/design-diagrams),
and the mermaid docs (https://mermaid.js.org). Goal: diagrams that
communicate structure at a glance — never five floating boxes with unlabeled
arrows.

## Two archetypes — pick one before drawing anything

- **Structural** — what exists, and how it's grouped (systems, containers,
  trust boundaries). Rules below in "Structural diagrams." This is the only
  archetype ADR 001 covered.
- **Narrative** — what happens, in order, as one process (a request's path
  through a system, a workflow's phases). Rules in "Narrative diagrams."
  Reach for this when the diagram's job is "follow this sequence," not
  "understand this layout" — mixing the two modes in one canvas is exactly
  what rule 1 below forbids.

Both archetypes share the GitHub-safe syntax and render-QA rules below.
Rendering is a separate choice: GitHub-native mermaid is the default, while
the opt-in icon track pre-renders and commits theme-specific SVGs. Choose the
archetype first, then the rendering mode.

## Syntax: GitHub-safe only

- Use **flowchart with `subgraph`** to express C4-style diagrams. Do NOT use
  mermaid's `C4Context`/`C4Container` syntax (officially experimental, poor
  layout, unreliable on GitHub) or `architecture-beta` (its icon packs never
  load on GitHub — only 5 default icons render).
- Target the GitHub-rendered subset: flowchart, sequenceDiagram,
  stateDiagram-v2, erDiagram all render fine
  (https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams).

## Structural diagrams

### Rules (all mandatory)

1. **One abstraction level per diagram.** Context (system + users + external
   systems), container (deployable units + tech), or component (inside one
   container) — never mixed. Zooming = a second diagram, not more boxes.
2. **Every element is typed by shape, consistently:**
   - person/actor → stadium with emoji: `User(["👤 Browser User"])`
   - service/app → rectangle, technology in the label: `API["FastAPI Backend"]`
   - datastore → cylinder: `DB[("PostgreSQL")]`
   - external system → stadium + dotted edges into it
   - decision → diamond; queue/topic → `@{ shape: das }` (v11.3+)
3. **Every edge: unidirectional, labeled with intent + protocol.**
   `Frontend -->|"REST calls"| API`, `SyncJob -.->|"REST + Bearer token"| GitHub`.
   Arrow points initiator → dependency. Never bidirectional arrows, never a
   bare arrow, never a vague "uses".
4. **Boundaries are named, styled subgraphs** — trust boundary, deployment
   boundary, or container grouping. Dashed stroke, **never a fill**:
   `style web fill:none,stroke:#5577cc,stroke-width:2px,stroke-dasharray:7 4`
   Hard-coded light fills are a proven failure: GitHub's dark theme renders
   subgraph titles in near-white text, which disappears against a pastel
   fill. Stroke-only boundaries stay legible in both themes.
5. **Line style carries meaning:** solid `-->` = in-boundary/synchronous;
   dotted `-.->` = crossing a boundary, external, or async. Be consistent.
6. **≤ ~10–12 nodes per diagram.** Over that: split by zoom level or by
   scenario — never cram.
7. **Direction:** `LR` for request/data-flow chains (client → api → db);
   `TB` for hierarchies. Reorder node declarations to reduce edge crossings.
8. **Consistency across the repo:** same shape = same meaning in every
   diagram; same classDef/style palette; color is never the only carrier of
   meaning (colorblind/print-safe).
9. **Right type for the right question:** structure → flowchart (C4-style);
   runtime order of ONE scenario → sequenceDiagram (shows sync vs async);
   object lifecycle → stateDiagram; data model → erDiagram. Don't force
   runtime behavior into a structure diagram.
10. **When not to diagram:** code-level structure (IDE/tooling territory per
    c4model.com) and trivial changes. A diagram that restates one sentence
    is noise.

### Canonical example

Adapted from the platform threat model — actors, stroke-only trust
boundaries (theme-safe), protocol-labeled edges, cylinder datastore, dotted
external calls:

<!-- canonical-mermaid: platform-threat-model -->
```mermaid
graph LR
    User(["👤 Browser User"])
    GitHubSvc(["👤 GitHub Service"])

    subgraph web["Web Boundary"]
        Frontend["Frontend SPA"]
        API["FastAPI Backend"]
    end

    subgraph private["Private Boundary"]
        DB[("PostgreSQL")]
        SyncJob["GitHub Sync Job"]
    end

    User -.->|"HTTPS"| Frontend
    Frontend -->|"REST calls"| API
    API -->|"SQL queries"| DB
    SyncJob -->|"upserts"| DB
    SyncJob -.->|"REST + Bearer token"| GitHubSvc

    style web     fill:none,stroke:#5577cc,stroke-width:2px,stroke-dasharray:7 4
    style private fill:none,stroke:#4a9970,stroke-width:2px,stroke-dasharray:7 4
```

## Narrative diagrams

For "what happens, in order" instead of "what exists." Grounded in a
decomposition of ByteByteGo's system-design diagrams (blog.bytebytego.com,
youtube.com/@ByteByteGo), split into pure convention (this section) and an
optional render-and-commit pipeline (the icon track below). The conventions
render natively in GitHub mermaid. The icon track can be applied to either
archetype after that choice is made.

### Rules (all mandatory)

1. **Number every step on its edge label**, prefixed with a circled digit:
   `A -->|"① check cache"| B`, `B -->|"② cache miss"| C`. This is what lets
   layout zigzag freely — the reader follows the numbers, not the geometry.
   Unicode circled digits (① U+2460 through ⑳ U+2473) render as plain text,
   no icon dependency.
2. **Semantic color has exactly one meaning per hue, fixed across every
   narrative diagram in this repo** — not chosen per-diagram, and never
   applied to a node it doesn't actually describe just for visual variety:

   | Class | Meaning | classDef |
   |---|---|---|
   | `success` | completed / cache-hit | `fill:#d3f9d8,stroke:#2f9e44,color:#1a3620` |
   | `transport` | data in transit / network call | `fill:#d0ebff,stroke:#1971c2,color:#0b3866` |
   | `protocol` | an in-flight message worth naming (header, status code) | `fill:#fff3bf,stroke:#e8a400,color:#5c4500` |
   | `blocked` | error / miss / failure path | `fill:#ffe3e3,stroke:#e03131,color:#5c1a1a` |
   | `decision` | a gate or data-at-rest point | `fill:#e5dbff,stroke:#7048e8,color:#2c1a5c` |

   All five `classDef`s set fill+stroke+explicit text color, so contrast
   holds in both GitHub themes without per-theme images. Apply with
   `class NodeName success`. A diagram whose domain has no network calls or
   protocol messages simply doesn't use those two classes — leaving a class
   unused is correct; misapplying one to a node it doesn't describe, purely
   for variety, is the one thing this rule forbids.
3. **Micro-copy: 1-3 words per node label.** Explanatory sentences belong in
   the surrounding prose, never the canvas. Target the whole diagram under
   roughly 100-120 words total (labels + edge annotations combined) — past
   that, it is two diagrams pretending to be one; split it.
4. Everything else — direction, node-count ceiling, edge-crossing
   discipline, the render-QA loop, the self-check — is unchanged from the
   structural rules above. A narrative diagram is a flowchart with these
   four additional conventions layered on, not a different syntax.

### Canonical example

The swe-loop workflow's own 8 phases and 2 gates, as a narrative diagram —
numbered edges (rule 1), micro-copy (rule 3), and only the palette classes
this domain actually has: `decision` for the two gates (reinforcing the
diamond shape already required by the structural rules — shape and color
agree, never conflict) and `success` for the terminal close. Nothing here
is a network call or an in-flight protocol message, so `transport` and
`protocol` are correctly unused, not forced in for variety:

<!-- canonical-mermaid: swe-loop -->
```mermaid
graph TB
    Start(["👤 Dejan"])
    P0["Design
    ADR + options"]
    GateA{"Gate A
    approve?"}
    P1["Plan
    tasks + budget"]
    P2["Context
    reuse check"]
    P3["Implement
    one task/commit"]
    P4["Test
    plan first"]
    P5["Review
    fresh context"]
    P6["Verify
    vs ADR"]
    GateB{"Gate B
    approve?"}
    Done["Closed
    memory updated"]

    Start -->|"① design"| P0
    P0 -->|"② request approval"| GateA
    GateA -->|"③ approved"| P1
    GateA -->|"③ amend"| P0
    P1 -->|"④ plan"| P2
    P2 -->|"⑤ context"| P3
    P3 -->|"⑥ implement"| P4
    P4 -->|"⑦ test"| P5
    P5 -->|"⑧ review"| P6
    P6 -->|"⑨ verify"| GateB
    GateB -->|"⑩ approved"| Done
    GateB -->|"⑩ fix"| P3

    class GateA decision
    class GateB decision
    class Done success

    classDef success   fill:#d3f9d8,stroke:#2f9e44,color:#1a3620
    classDef transport fill:#d0ebff,stroke:#1971c2,color:#0b3866
    classDef protocol  fill:#fff3bf,stroke:#e8a400,color:#5c4500
    classDef blocked   fill:#ffe3e3,stroke:#e03131,color:#5c1a1a
    classDef decision  fill:#e5dbff,stroke:#7048e8,color:#2c1a5c
```

Passed render QA (dark + light, mermaid-cli) before shipping: node text
stays legible in both themes because color is set explicitly per class
rather than left to theme defaults — the same lesson ADR 001 learned about
subgraph titles applies to node fills, with the fix being the opposite move
(declare the color, don't omit it). Unclassed nodes (the six regular phase
steps) use mermaid's own theme-adaptive default styling and need no
explicit color at all — confirmed legible in both renders.

### Canonical infrastructure example: automated full-stack review

This example is grounded in `voortman-ai-sandbox/infrastructure` at commit
`99baa4b2af97285cc50b3afaef4abe9bbd2ae12c`, specifically the relay,
`review-listener.yml`, and deterministic result publisher. It shows the
automated full-stack route only. Manual `workflow_dispatch` deliberately
skips the branch-policy gate, so it is outside this scenario.

Every palette class has a real job here: the webhook is transport; dispatch
and pending status are protocol messages; relay, branch, security,
full-stack, and AI decisions are gates; failed review is blocked; passing
review is success. Source:
[voortman-fullstack-review.mmd](../../docs/diagrams/voortman-fullstack-review.mmd).

<!-- canonical-mermaid: voortman-fullstack-review -->
```mermaid
graph TB
    Webhook["PR webhook"]
    Relay{"Relay gate"}
    Dispatch["Review dispatch"]
    Pending["Pending status"]
    Branch{"Branch gate"}
    Security{"Security gate"}
    FullStack{"Full-stack gate"}
    Review{"AI review"}
    Failed["Review failed"]
    Passed["Review passed"]

    Webhook -->|"① receive"| Relay
    Relay -->|"② eligible"| Dispatch
    Dispatch -->|"③ queue review"| Pending
    Pending -->|"④ check policy"| Branch
    Branch -->|"⑤ branch blocked"| Failed
    Branch -->|"⑤ branch allowed"| Security
    Security -->|"⑥ scans fail"| Failed
    Security -->|"⑥ scans pass"| FullStack
    FullStack -->|"⑦ verify fails"| Failed
    FullStack -->|"⑦ verify passes"| Review
    Review -->|"⑧ fail / human"| Failed
    Review -->|"⑧ pass"| Passed

    class Webhook transport
    class Dispatch,Pending protocol
    class Relay,Branch,Security,FullStack,Review decision
    class Failed blocked
    class Passed success

    classDef success   fill:#d3f9d8,stroke:#2f9e44,color:#1a3620
    classDef transport fill:#d0ebff,stroke:#1971c2,color:#0b3866
    classDef protocol  fill:#fff3bf,stroke:#e8a400,color:#5c4500
    classDef blocked   fill:#ffe3e3,stroke:#e03131,color:#5c1a1a
    classDef decision  fill:#e5dbff,stroke:#7048e8,color:#2c1a5c
```

## Rendering mode: icon track (render-and-commit)

The remaining 20% of the ByteByteGo look: real icons and pastel sticker
fills. This is a rendering mode for structural or narrative diagrams, not a
third archetype. GitHub's inline mermaid renderer registers no iconify packs,
so icon shapes there show unresolved placeholder boxes, verified by rendering
the same source with and without the flag below. This track exists to unlock
icons anyway, by pre-rendering locally and committing the result. It is
**opt-in and additive**. Reach for it only for diagrams meant as social or
teaching objects (a README hero diagram, a flagship ADR); everything else
stays plain GitHub-native mermaid per the rules above.

**Icons need locally served icon packs, always.** Registered icon examples use
the repository's locked renderer, which reads exact package versions from
`tools/diagrams/package-lock.json`, serves their Iconify JSON from loopback,
and supplies those URLs to Mermaid CLI:

```bash
cd tools/diagrams
npm ci
npm run diagrams:write
npm run diagrams:check
```

Install each new Iconify package through the resolver from `tools/diagrams`
(for example, `npm install --save-dev @iconify-json/mdi`), then add its package
name plus the source, dark/light configs, and output paths to
`docs/diagrams/canonical-examples.json`. The write command renders every
registered example twice, rejects unresolved icon placeholders, and only then
replaces committed icon SVGs. The check command repeats that process and
requires byte-identical committed artifacts.

Use flowchart icon-shape syntax: `A@{ shape: icon, icon: "mdi:account",
label: "Browser", pos: "t" }`. Prefix convention: `mdi:` (Material Design
Icons) for generic concepts such as person, database, server, and checkmark;
`logos:` for real product/vendor logos when the diagram is specifically about
a tech stack. Every prefix used in the source needs its matching package in
`tools/diagrams/package.json` and the registry entry's `icon_packs` field. Do
not mix prefixes for the same kind of thing across one diagram.

Icon plus label replaces the structural shape vocabulary in this mode. The
pair carries the type, so every icon must keep its text label and the same
concept must use the same icon across the repo. The other structural and
narrative rules still apply, including numbered edges, line-style semantics,
node limits, and semantic color.

**Sticker-fill containers need one extra config**, not just a `style` line.
A pastel-filled subgraph (`style lookup fill:#f4f1e8,stroke:#4a4438,
stroke-width:3px`; sticker fills, unlike structural boundaries, are allowed
here because the render is pre-committed, not left to GitHub's live theme)
has a title rendered in near-white text on **dark** renders regardless of
the fill. This is the same root cause as the structural-boundary lesson above,
recurring because mermaid's `-t dark` flag still governs cluster title
color independent of `style`. Tested three fixes; only one worked without
side effects:

- `theme: "base"` full override broke everything else (every node turned
  the theme's default accent color).
- `themeVariables.clusterTextColor` had no effect (wrong variable name).
- `themeVariables.titleColor` on top of `theme: "dark"` fixed exactly the
  title, nothing else. This is `mermaid-dark-titlecolor.json` above:
  ```json
  {"theme": "dark", "themeVariables": {"titleColor": "#2b2200"}}
  ```
  Light-theme renders need no override. Default cluster title text is
  already dark/legible against pastel fills there.

Use a neutral sticker fill outside the five semantic palette hues. A sticker
is grouping, not a protocol or state. On a light sticker in the dark render,
bare icons inherit a low-contrast foreground. Give sticker-contained icons a
filled form such as `form: "rounded"`; the worked example uses that form and
passes visual inspection in both themes.

**Commit three files per icon-track diagram:** the `.mmd` source and both
theme renders. Sticker-fill diagrams also use the shared
`mermaid-dark-titlecolor.json`; only the first such diagram introduces that
config. Embed with GitHub's theme-aware picture tag. Paths are relative to
the Markdown file containing the tag:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/name-dark.svg">
  <img src="docs/diagrams/name-light.svg" alt="description">
</picture>
```

**Worked example:** a request's path through cache, DNS, and server,
demonstrating icons, a sticker-fill container, and the narrative rules
above (numbered edges, micro-copy) together. Source:
[cache-lookup-icons.mmd](../../docs/diagrams/cache-lookup-icons.mmd).

<!-- canonical-mermaid: cache-lookup-icons -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/diagrams/cache-lookup-icons-dark.svg">
  <img src="../../docs/diagrams/cache-lookup-icons-light.svg" alt="Browser icon connects through a numbered flow to a sticker-filled Cache Lookup container holding cache and DNS icons, then to a server icon, then to a checkmark loaded icon">
</picture>

**Canonical infrastructure icon example:** the fail-before-update full-stack
deployment path from `voortman-ai-sandbox/infrastructure` at commit
`99baa4b2af97285cc50b3afaef4abe9bbd2ae12c`. The exact tested SHA becomes a
GHCR digest, that digest is imported into ACR without rebuilding, migrations
run against the new digest while the current app image stays active, and the
app rolls forward only after migration success. Source:
[voortman-fullstack-deploy-icons.mmd](../../docs/diagrams/voortman-fullstack-deploy-icons.mmd).

<!-- canonical-mermaid: voortman-fullstack-deploy-icons -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/diagrams/voortman-fullstack-deploy-icons-dark.svg">
  <img src="../../docs/diagrams/voortman-fullstack-deploy-icons-light.svg" alt="Numbered full-stack deployment flow from a GitHub main push through relay, tested digest, ACR import, migration and health gates to either failed or running status">
</picture>

The renderer contract is locked by `tools/diagrams/.node-version` and
`package-lock.json`. CI runs the structural validator, renderer contract tests,
and `npm run diagrams:check`, so source/config drift, nondeterministic output,
an unresolved icon fallback, or a stale committed SVG fails the PR.

## Render QA — mandatory for every new or changed diagram

Never ship a diagram you have only read as source. Render it, look at the
pixels, fix what you see, re-render — the same discipline Playwright QA
applies to frontends. Syntax that parses can still render illegibly (title
washout, label-on-node overlap, clipped text at canvas edges, long crossing
edges), and none of that is visible in the source text.

For registered canonical diagrams, first run the locked write/check workflow
above. For an exploratory unregistered source, install the same lockfile with
`npm ci` and invoke `tools/diagrams/node_modules/.bin/mmdc` directly to create
dark and light PNG previews. Do not use a floating `npx` package version as
evidence for a canonical artifact.

Inspect BOTH images and check:

1. Every subgraph title and edge label legible in the dark render — title
   washout on dark is the most common failure.
2. No edge label sitting on top of a node; no text clipped at a canvas edge.
3. Edges traceable: no long crossings, no edge whose origin box is
   ambiguous. Reorder node/subgraph declarations to fix routing.
4. The actor/initiator sits where the flow starts reading (left in LR, top
   in TB), not floating at the far edge.

Fix, re-render, repeat until every point passes; then run the self-check
below on the final render. GitHub's exact theme differs slightly from
mermaid-cli's, but every failure listed above reproduces in both.

## Self-check before shipping a diagram

The C4 review checklist, condensed: does it have a clear scope? Is every
element named with purpose (and technology) clear? Is every line labeled with
intent, direction matching the label? Is the meaning of every shape, color,
and line style unambiguous? Would a reader who wasn't in this session
understand it cold?
