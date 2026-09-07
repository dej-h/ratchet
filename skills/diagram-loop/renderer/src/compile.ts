import {readFile} from "node:fs/promises";
import path from "node:path";

import {resolveAssets} from "./assets.js";
import {stableStringify} from "./canonical.js";
import {compileGeometry} from "./compile-geometry.js";
import {CompiledSceneSchema, type CompiledScene} from "./compiled-schema.js";
import {DESIGN_TOKENS} from "./design-tokens.js";
import {designDigest} from "./design-digest.js";
import {
  buildInputManifest,
  collectRendererSources,
  inputDigest,
  type InputManifest,
  type NamedBytes,
} from "./digest.js";
import {loadBundledFont} from "./font.js";
import {atomicWriteFile, readMarkdownFrontmatter, readYamlFile} from "./io.js";
import {assertAbsoluteRunRoot, resolveExistingWithin} from "./paths.js";
import {AssetManifestSchema, RenderPlanSchema, SceneSchema} from "./schema.js";
import {
  loadState,
  recordInputDigest,
  reopenDesign,
  recordRunConfiguration,
  saveState,
} from "./state.js";
import {buildTimeline} from "./timeline.js";

export interface CompileResult {
  scene: CompiledScene;
  inputManifest: InputManifest;
}

function resolvedBytes(
  resolved: Awaited<ReturnType<typeof resolveAssets>>,
  type: "icon" | "file",
): NamedBytes[] {
  return [...resolved.values()]
    .filter((asset) => type === "icon" ? asset.type === "icon" : asset.type !== "icon")
    .map((asset) => ({name: asset.id, bytes: asset.digestBytes}));
}

export async function compileRun(
  runRootValue: string,
  rendererRoot: string,
): Promise<CompileResult> {
  const runRoot = assertAbsoluteRunRoot(runRootValue);
  const state = await loadState(runRoot);
  if (!state.gate_a.approved) throw new Error("Gate A approval is required before compilation");
  let currentDesignDigest: string;
  try {
    currentDesignDigest = await designDigest(runRoot);
  } catch (error) {
    await saveState(runRoot, reopenDesign(state));
    throw error;
  }
  if (state.gate_a.approved_design_digest !== currentDesignDigest) {
    await saveState(runRoot, reopenDesign(state));
    throw new Error("Gate A approval is stale because an approved design input changed");
  }
  const sceneInput = await readYamlFile(runRoot, "scene.yaml");
  const assetInput = await readYamlFile(runRoot, "assets.yaml");
  const renderInput = await readMarkdownFrontmatter(runRoot, "render-plan.md");
  const scene = SceneSchema.parse(sceneInput);
  const assets = AssetManifestSchema.parse(assetInput);
  const plan = RenderPlanSchema.parse(renderInput);
  const font = await loadBundledFont(rendererRoot);
  const resolved = await resolveAssets({rendererRoot, runRoot, scene, manifest: assets});
  const dependencyLock = await readFile(path.join(rendererRoot, "package-lock.json"));
  const rendererSources = await collectRendererSources(rendererRoot);
  const digestSources = {
    scene,
    assets,
    renderPlan: plan,
    materializedAssets: resolvedBytes(resolved, "file"),
    fonts: [{name: "inter-latin-400-normal.woff2", bytes: font.bytes}],
    icons: resolvedBytes(resolved, "icon"),
    rendererSources,
    dependencyLock,
    designTokens: DESIGN_TOKENS,
  };
  const digest = inputDigest(digestSources);
  const inputManifest = buildInputManifest(digestSources);
  const timeline = buildTimeline(scene, plan, font);
  const geometry = await compileGeometry({scene, plan, font, assets: resolved});
  const compiled = CompiledSceneSchema.parse({
    version: 1,
    input_digest: digest,
    title: scene.title,
    kind: scene.kind,
    audience: scene.audience,
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
    duration_in_frames: timeline.durationInFrames,
    final_hold_frames: timeline.finalHoldFrames,
    viewport_inset: plan.viewport_inset,
    endpoint_gap: plan.endpoint_gap,
    route_clearance: plan.route_clearance,
    background: plan.background,
    foreground: plan.foreground,
    diagram_bounds: geometry.diagramBounds,
    font: {family: font.family, data_uri: font.dataUri, sha256: font.sha256},
    nodes: geometry.nodes,
    edges: geometry.edges,
    groups: geometry.groups,
    ...(geometry.concurrency === undefined ? {} : {concurrency: geometry.concurrency}),
    ...(geometry.sequence === undefined ? {} : {sequence: geometry.sequence}),
    timeline: timeline.actions,
    boundary_frames: timeline.boundaryFrames,
  });
  await atomicWriteFile(runRoot, "compiled-scene.json", stableStringify(compiled));
  await atomicWriteFile(runRoot, "input-manifest.json", stableStringify(inputManifest));
  const configured = recordRunConfiguration(
    state,
    scene.kind,
    plan.formats.some((format) => format !== "png") ? "animated" : "static",
  );
  await saveState(runRoot, recordInputDigest(configured, digest));
  return {scene: compiled, inputManifest};
}

export async function loadCompiledScene(runRootValue: string): Promise<CompiledScene> {
  const runRoot = assertAbsoluteRunRoot(runRootValue);
  return CompiledSceneSchema.parse(JSON.parse(
    await readFile(await resolveExistingWithin(runRoot, "compiled-scene.json"), "utf8"),
  ));
}
