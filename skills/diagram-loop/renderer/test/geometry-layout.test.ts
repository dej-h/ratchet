import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {parse} from "yaml";

import {resolveAssets, type ResolvedAsset} from "../src/assets.js";
import {compileGeometry} from "../src/compile-geometry.js";
import type {CompiledGeometry} from "../src/compile-geometry.js";
import {loadBundledFont} from "../src/font.js";
import {distance, rectContainsRect, rectsOverlap, validateGeometry} from "../src/geometry.js";
import {orthogonalRoute} from "../src/layouts/shared.js";
import {AssetManifestSchema, RenderPlanSchema, SceneSchema, type Scene} from "../src/schema.js";
import {BASE_PLAN, FIXTURE_ROOT, RENDERER_ROOT} from "./helpers.js";

async function compile(
  scene: Scene,
  assets = new Map<string, ResolvedAsset>(),
  plan = BASE_PLAN,
): Promise<CompiledGeometry> {
  return compileGeometry({
    scene,
    plan: RenderPlanSchema.parse(plan),
    font: await loadBundledFont(RENDERER_ROOT),
    assets,
  });
}

function validate(geometry: CompiledGeometry): void {
  validateGeometry({
    width: geometry.diagramBounds.width,
    height: geometry.diagramBounds.height,
    viewportInset: BASE_PLAN.viewport_inset,
    routeClearance: BASE_PLAN.route_clearance,
    endpointGap: BASE_PLAN.endpoint_gap,
    nodes: geometry.nodes,
    edges: geometry.edges,
    groups: geometry.groups,
    ...(geometry.sequence === undefined ? {} : {sequenceLifelines: geometry.sequence.lifelines}),
  });
}

test("orthogonal routes normalize endpoint ports into strict coordinate points", () => {
  const sourcePort = {x: 10, y: 20, id: "source-port", owner: "source", side: "east"};
  const targetPort = {x: 90, y: 60, id: "target-port", owner: "target", side: "west"};
  const route = orthogonalRoute(sourcePort, targetPort, "lr");
  assert.deepEqual(route, [
    {x: 10, y: 20},
    {x: 50, y: 20},
    {x: 50, y: 60},
    {x: 90, y: 60},
  ]);
});

function twoNodeScene(kind: "architecture" | "flow" | "feedback" | "sequence" | "concurrency"): Scene {
  const common = {
    version: 1,
    kind,
    title: `${kind} fixture`,
    audience: "engineer",
    nodes: [
      {id: "source", label: "Source", role: "client", importance: "primary"},
      {id: "target", label: "Target", role: "service", importance: "primary"},
    ],
    edges: [{
      id: "send",
      from: "source",
      to: "target",
      label: "send request",
      role: kind === "feedback" ? "feedback" : "primary",
    }],
    groups: [],
    narrative: [
      {action: "reveal", targets: ["source", "target"]},
      {action: "trace", edge: "send"},
      {action: "finalOverview"},
    ],
  };
  if (kind === "concurrency") {
    return SceneSchema.parse({
      ...common,
      lanes: [
        {id: "source-lane", label: "Source Lane", nodes: ["source"]},
        {id: "target-lane", label: "Target Lane", nodes: ["target"]},
      ],
      spans: [
        {node: "source", start: 0, duration: 2, state: "work"},
        {node: "target", start: 2, duration: 2, state: "work"},
      ],
    });
  }
  return SceneSchema.parse(
    kind === "sequence" ? common : {...common, direction: "lr"},
  );
}

test("all five core archetypes compile to the same checked geometry IR", async () => {
  for (const kind of ["architecture", "flow", "feedback", "sequence", "concurrency"] as const) {
    const geometry = await compile(twoNodeScene(kind));
    assert.equal(geometry.nodes.length, 2);
    assert.equal(geometry.edges.length, 1);
    validate(geometry);
  }
});

test("the Slack-like eight-node fan-out stays measurable and route-safe at 1920x1080", async () => {
  const [sceneText, assetText] = await Promise.all([
    readFile(path.join(FIXTURE_ROOT, "slack-scene.yaml"), "utf8"),
    readFile(path.join(FIXTURE_ROOT, "slack-assets.yaml"), "utf8"),
  ]);
  const scene = SceneSchema.parse(parse(sceneText));
  const manifest = AssetManifestSchema.parse(parse(assetText));
  const assets = await resolveAssets({
    rendererRoot: RENDERER_ROOT,
    runRoot: FIXTURE_ROOT,
    scene,
    manifest,
  });
  const geometry = await compile(scene, assets);
  assert.equal(geometry.nodes.length, 8);
  assert.equal(geometry.edges.length, 7);
  validate(geometry);
  for (const edge of geometry.edges) {
    assert.ok(distance(edge.points[0]!, edge.visible_points[0]!) >= BASE_PLAN.endpoint_gap);
    assert.ok(distance(edge.points.at(-1)!, edge.visible_points.at(-1)!) >= BASE_PLAN.endpoint_gap);
  }
});

test("the staged dense funnel uses deterministic groups and rejects one-pixel safe-area drift", async () => {
  const scene = SceneSchema.parse(parse(
    await readFile(path.join(FIXTURE_ROOT, "dense-funnel-scene.yaml"), "utf8"),
  ));
  const geometry = await compile(scene);
  assert.equal(geometry.nodes.length, 8);
  assert.equal(geometry.groups.length, 5);
  validate(geometry);

  const first = geometry.nodes[0]!;
  const invalid = structuredClone(geometry);
  invalid.nodes[0]!.content_bounds.x = first.safe_area.x - 1;
  assert.throws(() => validate(invalid), /content violates its safe area/u);
});

test("compiled subtitle glyph geometry stays inside the node safe area", async () => {
  const base = twoNodeScene("architecture");
  const scene = SceneSchema.parse({
    ...base,
    nodes: base.nodes.map((node) => node.id === "source"
      ? {...node, subtitle: "sends message"}
      : node),
  });
  const geometry = await compile(scene);
  const source = geometry.nodes.find((node) => node.id === "source")!;
  assert.notEqual(source.subtitle_layout, undefined);
  assert.equal(rectContainsRect(source.safe_area, source.label_layout.bounds), true);
  assert.equal(rectContainsRect(source.safe_area, source.subtitle_layout!.bounds), true);

  const invalid = structuredClone(geometry);
  invalid.nodes.find((node) => node.id === "source")!.subtitle_layout!.bounds.y
    = source.safe_area.y + source.safe_area.height - source.subtitle_layout!.bounds.height + 1;
  assert.throws(() => validate(invalid), /subtitle violates its safe area/u);
});

test("an edge routed through a neighboring card is a compile-time failure", async () => {
  const scene = SceneSchema.parse(parse(
    await readFile(path.join(FIXTURE_ROOT, "dense-funnel-scene.yaml"), "utf8"),
  ));
  const geometry = await compile(scene);
  const invalid = structuredClone(geometry);
  const edge = invalid.edges.find((candidate) => candidate.id === "hydrated")!;
  const source = invalid.nodes.find((node) => node.id === edge.from)!;
  const destination = invalid.nodes.find((node) => node.id === edge.to)!;
  const neighbor = invalid.nodes.find((node) => node.id === "activity")!;
  const start = source.ports.find((port) => port.id.includes(edge.id) && port.owner === source.id)!;
  const end = destination.ports.find((port) => port.id.includes(edge.id) && port.owner === destination.id)!;
  edge.points = [start, {x: neighbor.x + neighbor.width / 2, y: neighbor.y + neighbor.height / 2}, end];
  assert.throws(() => validate(invalid), /crosses non-endpoint node activity/u);
});

test("edge endpoints cannot borrow a port owned by another node", async () => {
  const geometry = await compile(twoNodeScene("architecture"));
  const invalid = structuredClone(geometry);
  invalid.nodes[0]!.ports[0]!.owner = "target";
  assert.throws(() => validate(invalid), /does not belong to source/u);
});

test("reverse staged edges leave from and arrive at the outward node sides", async () => {
  const scene = SceneSchema.parse({
    ...twoNodeScene("flow"),
    stages: [
      {id: "target-stage", label: "Target", nodes: ["target"]},
      {id: "source-stage", label: "Source", nodes: ["source"]},
    ],
  });
  const geometry = await compile(scene);
  validate(geometry);
  const edge = geometry.edges[0]!;
  const source = geometry.nodes.find((node) => node.id === "source")!;
  const target = geometry.nodes.find((node) => node.id === "target")!;
  assert.equal(edge.points[0]?.x, source.x);
  assert.equal(edge.points.at(-1)?.x, target.x + target.width);
  assert.ok(edge.visible_points[0]!.x < source.x);
  assert.ok(edge.visible_points.at(-1)!.x > target.x + target.width);
});

test("staged feedback enters on a vertical target port and stays distinct from the forward path", async () => {
  const scene = SceneSchema.parse({
    version: 1,
    kind: "flow",
    title: "Forward path with recovery",
    audience: "engineer",
    direction: "lr",
    stages: [
      {id: "input", label: "Input", nodes: ["source"]},
      {id: "work", label: "Work", nodes: ["primary", "fallback"]},
      {id: "output", label: "Output", nodes: ["target"]},
    ],
    nodes: [
      {id: "source", label: "Source", role: "client", importance: "primary"},
      {id: "primary", label: "Primary", role: "process", importance: "primary"},
      {id: "fallback", label: "Fallback", role: "service", importance: "secondary"},
      {id: "target", label: "Target", role: "client", importance: "primary"},
    ],
    edges: [
      {id: "forward-in", from: "source", to: "primary", label: "input", role: "primary"},
      {id: "forward-out", from: "primary", to: "target", label: "partials", role: "primary"},
      {id: "recovery", from: "fallback", to: "target", label: "recovery", role: "feedback"},
    ],
    groups: [],
    narrative: [
      {action: "reveal", targets: ["source", "primary", "fallback", "target"]},
      {action: "finalOverview"},
    ],
  });
  const geometry = await compile(scene);
  validate(geometry);
  const target = geometry.nodes.find((node) => node.id === "target")!;
  const recoveryPort = target.ports.find((port) => port.id.includes("recovery"))!;
  const forwardPort = target.ports.find((port) => port.id.includes("forward-out"))!;
  assert.equal(recoveryPort.side, "south");
  assert.equal(forwardPort.side, "west");
});

test("nested groups preserve their parent relationship and containment", async () => {
  const scene = SceneSchema.parse({
    ...twoNodeScene("architecture"),
    groups: [
      {id: "system", label: "System", nodes: ["source"]},
      {id: "boundary", label: "Boundary", nodes: ["target"], parent: "system"},
    ],
  });
  const geometry = await compile(scene);
  const parent = geometry.groups.find((group) => group.id === "system")!;
  const child = geometry.groups.find((group) => group.id === "boundary")!;
  assert.equal(child.parent, "system");
  assert.equal(rectContainsRect(parent.bounds, child.bounds), true);
});

test("parallel edge labels occupy separate measured capsules", async () => {
  const base = twoNodeScene("flow");
  const scene = SceneSchema.parse({
    ...base,
    edges: [
      ...base.edges,
      {id: "retry", from: "source", to: "target", label: "retry later", role: "supporting"},
      {id: "audit", from: "source", to: "target", label: "audit copy", role: "async"},
    ],
    stages: [
      {id: "source-stage", label: "Source", nodes: ["source"]},
      {id: "target-stage", label: "Target", nodes: ["target"]},
    ],
  });
  const geometry = await compile(scene);
  validate(geometry);
  assert.equal(new Set(geometry.edges.map((edge) => `${edge.label_bounds.x}:${edge.label_bounds.y}`)).size, 3);
});

test("concurrency keeps explicit duration and wait-state geometry", async () => {
  const base = twoNodeScene("concurrency");
  if (base.kind !== "concurrency") throw new Error("Expected concurrency fixture");
  const scene = SceneSchema.parse({
    ...base,
    spans: [
      {node: "source", start: 0, duration: 4, state: "work"},
      {node: "target", start: 1, duration: 2, state: "wait"},
    ],
  });
  const geometry = await compile(scene);
  assert.equal(geometry.concurrency?.spans[0]?.duration, 4);
  assert.equal(geometry.concurrency?.spans[1]?.state, "wait");
  assert.ok((geometry.concurrency?.spans[0]?.bounds.width ?? 0) > (geometry.concurrency?.spans[1]?.bounds.width ?? 0));
  const lanes = geometry.groups.filter((group) => group.id.startsWith("lane--"));
  assert.equal(lanes.length, 2);
  assert.equal(rectsOverlap(lanes[0]!.bounds, lanes[1]!.bounds), false);
});

test("authored lane-like group names stay separate from generated concurrency lanes", async () => {
  const base = twoNodeScene("concurrency");
  const scene = SceneSchema.parse({
    ...base,
    groups: [{id: "lane--context", label: "Context", nodes: ["source"]}],
  });
  const geometry = await compile(scene);
  validate(geometry);
  assert.deepEqual(
    geometry.groups.map((group) => group.id).sort(),
    ["lane--context", "lane--source-lane", "lane--target-lane"],
  );
});

test("edge and group label lines compile into contained browser text geometry", async () => {
  const base = twoNodeScene("flow");
  const scene = SceneSchema.parse({
    ...base,
    edges: [{...base.edges[0], label: "send request\nwith context"}],
    groups: [{id: "context", label: "Runtime\ncontext", nodes: ["source"]}],
  });
  const geometry = await compile(scene);
  const edge = geometry.edges[0]!;
  const group = geometry.groups.find((candidate) => candidate.id === "context")!;
  assert.deepEqual(edge.label_layout.lines, ["send request", "with context"]);
  assert.deepEqual(group.label_layout.lines, ["Runtime", "context"]);
  assert.equal(rectContainsRect(edge.label_bounds, edge.label_layout.bounds), true);
  assert.equal(rectContainsRect(group.bounds, group.label_layout.bounds), true);
  validate(geometry);
});

test("top-to-bottom edge capsules avoid compiled group labels", async () => {
  const base = twoNodeScene("architecture");
  const scene = SceneSchema.parse({
    ...base,
    direction: "tb",
    groups: [{id: "target-group", label: "Target group", nodes: ["target"]}],
  });
  const geometry = await compile(scene);
  const edge = geometry.edges[0]!;
  const group = geometry.groups.find((candidate) => candidate.id === "target-group")!;
  assert.equal(rectsOverlap(edge.label_bounds, group.label_layout.bounds), false);
  validate(geometry);
});

test("a stage label that escapes its measured boundary is a compile failure", async () => {
  const base = twoNodeScene("flow");
  const scene = SceneSchema.parse({
    ...base,
    stages: [
      {id: "source-stage", label: "Extraordinarily verbose stage", nodes: ["source"]},
      {id: "target-stage", label: "Target", nodes: ["target"]},
    ],
  });
  await assert.rejects(compile(scene), /label escapes its compiled boundary/u);
});

test("sequence lifelines are compiled and impossible tails fail before rendering", async () => {
  const sequence = twoNodeScene("sequence");
  const geometry = await compile(sequence);
  assert.equal(geometry.sequence?.lifelines.length, 2);
  for (const lifeline of geometry.sequence?.lifelines ?? []) {
    assert.ok(lifeline.end_y <= geometry.diagramBounds.height - BASE_PLAN.viewport_inset);
  }

  const crowded = SceneSchema.parse({
    ...sequence,
    edges: [
      sequence.edges[0],
      {id: "reply", from: "target", to: "source", label: "reply", role: "return"},
    ],
  });
  await assert.rejects(
    compile(crowded, new Map(), {...BASE_PLAN, width: 640, height: 360, viewport_inset: 0}),
    /messages and lifelines do not fit/u,
  );
});

test("captions reserve a non-overlapping diagram viewport", async () => {
  const base = twoNodeScene("architecture");
  const scene = SceneSchema.parse({
    ...base,
    narrative: [
      {action: "reveal", targets: ["source", "target"], caption: "Both systems become visible without covering either card."},
      {action: "finalOverview"},
    ],
  });
  const geometry = await compile(scene);
  assert.ok(geometry.diagramBounds.height < BASE_PLAN.height);
  for (const node of geometry.nodes) {
    assert.ok(node.y + node.height <= geometry.diagramBounds.height - BASE_PLAN.viewport_inset);
  }

  const crowded = SceneSchema.parse({
    ...base,
    narrative: [
      {action: "reveal", targets: ["source", "target"], caption: "word0 word1 word2 word3 word4 word5 word6 word7 word8"},
      {action: "finalOverview"},
    ],
  });
  await assert.rejects(
    compile(crowded, new Map(), {...BASE_PLAN, width: 640, height: 360, viewport_inset: 32}),
    /safe viewport|viewport-safe diagram area/u,
  );
});

test("concurrency labels, spans, and measured axis labels stay disjoint and in-bounds", async () => {
  const base = twoNodeScene("concurrency");
  if (base.kind !== "concurrency") throw new Error("Expected concurrency fixture");
  const geometry = await compile(base, new Map(), {...BASE_PLAN, viewport_inset: 0});
  const viewport = geometry.diagramBounds;
  assert.equal(rectContainsRect(viewport, geometry.concurrency!.axis.start_label.bounds), true);
  assert.equal(rectContainsRect(viewport, geometry.concurrency!.axis.end_label.bounds), true);
  for (const span of geometry.concurrency!.spans) {
    const lane = geometry.groups.find((group) => group.id === `lane--${span.lane}`)!;
    assert.equal(rectsOverlap(lane.label_layout.bounds, span.bounds), false);
  }
});
