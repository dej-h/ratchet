import assert from "node:assert/strict";
import test from "node:test";

import {CompiledSceneSchema, type CompiledScene} from "../src/compiled-schema.js";
import {loadBundledFont} from "../src/font.js";
import {arrowState, frameStateAt, scaffoldOpacity} from "../src/frame-state.js";
import {RenderPlanSchema, SceneSchema} from "../src/schema.js";
import {buildTimeline, deliberateCaptionSeconds} from "../src/timeline.js";
import {BASE_PLAN, RENDERER_ROOT} from "./helpers.js";

const FONT = await loadBundledFont(RENDERER_ROOT);

function semanticScene() {
  return SceneSchema.parse({
    version: 1,
    kind: "architecture",
    title: "Timing",
    audience: "mixed",
    direction: "lr",
    nodes: [
      {id: "source", label: "Source", role: "client", importance: "primary"},
      {id: "target", label: "Target", role: "service", importance: "primary"},
    ],
    edges: [{id: "send", from: "source", to: "target", label: "send", role: "primary"}],
    groups: [],
    narrative: [
      {action: "reveal", targets: ["source", "target"], caption: "Both systems become visible."},
      {action: "trace", edge: "send", caption: "The request reaches its destination."},
      {action: "finalOverview"},
    ],
  });
}

function compiledScene(): CompiledScene {
  const scene = semanticScene();
  const timeline = buildTimeline(scene, RenderPlanSchema.parse(BASE_PLAN), FONT);
  return CompiledSceneSchema.parse({
    version: 1,
    input_digest: "a".repeat(64),
    title: scene.title,
    kind: scene.kind,
    audience: scene.audience,
    width: 1920,
    height: 1080,
    fps: 30,
    duration_in_frames: timeline.durationInFrames,
    final_hold_frames: timeline.finalHoldFrames,
    viewport_inset: 64,
    endpoint_gap: 8,
    route_clearance: 12,
    background: "#0b1020",
    foreground: "#f7f8fc",
    diagram_bounds: {x: 0, y: 0, width: 1920, height: 800},
    font: {family: "Inter", data_uri: "data:font/woff2;base64,AA==", sha256: "b".repeat(64)},
    nodes: [
      {
        id: "source", label: "Source", role: "client", importance: "primary",
        x: 100, y: 400, width: 200, height: 100,
        safe_area: {x: 124, y: 424, width: 152, height: 52},
        content_bounds: {x: 140, y: 440, width: 120, height: 20},
        label_layout: {
          lines: ["Source"], bounds: {x: 150, y: 440, width: 100, height: 20},
          first_baseline: 456, line_height: 33.6,
        },
        ports: [{id: "source-send", owner: "source", side: "east", x: 300, y: 450}],
      },
      {
        id: "target", label: "Target", role: "service", importance: "primary",
        x: 600, y: 400, width: 200, height: 100,
        safe_area: {x: 624, y: 424, width: 152, height: 52},
        content_bounds: {x: 640, y: 440, width: 120, height: 20},
        label_layout: {
          lines: ["Target"], bounds: {x: 650, y: 440, width: 100, height: 20},
          first_baseline: 456, line_height: 33.6,
        },
        ports: [{id: "target-send", owner: "target", side: "west", x: 600, y: 450}],
      },
    ],
    edges: [{
      id: "send", from: "source", to: "target", label: "send", role: "primary",
      points: [{x: 300, y: 450}, {x: 600, y: 450}],
      visible_points: [{x: 308, y: 450}, {x: 592, y: 450}],
      label_bounds: {x: 420, y: 418, width: 60, height: 28},
      label_layout: {
        lines: ["send"],
        bounds: {x: 432, y: 426, width: 36, height: 12},
        first_baseline: 437,
        line_height: 20.4,
      },
      dashed: false,
      arrow_show_from_progress: 0.88,
    }],
    groups: [],
    timeline: timeline.actions,
    boundary_frames: timeline.boundaryFrames,
  });
}

test("deliberate captions follow reading time and never hold under 4.8 seconds", () => {
  assert.equal(deliberateCaptionSeconds("one two"), 4.8);
  assert.equal(
    deliberateCaptionSeconds("one two three four five six seven eight nine ten eleven twelve"),
    5.09,
  );
});

test("timelines settle work early, emit semantic boundaries, and end with five seconds", () => {
  const scene = semanticScene();
  const timeline = buildTimeline(scene, RenderPlanSchema.parse(BASE_PLAN), FONT);
  assert.equal(timeline.finalHoldFrames, 150);
  assert.equal(timeline.actions.at(-1)?.end_frame, timeline.durationInFrames);
  assert.equal(
    timeline.actions[0]!.active_end_frame - timeline.actions[0]!.start_frame,
    33,
  );
  for (const action of timeline.actions) {
    assert.ok(timeline.boundaryFrames.includes(action.boundary_frames.before));
    assert.ok(timeline.boundaryFrames.includes(action.boundary_frames.active));
    assert.ok(timeline.boundaryFrames.includes(action.boundary_frames.settled));
  }
});

test("future dashed paths stay invisible and arrowheads wait for destination and final segment", () => {
  assert.equal(scaffoldOpacity({
    dashed: true,
    progress: 0,
    sourceVisible: true,
    destinationVisible: true,
  }), 0);
  const points = [{x: 0, y: 0}, {x: 50, y: 0}, {x: 50, y: 50}];
  assert.equal(arrowState({
    points,
    progress: 0.87,
    showFromProgress: 0.88,
    destinationVisible: true,
  }).visible, false);
  assert.equal(arrowState({
    points,
    progress: 0.95,
    showFromProgress: 0.88,
    destinationVisible: false,
  }).visible, false);
  const nearComplete = arrowState({
    points,
    progress: 0.95,
    showFromProgress: 0.88,
    destinationVisible: true,
  });
  assert.equal(nearComplete.visible, true);
  assert.equal(nearComplete.segmentIndex, 1);
  assert.ok(nearComplete.opacity > 0 && nearComplete.opacity < 1);
});

test("frame state progressively reveals the story and restores the complete final overview", () => {
  const scene = compiledScene();
  assert.equal(frameStateAt(scene, 0).nodeOpacity.source, 0);
  const firstActive = frameStateAt(scene, scene.timeline[0]!.boundary_frames.active);
  assert.ok((firstActive.nodeOpacity.source ?? 0) > 0);
  assert.notEqual(firstActive.captionBounds, null);
  assert.equal(firstActive.captionBounds?.y, scene.timeline[0]!.caption_bounds?.y);
  assert.equal(firstActive.edgeProgress.send, 0);
  const traceActive = frameStateAt(scene, scene.timeline[1]!.boundary_frames.active);
  assert.equal(traceActive.nodeOpacity.source, 1);
  assert.ok((traceActive.edgeProgress.send ?? 0) > 0);
  const final = frameStateAt(scene, scene.duration_in_frames - 1);
  assert.deepEqual(final.nodeOpacity, {source: 1, target: 1});
  assert.deepEqual(final.edgeProgress, {send: 1});
  assert.equal(final.cameraTarget, null);
  assert.equal(final.cameraScale, 1);
});

test("narrative behavior changes through scene data without renderer edits", () => {
  const base = semanticScene();
  const changed = SceneSchema.parse({
    ...base,
    narrative: [
      {action: "reveal", targets: ["source", "target"]},
      {action: "highlight", targets: ["target"]},
      {action: "finalOverview"},
    ],
  });
  const timeline = buildTimeline(changed, RenderPlanSchema.parse(BASE_PLAN), FONT);
  const scene = CompiledSceneSchema.parse({
    ...compiledScene(),
    duration_in_frames: timeline.durationInFrames,
    timeline: timeline.actions,
    boundary_frames: timeline.boundaryFrames,
  });
  const active = frameStateAt(scene, timeline.actions[1]!.boundary_frames.active);
  assert.deepEqual([...active.highlighted], ["target"]);
});

test("captions that cannot fit three measured lines fail before rendering", () => {
  const scene = SceneSchema.parse({
    ...semanticScene(),
    narrative: [
      {action: "reveal", targets: ["source", "target"], caption: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen"},
      {action: "finalOverview"},
    ],
  });
  assert.throws(
    () => buildTimeline(scene, RenderPlanSchema.parse({...BASE_PLAN, width: 640, height: 360}), FONT),
    /more than three measured lines/u,
  );
});
