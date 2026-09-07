import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {parse} from "yaml";

import {calculateIconHash, resolveAssets} from "../src/assets.js";
import {inputDigest, type InputDigestSources} from "../src/digest.js";
import {AssetManifestSchema, RenderPlanSchema, SceneSchema} from "../src/schema.js";
import {BASE_PLAN, FIXTURE_ROOT, RENDERER_ROOT} from "./helpers.js";

const nodeA = {id: "source", label: "Source", role: "client", importance: "primary"};
const nodeB = {id: "target", label: "Target", role: "service", importance: "primary"};
const edge = {id: "send", from: "source", to: "target", label: "send", role: "primary"};

function sceneFor(kind: "architecture" | "flow" | "feedback" | "sequence" | "concurrency"): unknown {
  const base = {
    version: 1,
    kind,
    title: "Contract",
    audience: "engineer",
    nodes: [nodeA, nodeB],
    edges: [edge],
    groups: [],
    narrative: [
      {action: "reveal", targets: ["source", "target"]},
      {action: "trace", edge: "send"},
      {action: "finalOverview"},
    ],
  };
  if (kind === "architecture" || kind === "flow" || kind === "feedback") {
    return {...base, direction: "lr"};
  }
  if (kind === "concurrency") {
    return {
      ...base,
      lanes: [
        {id: "left", label: "Left", nodes: ["source"]},
        {id: "right", label: "Right", nodes: ["target"]},
      ],
      spans: [
        {node: "source", start: 0, duration: 2, state: "work"},
        {node: "target", start: 2, duration: 2, state: "work"},
      ],
    };
  }
  return base;
}

test("the small scene contract accepts all five core archetypes", () => {
  for (const kind of ["architecture", "flow", "feedback", "sequence", "concurrency"] as const) {
    assert.equal(SceneSchema.parse(sceneFor(kind)).kind, kind);
  }
});

test("animated render plans require both delivery codecs", () => {
  assert.equal(RenderPlanSchema.safeParse({...BASE_PLAN, formats: ["png", "webm"]}).success, false);
  assert.equal(RenderPlanSchema.safeParse({...BASE_PLAN, formats: ["png", "mp4"]}).success, false);
  assert.equal(RenderPlanSchema.safeParse({...BASE_PLAN, formats: ["png", "webm", "mp4"]}).success, true);
});

test("the scene contract rejects renderer coordinates and non-final narratives", () => {
  const scene = sceneFor("architecture") as Record<string, unknown>;
  const nodes = structuredClone(scene.nodes) as Array<Record<string, unknown>>;
  nodes[0] = {...nodes[0], x: 42};
  assert.equal(SceneSchema.safeParse({...scene, nodes}).success, false);
  const narrative = [{action: "reveal", targets: ["source", "target"]}];
  assert.equal(SceneSchema.safeParse({...scene, narrative}).success, false);
  assert.equal(SceneSchema.safeParse({
    ...scene,
    narrative: [
      {action: "reveal", targets: ["send"]},
      {action: "finalOverview"},
    ],
  }).success, false);
  const fiveWordNodes = structuredClone(scene.nodes) as Array<Record<string, unknown>>;
  fiveWordNodes[0] = {...fiveWordNodes[0], label: "one two three four five"};
  assert.equal(SceneSchema.safeParse({...scene, nodes: fiveWordNodes}).success, false);
  const threeLineEdge = structuredClone(scene.edges) as Array<Record<string, unknown>>;
  threeLineEdge[0] = {...threeLineEdge[0], label: "first\nsecond\nthird"};
  assert.equal(SceneSchema.safeParse({...scene, edges: threeLineEdge}).success, false);
  const sequence = sceneFor("sequence") as Record<string, unknown>;
  assert.equal(SceneSchema.safeParse({...sequence, edges: []}).success, false);
});

test("generated partition groups have unique namespace-safe identifiers", () => {
  const concurrency = sceneFor("concurrency") as Record<string, unknown>;
  const duplicateLanes = [
    {id: "same", label: "First", nodes: ["source"]},
    {id: "same", label: "Second", nodes: ["target"]},
  ];
  assert.equal(SceneSchema.safeParse({...concurrency, lanes: duplicateLanes}).success, false);
  assert.equal(SceneSchema.safeParse({
    ...concurrency,
    groups: [{id: "lane--left", label: "Collision", nodes: ["source"]}],
  }).success, false);

  const flow = sceneFor("flow") as Record<string, unknown>;
  assert.equal(SceneSchema.safeParse({
    ...flow,
    stages: [
      {id: "same", label: "First", nodes: ["source"]},
      {id: "same", label: "Second", nodes: ["target"]},
    ],
  }).success, false);
  assert.equal(SceneSchema.safeParse({
    ...flow,
    groups: [{id: "stage--left", label: "Collision", nodes: ["source"]}],
    stages: [
      {id: "left", label: "First", nodes: ["source"]},
      {id: "right", label: "Second", nodes: ["target"]},
    ],
  }).success, false);
});

test("canonical input digests ignore object key order and cover every owned input", () => {
  const base: InputDigestSources = {
    scene: {title: "Example", nodes: [{id: "a", label: "A"}]},
    assets: {version: 1, assets: []},
    renderPlan: {width: 1920},
    materializedAssets: [{name: "screen.png", bytes: Buffer.from("asset")}],
    fonts: [{name: "inter.woff2", bytes: Buffer.from("font")}],
    icons: [{name: "logos:slack-icon", bytes: Buffer.from("icon")}],
    rendererSources: [{name: "src/render.ts", bytes: Buffer.from("source")}],
    dependencyLock: Buffer.from("lock"),
    designTokens: {spacing: 12},
  };
  const reordered: InputDigestSources = {
    ...base,
    scene: {nodes: [{label: "A", id: "a"}], title: "Example"},
  };
  const baseline = inputDigest(base);
  assert.equal(inputDigest(reordered), baseline);
  const mutations: InputDigestSources[] = [
    {...base, scene: {title: "Changed"}},
    {...base, assets: {version: 1, assets: [{id: "new"}]}},
    {...base, renderPlan: {width: 1280}},
    {...base, materializedAssets: [{name: "screen.png", bytes: Buffer.from("changed")}]},
    {...base, fonts: [{name: "inter.woff2", bytes: Buffer.from("changed")}]},
    {...base, icons: [{name: "logos:slack-icon", bytes: Buffer.from("changed")}]},
    {...base, rendererSources: [{name: "src/render.ts", bytes: Buffer.from("changed")}]},
    {...base, dependencyLock: Buffer.from("changed")},
    {...base, designTokens: {spacing: 13}},
  ];
  for (const mutation of mutations) assert.notEqual(inputDigest(mutation), baseline);
});

test("a recognizable local Slack icon resolves only at its locked hash", async () => {
  const [sceneText, assetText] = await Promise.all([
    readFile(path.join(FIXTURE_ROOT, "slack-scene.yaml"), "utf8"),
    readFile(path.join(FIXTURE_ROOT, "slack-assets.yaml"), "utf8"),
  ]);
  const scene = SceneSchema.parse(parse(sceneText));
  const manifest = AssetManifestSchema.parse(parse(assetText));
  assert.equal(
    await calculateIconHash(RENDERER_ROOT, "logos:slack-icon"),
    manifest.assets[0]?.sha256,
  );
  const resolved = await resolveAssets({
    rendererRoot: RENDERER_ROOT,
    runRoot: FIXTURE_ROOT,
    scene,
    manifest,
  });
  assert.match(resolved.get("slack")?.svgBody ?? "", /<path|<g/u);

  const tampered = AssetManifestSchema.parse({
    ...manifest,
    assets: manifest.assets.map((asset) => ({...asset, sha256: "0".repeat(64)})),
  });
  await assert.rejects(
    resolveAssets({rendererRoot: RENDERER_ROOT, runRoot: FIXTURE_ROOT, scene, manifest: tampered}),
    /hash mismatch/u,
  );
});

test("unresolved and path-escaping visual assets fail at the trust boundary", async () => {
  assert.equal(AssetManifestSchema.safeParse({
    version: 1,
    assets: [{
      id: "screen",
      type: "screenshot",
      status: "selected",
      source_url: "https://example.com/capture",
      source_revision: "capture-2026-09-03",
      license_name: "owned",
      license_url: "https://example.com/terms",
      sha256: "0".repeat(64),
      transformations: [],
      path: "../escape.png",
    }],
  }).success, false);
  const unresolved = AssetManifestSchema.parse({
    version: 1,
    assets: [{
      id: "slack",
      type: "icon",
      status: "unresolved",
      source_url: "https://example.com/pending",
      source_revision: "pending",
      license_name: "pending",
      license_url: "https://example.com/terms",
      trademark_url: "https://slack.com/intl/en-gb/brand-guidelines",
      sha256: "0".repeat(64),
      transformations: [],
      ref: "logos:slack-icon",
    }],
  });
  const scene = SceneSchema.parse(sceneFor("architecture"));
  const first = scene.nodes[0];
  if (first === undefined) throw new Error("Fixture scene has no first node");
  scene.nodes[0] = {...first, asset: "slack"};
  await assert.rejects(
    resolveAssets({rendererRoot: RENDERER_ROOT, runRoot: FIXTURE_ROOT, scene, manifest: unresolved}),
    /unresolved asset/u,
  );
  const unapproved = AssetManifestSchema.parse({
    version: 1,
    assets: [{
      id: "slack",
      type: "icon",
      status: "selected",
      source_url: "https://example.com/icon-pack",
      source_revision: "1.0.0",
      license_name: "test",
      license_url: "https://example.com/license",
      sha256: "0".repeat(64),
      transformations: [],
      ref: "unknown:slack",
    }],
  });
  await assert.rejects(
    resolveAssets({rendererRoot: RENDERER_ROOT, runRoot: FIXTURE_ROOT, scene, manifest: unapproved}),
    /unapproved pack/u,
  );
});
