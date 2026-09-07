---
name: diagram-loop
description: >
  Create or revise premium, animated, publication-quality architecture, flow,
  feedback, sequence, and concurrency diagrams. Use
  only when the user explicitly asks for that level of visual output. Do not
  use for ordinary ADR, architecture-document, or PR diagrams; those stay on
  the swe-loop Mermaid path.
---

# diagram-loop

Produce one opinionated visual explanation from approved intent to reviewed
PNG and, when animated, WebM and MP4. A diagram run creates no commit, branch,
PR, or deployment. Embedding a finished artifact in a repository is a separate
software-delivery change.

## Start or resume

1. Resolve a stable run key and slug. Repository runs use the repository base
   name. URL-only work uses a sanitized product or host name.
2. Use `~/.claude/diagram-loops/<run-key>/<slug>/` as the run root.
3. Read `state.md` before any other run artifact. If it exists, load only the
   owner artifact and references named by the active phase, then continue from
   the first incomplete boundary. Never re-ask an approved gate.
4. If no state exists, copy the templates from this skill into the run root
   and begin Phase 0. Persist each answer and transition immediately.

Run the renderer through `node scripts/run-renderer.mjs <command>`. The wrapper
installs the locked runtime into a content-addressed user cache, so an installed
read-only plugin is supported. Before using Remotion, confirm the intended use
is eligible under its current license or that the required company license exists.

Product-demo capture is not part of this release. If the requested result
depends on recorded product interaction, report that boundary before creating
a run or asking for Gate A.

## Non-negotiables

- `state.md` is the fixed-shape cursor and exact gate authority. It is not an
  activity log. CI, files, renders, checkboxes, and prior runs never imply
  human approval.
- There are exactly two human gates. Gate A approves intent, storyboard,
  assets, and the style frame. Gate B approves the exact reviewed render.
- No final rendering starts before Gate A. Asset clarification during Phase 0
  is part of design, not a third gate.
- Run state and generated media stay outside the target repository. Do not
  commit, stage, push, open a PR, or deploy during this loop.
- Never fabricate logos, screenshots, masks, charts, scientific imagery, or
  product output. Consequential unresolved assets block compilation.
- The reviewed input must be the delivered input. A scene, asset, font, icon
  lock, renderer, token, or export change invalidates review. Output checksum
  drift also invalidates review.
- The model chooses concepts, narrative actions, and approved assets. The
  compiler owns coordinates, routes, wrapping, camera framing, and timing.
- Stop automatic refinement after three passes. If the same meaningful defect
  survives two changes, report it instead of guessing again.

## Phase routing

Read only the reference named for the active phase.

### Phase 0: frame and art-direct

Read [visual-language.md](references/visual-language.md) and
[asset-policy.md](references/asset-policy.md). Resolve one item at a time,
answering from existing product or repository evidence when possible:

- audience and one-sentence takeaway;
- primary narrative, included concepts, and explicit exclusions;
- depth, naming, archetype, medium, destination, and aspect ratio;
- trustworthy selected assets;
- one visual direction.

Create `intent.md`, `storyboard.md`, `assets.yaml`, `render-plan.md`, and one inexpensive
`renders/style-frame.png`. The frame must show the real typography, palette,
node, icon, and connection treatment. It is not a mood board.

Gate A presents the takeaway, exclusions, storyboard, selected assets, render
plan, and style frame. Record the user's exact wording and a digest of those
validated inputs.

### Phase 1: specify the scene

Read [diagram-archetypes.md](references/diagram-archetypes.md). Compile the
approved design into the small semantic `scene.yaml` contract. Do not add
coordinates, SVG paths, CSS, or executable animation code. Split the story
instead of exceeding eight primary concepts, four secondary concepts, or two
grouping levels.

### Phase 2: resolve assets and compile geometry

Read [asset-policy.md](references/asset-policy.md). Verify the approved selected
assets are materialized locally with their approved provenance and byte hashes,
then compile. Any manifest or render-plan change returns to Phase 0 and requires
a new Gate A. Text is measured with
the bundled font before layout. A one-pixel safe-area, route-clearance,
endpoint-ownership, label, overlap, or viewport violation is a compile error.

### Phase 3: compose

Read [visual-language.md](references/visual-language.md). Use the shared node,
edge, asset-frame, group, callout, and badge components plus the
supported narrative actions. Fix scene or asset data before changing layout;
change renderer code only for a reusable defect.

### Phase 4: render

Consume the approved `render-plan.md`, then use the renderer to produce
`compiled-scene.json`, `render-manifest.json`, `renders/final.png`, and, for an
animated scene, `renders/final.webm` and `renders/final.mp4`. Generate a
boundary-driven `renders/contact-sheet.png`. The animation must end on the
complete diagram and hold it for the planned final duration.

### Phase 5: independent pixel review

Read [review-rubric.md](references/review-rubric.md). A fresh-context reviewer
receives only the approved intent, final still, contact sheet, animation when
needed, and asset manifest. Run mechanical checks before editorial review.
Record findings in `review.md`. Any change invalidates the previous pass.

### Phase 6: verify and export

Read the approved `intent.md`, `storyboard.md`, and current `review.md`.
Confirm every required concept, exclusion, and beat. Confirm the current input
digest and output checksums equal the reviewed values. Complete `result.md`
with the abstraction, omissions, provenance summary, artifact paths, and
checksums. For website use, include the poster, one-shot inline playback, and
reduced-motion fallback from the result template.

### Phase 7: deliver

Present the final still, animation, and short result summary.

Gate B approves the exact reviewed render. Record the exact wording and render
digest, then close the run. A visual change returns to its owning phase,
invalidates review, rerenders, and repeats independent review.

## Renderer boundary

The renderer accepts run artifacts and emits deterministic compiled and review
artifacts. It never infers or originates approval. The `record-gate` command
only persists the exact approval wording supplied from the active conversation.
Run supported commands through `node scripts/run-renderer.mjs <command>` and
use `--help` for the current arguments.

The core supports architecture, flow, feedback, sequence, and concurrency.
