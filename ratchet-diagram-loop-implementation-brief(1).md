# Ratchet `diagram-loop` — implementation brief

Status: build-ready specification, revised after two rendered prototypes  
Purpose: hand this file to the coding agent working in the Ratchet repository

## Decision

Add `diagram-loop` as a sibling skill to `swe-loop`.

Do not turn it into another `swe-loop` profile. Do not replace Ratchet's current Mermaid path. The two outputs serve different jobs:

| Path | Job | Cost and fidelity | Output |
|---|---|---|---|
| `swe-loop` + `mermaid-guide.md` | ADR, architecture-doc, and PR comprehension | Fast, cheap, repository-safe, still reviewed in light and dark themes | GitHub Mermaid or committed light/dark SVG |
| `diagram-loop` | Website hero, portfolio explainer, polished architecture story, animated product/system demo | Deliberate art direction, real assets, pixel review, animation | PNG/SVG poster plus WebM/MP4 |

`swe-loop` must not invoke `diagram-loop` automatically. A diagram requested as part of an ADR or PR continues through `mermaid-guide.md`. Route to `diagram-loop` only when the user explicitly asks for a premium, animated, publication-quality, website, hero, explainer, or product-demo asset.

Adding the skill to Ratchet is itself a repository change, so implement it once through the existing `swe-loop`. After it is installed, a `diagram-loop` run does not make a commit or PR. If a finished visual later needs to be embedded in a website repository, that integration is a separate `swe-loop` change.

## Ratchet behavior to reuse

Reuse the parts of `swe-loop` that already work:

- a fixed-shape `state.md` is the execution cursor and gate authority;
- run state lives outside the target repository;
- every phase transition is persisted;
- exactly two explicit human gates;
- resume loads only the active phase and referenced artifacts;
- fresh-context review happens before verification;
- the reviewed input must be the delivered input;
- evidence lives in its owning artifact, while `state.md` only points to it.

Do not reuse the software-delivery lifecycle: no ADR requirement, task commits, staging convention, test phase, PR description, or PR creation inside a diagram run.

## Installation shape

Follow the Ratchet repository's existing skill directory and naming conventions. Conceptually, place this beside `swe-loop`:

```text
diagram-loop/
  SKILL.md
  references/
    visual-language.md
    diagram-archetypes.md
    asset-policy.md
    review-rubric.md
  templates/
    state.md
    intent.md
    storyboard.md
    scene.yaml
    assets.yaml
    review.md
    result.md
  renderer/
    src/
      schema.ts
      compile-scene.ts
      layouts/
      components/
      compositions/
      review/
    package.json
```

Keep the skill instructions small. Route from `SKILL.md` to only the reference needed by the active phase, in the same spirit as Ratchet's resume rule.

## Run state

Use this external run root:

```text
~/.claude/diagram-loops/<repo-basename>/<slug>/
```

For a URL or product with no repository, use a stable sanitized product or host name in place of `<repo-basename>`.

Each run owns:

```text
state.md            fixed execution cursor and exact gate authority
intent.md           audience, takeaway, inclusion/exclusion, depth, medium
storyboard.md       scenes, reveal order, camera focus, final overview
scene.yaml          small semantic scene contract
assets.yaml         selected assets, provenance, license/source, unresolved items
render-plan.md      dimensions, duration, formats, layout/compiler settings
review.md           geometry, editorial, animation, and revision findings
result.md           short explanation and final artifact paths
renders/
  style-frame.png   inexpensive pre-Gate-A visual direction frame
  contact-sheet.png representative animation frames for review
  final.png         final complete overview/poster
  final.webm
  final.mp4
```

Do not make `state.md` an append-only activity log. Use this fixed conceptual shape and adapt its syntax to Ratchet's existing template conventions:

```yaml
run: <slug>
status: active | blocked | awaiting-gate-a | awaiting-gate-b | closed
phase: 0
archetype: null
medium: null

gate_a:
  approved: false
  wording: null
  approved_design_digest: null

gate_b:
  approved: false
  wording: null
  approved_render_digest: null

current:
  owner_artifact: intent.md
  next_boundary: frame the visual objective

render:
  input_digest: null
  reviewed_input_digest: null
  reviewed_outputs: []

active_blockers: []
evidence_references: []
```

The renderer input digest is the SHA-256 of the canonicalized scene specification, asset manifest, bundled fonts, icon lock, renderer version, design tokens, and export settings. Any change to one of those inputs invalidates pixel review. Gate B may only approve and deliver outputs whose input digest equals `reviewed_input_digest`. This is the diagram equivalent of `swe-loop`'s reviewed-revision invariant.

## Eight phases, two gates

### Phase 0 — Frame and art-direct

Read `state.md` first. Use existing repository understanding, Graphify memory, README/docs, and product context. Do not build another repository scanner.

Use the useful behavior of the public `grill-me` pattern:

- ask one high-value question at a time;
- answer from the repository rather than asking when possible;
- persist every answer immediately;
- make a concise recommendation when a choice is needed;
- stop once execution is concrete.

Resolve:

- audience: `nontechnical`, `mixed`, `engineer`, or `domain-expert`;
- one sentence the viewer should understand;
- one primary narrative;
- concepts that deserve pixels;
- concepts intentionally excluded;
- technical depth and naming;
- archetype;
- static or animated;
- destination and aspect ratio;
- trustworthy assets;
- one visual direction.

Architecture boxes are labels, not documentation. Prefer one to four words, at most two lines, with an optional one-line technical subtitle. For a mixed audience, use a plain role as the primary label and the real technology as the subtitle, for example `Task Queue` / `Azure Service Bus`.

Create `intent.md`, `storyboard.md`, an initial `assets.yaml`, and one inexpensive `style-frame.png`. The style frame should show the real palette, typography, node treatment, icon treatment, and one representative connection. It is not a generic mood board and must not contain invented domain imagery.

**Gate A:** show the user the takeaway, exclusions, storyboard, selected/candidate assets, and style frame. Record the user's exact approval. No final rendering work starts before approval. Asset clarification during Phase 0 is part of design, not a third gate.

### Phase 1 — Specify the scene

Compile the approved design into `scene.yaml`.

Use a deliberately small schema. It describes semantic elements, relationships, grouping, emphasis, and narrative actions. It does not expose coordinates, SVG paths, arbitrary CSS, or arbitrary animation code.

Supported initial archetypes:

- `architecture`: deployable/system relationships;
- `flow`: directional end-to-end behavior;
- `sequence`: actor messages in order;
- `concurrency`: lanes, wait states, and overlapping work;
- `feedback`: an output affects a later iteration;
- `product-demo`: a real application workflow.

Default budget: eight primary concepts, four secondary concepts, two grouping levels. Split the story when it exceeds that budget rather than shrinking everything.

Example contract:

```yaml
version: 1
kind: flow
title: One Slack message. Three clients.
audience: mixed
direction: lr

nodes:
  - id: sender
    label: Client A
    subtitle: sends message
    role: client
  - id: webapp
    label: Webapp API
    subtitle: HTTP ingress
    role: service
    asset: {type: icon, ref: "logos:slack-icon"}

edges:
  - id: submit
    from: sender
    to: webapp
    label: POST message
    role: primary

groups: []

narrative:
  - reveal: [sender, webapp]
  - trace: submit
  - final_overview: true
```

Extend the schema only after a real diagram cannot be expressed with an existing primitive.

### Phase 2 — Resolve assets and compile geometry

Resolve assets in this order:

1. real artifact already present in the repository;
2. real product output or screenshot;
3. official vendor/company/product asset;
4. recognizable software/vendor icon from an approved local Iconify pack;
5. one approved generic line-icon family;
6. a simple text/shape representation.

Never fabricate a logo, screenshot, segmentation mask, chart, scientific image, or other domain-specific visual. If a consequential asset remains unresolved, block and ask one focused question.

Bundle fonts and approved Iconify JSON packs locally and lock their versions. Specific technology keeps its recognizable mark; abstract concepts use one consistent generic icon family.

Measure text with the exact bundled font before graph layout. Compute node dimensions, then pass those dimensions to the layout engine. A label that violates the line or size budget must be shortened in `scene.yaml`; never solve overflow by shrinking text below the minimum.

Every component declares an **inner content-safe area**. Nothing—not text, icons, badges, miniature charts, or decorative marks—may enter the inset between that safe area and the box border. At 1920×1080, default to at least 18 px per side for ordinary nodes and 14 px for intentionally compact supporting nodes. Larger primary nodes should normally use 22–26 px. Scale the inset with the output profile rather than treating those values as universal pixels.

The compiler calculates usable text width explicitly:

```text
usable text width = node width - left/right safe insets - icon width - icon/text gap
```

Validate the measured label and subtitle against that width and validate their combined glyph height against the vertical safe area. A one-pixel violation is a compile failure, not something left for visual review. Edge-label capsules have their own horizontal and vertical insets and follow the same rule.

Use ELK only where graph geometry is the problem:

- pure node-link `architecture`, `flow`, and `feedback`: ELK layered layout, explicit ports, orthogonal routing, stable ordering, generous spacing;
- staged/funnel flows: a deterministic stage template, optionally using ELK only inside a local fan-out/fan-in subgraph;
- `sequence`: fixed participant columns and vertical time, no ELK;
- `concurrency`: deterministic lanes and a time axis, no generic graph layout;
- `product-demo`: capture choreography, no ELK.

Write a deterministic compiled-scene artifact for the renderer.

### Phase 3 — Compose

Use a reusable component and animation grammar, not one-off SVG authoring.

Initial visual components:

- process/service/client/data-store/queue/external-system nodes;
- group boundary and swimlane;
- edge, packet, callout, badge;
- browser frame, cursor, click target;
- real visual-asset frame.

Initial narrative primitives:

- `reveal`, `trace`, `flow`, `highlight`, `dim`, `focus`, `zoom`, `parallel`, `wait`, `finalOverview`.

The renderer owns spacing, wrapping, routes, camera framing, and timing. The model chooses concepts and narrative actions; it never calculates dozens of coordinates or hand-writes large SVG files.

Edges follow a fixed endpoint contract:

- layout routes target explicit node ports;
- the visible path is trimmed by a small design-token gap before each node border;
- the quiet scaffold has no arrow marker;
- the arrowhead is a separate, restrained element rather than a permanent SVG `markerEnd`;
- it stays invisible until the trace reaches its final segment and the destination node exists;
- its opacity follows the final 10–15% of trace progress;
- edges render below nodes, never through their content surface.

This prevents a floating arrowhead from revealing an invisible destination and prevents a large marker from protruding through the destination box.

Routing is a compile-time ownership contract, not a layering trick:

- the first route point must lie on the declared source boundary or port;
- the last route point must lie on the declared destination boundary or port;
- every segment is tested against the expanded bounds of every non-endpoint node;
- default protected route clearance is 12 px at 1920×1080;
- edge-label capsules are tested against node bounds separately;
- a line that belongs to one branch may not pass through a neighboring branch's card;
- rendering an invalid line behind a card does not make the route valid.

This specifically prevents the failure where an edge from one candidate source visually appears to originate from or travel through a different candidate-source card.

Camera moves also follow a viewport-safe contract. The active concept must remain fully inside a viewport inset. Completed context may dim or deliberately leave the frame, but a high-contrast card may not sit half-clipped at an edge. Restore the complete diagram before the final hold.

Narrative pacing is deterministic. For silent website explainers, default to the `deliberate` profile:

```text
caption hold = max(4.8 seconds, 1.25 seconds + 0.32 seconds × word count)
```

Use roughly 0.9–1.4 seconds for a reveal or trace near the start of that hold, then leave the composition stable so the sentence can actually be read. Do not begin the next semantic beat while the current caption is still being processed. Narrated output may instead use forced-alignment timings. A compact/fast profile must be explicitly requested; it is not the default.

### Phase 4 — Render

Render a PNG final frame and, when animated, WebM plus MP4. Finish every animation on the complete useful diagram and hold it long enough to function as a standalone end state. The silent website default is a five-second final hold.

For `product-demo`, Playwright performs the real workflow. Capture crisp state screenshots, clicked-element bounding boxes, routes, action labels, and timing metadata. Record short video only when native UI motion matters. The renderer composes those authentic captures inside a browser frame and adds camera, cursor, and emphasis. Never recreate the product UI.

### Phase 5 — Independent pixel review

Review pixels, not source code alone. A fresh-context reviewer receives only:

- approved `intent.md`;
- final still;
- contact sheet or representative animation frames;
- full animation when needed;
- asset manifest.

Run deterministic checks first:

- no text overflow or unreadably small type;
- every child content bound stays inside its node's declared safe area;
- no unintended node or label overlap;
- no edge crossing a non-endpoint node;
- no arrowhead appears before its trace completes or before its destination is visible;
- visible edge endpoints maintain their configured gap from node content;
- no clipped important content;
- no high-contrast, partially clipped context during a camera move;
- no distorted asset;
- no missing or fake asset;
- final frame contains the complete approved overview;
- output dimensions, duration, and codecs match `render-plan.md`.

Then review editorial quality:

- the starting point and main direction are obvious;
- visual weight matches conceptual importance;
- the abstraction fits the audience;
- concurrency, feedback, retry, or boundary semantics are visible where relevant;
- every element deserves pixels;
- animation explains causality rather than decorating it;
- icons and screenshots are authentic;
- the final frame works without the animation.

The contact sheet is boundary-driven rather than merely time-sampled. For every narrative action, include a frame immediately before it, a representative active frame, and its settled frame when that action can create clipping, overlap, premature arrowheads, or camera problems. Uniformly sampled frames alone are insufficient.

Fix `scene.yaml` or asset selection first, layout parameters second, and renderer code only when the failure is a reusable renderer defect. Cap ordinary automatic refinement at three passes. If the same meaningful defect survives two changes, stop guessing and report it.

### Phase 6 — Verify and export

Verify every required concept, exclusion, audience decision, and narrative beat against the Gate-A-approved `intent.md` and `storyboard.md`. Confirm the current render digest equals the reviewed digest. Generate `result.md` with:

- chosen abstraction and archetype;
- why it fits the audience;
- what was intentionally omitted;
- asset provenance summary;
- final artifact paths and checksums.

For website use, also provide a minimal integration snippet that uses a poster image, `muted`, `playsinline`, no loop, and an `IntersectionObserver` to play once when substantially visible. Reduced-motion users see `final.png`. After playback the complete final frame remains visible.

### Phase 7 — Deliver

Present the final still, animation, and short `result.md` summary.

**Gate B:** the user approves the exact reviewed render. Record the exact wording and render digest, then close the run. If the user requests a visual change, return to the owning phase, invalidate review, rerender, and review again. Do not commit, push, or open a PR.

## Rendering stack

Use this division of responsibility:

```text
intent.md + storyboard.md + assets.yaml
                    ↓
             scene.yaml (Zod)
                    ↓
    font measurement + archetype layout
            ↓                   ↓
       ELK when useful     bespoke lanes/time
                    ↓
          compiled-scene.json
                    ↓
         Remotion React/SVG renderer
                    ↓
  final.png + final.webm/mp4 + contact sheet
                    ↓
       geometry checks + pixel review
```

Recommended packages:

- Remotion for headless `renderMedia()` / `renderStill()`, React composition, and optional web player;
- ELK.js for graph coordinates and routed bend points only;
- Iconify local icon-set packages as a deterministic resolver;
- `@napi-rs/canvas` or equivalent font-aware measurement using the exact bundled font;
- Zod plus YAML parsing for the scene contract;
- Playwright only for real `product-demo` capture.

Do not use Motion Canvas as the default autonomous renderer. Its editor and animation model are strong, but its supported workflow remains editor-oriented and its public headless-render request is still open. Ratchet needs a renderer it can invoke and inspect without automating an editor UI.

Remotion has a commercial licensing boundary: its current free license covers individuals, nonprofits, and for-profit organizations with up to three employees; larger for-profit organizations need a company license. Confirm Ratchet's intended use and distribution fit before merging the dependency. See <https://www.remotion.dev/license>.

## Proven tool flow

This stack was exercised end to end on a grounded example, not only compared on paper:

1. A small YAML scene described Slack's published real-time message path.
2. The compiler validated it with Zod.
3. The exact Inter font was used to measure and wrap every label.
4. Exact node dimensions were passed to ELK.
5. ELK returned layered positions and orthogonal edge bend points.
6. Iconify supplied the official Slack mark and generic client/server glyphs.
7. Remotion rendered an eight-second progressive animation and a final 1920×1080 still.
8. A six-frame contact sheet was inspected for reveal order, clipping, camera framing, and final-state completeness.
9. MP4 and WebM exports were produced from the same reviewed composition.

The example follows Slack Engineering's published high-level path: Client → Webapp API → Admin Server → Channel Server → subscribed Gateway Servers → connected clients. It intentionally reduces the system to one channel and omits startup, presence, storage, failures, and operations. Source: <https://slack.engineering/real-time-messaging/>.

Files supplied with this brief:

- `slack-message.mp4` — primary animated example;
- `slack-message.webm` — website-oriented export;
- `slack-message-final.png` — complete poster/final frame;
- `slack-message-contact-sheet.png` — review evidence.

A second, denser stress test used the topic from ByteByteGo's written guide **“How does Twitter recommend ‘For You’ Timeline in 1.5 seconds?”** The referenced ByteByteGo artifact is a guide/static diagram, not a corresponding video; calling it a video was incorrect. The semantic model came from the guide's five textual stages and Twitter's open-source algorithm/Home Mixer documentation. It exercises four parallel candidate sources, a 500M-to-1,500 reduction, roughly 6,000 hydrated features, a 48M-parameter ranker, four policy filters, supporting modules, camera focus, context dimming, and a final restored overview.

That test exposed renderer invariants that are now enforced:

- the compiler rejected a one-pixel safe-area violation before rendering;
- arrowheads no longer exist on the quiet scaffold and appear only at trace completion;
- the staged-funnel used a bespoke macro layout instead of forcing the entire story through ELK;
- completed stages dim during camera focus and return for the final overview.
- a route must bind to its declared source/destination and clear every unrelated card; z-order is not a substitute for correct geometry;
- the original 13-second pacing is a fast baseline, not the silent-explainer default.

Sources: <https://bytebytego.com/guides/how-does-twitter-recommend-tweets/>, <https://github.com/twitter/the-algorithm>, and <https://github.com/twitter/the-algorithm/blob/main/home-mixer/README.md>.

Second-test files supplied with this revision:

- `twitter-for-you.mp4` — primary 13-second animation;
- `twitter-for-you.webm` — website-oriented export;
- `twitter-for-you-final.png` — complete final overview;
- `twitter-for-you-contact-sheet.png` — eight narrative-boundary frames;
- `twitter-for-you.yaml` — semantic scene input.

A third validation used one grounded subject—Meta's original image-only Segment Anything Model—to prove that archetype selection changes the explanation rather than merely restyling one graph. It produced five separate 32.6–33.2 second animations:

- `architecture`: image and prompt responsibilities converge at the mask decoder;
- `flow`: ordered work from image/prompt input to restored masks;
- `sequence`: `SamPredictor`, image encoder, prompt encoder, and mask decoder interactions, including embedding reuse;
- `concurrency`: an explicitly labeled serving pattern using batched prompt sets after one image encode;
- `feedback`: a corrective click and previous 256×256 logits re-enter the prompt path.

The SAM compiler uses the deliberate caption formula above, a five-second final hold, measured 26×22 px node insets, declared endpoint ownership, 12 px route clearance, and label-vs-node collision checks. Boundary-driven contact sheets caught a dashed-return animation bug that final-frame review could not: repeating SVG dash patterns made future response lines faintly visible. The renderer now reveals dashed paths through an explicit animated mask.

Sources: <https://github.com/facebookresearch/segment-anything>, <https://github.com/facebookresearch/segment-anything/blob/main/segment_anything/predictor.py>, <https://github.com/facebookresearch/segment-anything/blob/main/segment_anything/modeling/prompt_encoder.py>, <https://github.com/facebookresearch/segment-anything/blob/main/segment_anything/modeling/mask_decoder.py>, and <https://arxiv.org/abs/2304.02643>.

## Acceptance tests for the first Ratchet implementation

1. Existing `swe-loop` Mermaid behavior and `mermaid-guide.md` remain unchanged except for an optional one-paragraph routing note.
2. An explicit premium-diagram request creates or resumes the correct external `diagram-loop` state directory.
3. Closing and restarting the agent resumes from the first incomplete boundary without re-asking an approved gate.
4. Gate A and Gate B cannot be inferred from a file, render, checkbox, or prior run.
5. A scene or asset change after review invalidates the reviewed digest.
6. A Slack-like eight-node fixture renders without text overflow, unintended overlap, clipped content, or an edge passing through a non-endpoint node.
7. A denser staged-funnel fixture rejects any content that enters a node's declared safe area, including a one-pixel violation.
8. A trace scaffold has no arrowhead; its restrained arrowhead appears only near completion, after the destination is visible, and maintains the configured endpoint gap.
9. The animation progressively reveals the narrative, keeps active content viewport-safe, and ends on the complete standalone diagram.
10. Specific technologies use recognizable legitimate marks where appropriate; no domain asset is invented.
11. Most visual revision can be done by changing scene data, storyboard, or assets rather than hand-editing SVG or renderer code.
12. `product-demo` can capture one short local application flow with Playwright and use actual states and click coordinates. This is optional for the first core merge and must not block the architecture/flow renderer.
13. Every edge endpoint belongs to its declared source/destination, and every segment clears expanded non-endpoint bounds; a crossed neighboring card is a compile failure.
14. Silent explainers default to reading-time-based captions of at least 4.8 seconds and hold the complete final view for five seconds.
15. Boundary-driven review proves future dashed/return paths remain invisible until their owning narrative action begins.

## Deliberate exclusions

Do not build a repository parser, another Graphify, a general vector language, free-form editor, arbitrary theme marketplace, AI image generator, slide system, collaboration service, Rive/Lottie layer, cloud render service, or PR workflow.

Build one opinionated visual system, six archetypes, a small scene contract, deterministic layout/rendering, authentic asset resolution, durable Ratchet state, and a strict pixel-review loop. Add primitives only when real examples prove they are missing.
