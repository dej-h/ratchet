# Mermaid diagram guide

Rules for every diagram produced in this loop (ADRs, architecture overview,
PR descriptions). Grounded in the C4 model notation rules
(https://c4model.com/diagrams/notation, /diagrams/checklist), Microsoft's
architecture-diagram guidance
(https://learn.microsoft.com/en-us/azure/well-architected/architect-role/design-diagrams),
and the mermaid docs (https://mermaid.js.org). Goal: diagrams that
communicate structure at a glance — never five floating boxes with unlabeled
arrows.

## Syntax: GitHub-safe only

- Use **flowchart with `subgraph`** to express C4-style diagrams. Do NOT use
  mermaid's `C4Context`/`C4Container` syntax (officially experimental, poor
  layout, unreliable on GitHub) or `architecture-beta` (its icon packs never
  load on GitHub — only 5 default icons render).
- Target the GitHub-rendered subset: flowchart, sequenceDiagram,
  stateDiagram-v2, erDiagram all render fine
  (https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams).

## Rules (all mandatory)

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

## Canonical example

Adapted from the platform threat model — actors, stroke-only trust
boundaries (theme-safe), protocol-labeled edges, cylinder datastore, dotted
external calls:

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

## Render QA — mandatory for every new or changed diagram

Never ship a diagram you have only read as source. Render it, look at the
pixels, fix what you see, re-render — the same discipline Playwright QA
applies to frontends. Syntax that parses can still render illegibly (title
washout, label-on-node overlap, clipped text at canvas edges, long crossing
edges), and none of that is visible in the source text.

```bash
npx -y @mermaid-js/mermaid-cli -i d.mmd -o d-dark.png  -t dark -b '#0d1117'
npx -y @mermaid-js/mermaid-cli -i d.mmd -o d-light.png -b white
```

(First run downloads a headless browser; cached afterward, renders take
seconds.)

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
