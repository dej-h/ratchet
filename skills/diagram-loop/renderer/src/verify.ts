import {readFile} from "node:fs/promises";

import {sha256} from "./canonical.js";
import {compileRun} from "./compile.js";
import {frameStateAt} from "./frame-state.js";
import {validateGeometry} from "./geometry.js";
import {readMarkdownFrontmatter, rendererRootFromModule} from "./io.js";
import {assertAbsoluteRunRoot, resolveExistingWithin} from "./paths.js";
import {
  calculateManifestDigest,
  inspectOutput,
  readRenderManifest,
} from "./render-manifest.js";
import {RenderPlanSchema} from "./schema.js";
import {invalidateReview, loadState, saveState} from "./state.js";
import {reviewIsCurrent} from "./digest.js";

export interface VerificationResult {
  inputDigest: string;
  renderDigest: string;
  checkedOutputs: string[];
  reviewed: boolean;
}

function assertCompleteFinalFrame(scene: Awaited<ReturnType<typeof compileRun>>["scene"]): void {
  const state = frameStateAt(scene, scene.duration_in_frames - 1);
  if (Object.values(state.nodeOpacity).some((opacity) => opacity < 1)) {
    throw new Error("The final frame does not contain every node");
  }
  if (Object.values(state.edgeProgress).some((progress) => progress < 1)) {
    throw new Error("The final frame does not contain every edge");
  }
  if (state.cameraTarget !== null || state.cameraScale !== 1) {
    throw new Error("The final frame does not restore the complete camera overview");
  }
}

export async function verifyRun(options: {
  runRoot: string;
  rendererRoot?: string;
  requireReview: boolean;
}): Promise<VerificationResult> {
  const runRoot = assertAbsoluteRunRoot(options.runRoot);
  const {scene} = await compileRun(
    runRoot,
    options.rendererRoot ?? rendererRootFromModule(import.meta.url),
  );
  const [manifest, state, plan] = await Promise.all([
    readRenderManifest(runRoot),
    loadState(runRoot),
    readMarkdownFrontmatter(runRoot, "render-plan.md").then((value) => RenderPlanSchema.parse(value)),
  ]);
  if (manifest.input_digest !== scene.input_digest) {
    throw new Error("Rendered input does not match the current compiled input");
  }
  if (state.render.render_digest !== manifest.render_digest) {
    throw new Error("State does not point to the current render manifest");
  }
  const reviewed = reviewIsCurrent({
    currentInputDigest: scene.input_digest,
    reviewedInputDigest: state.render.reviewed_input_digest,
    currentRenderDigest: manifest.render_digest,
    reviewedRenderDigest: state.render.reviewed_render_digest,
  });
  if (options.requireReview && !reviewed) {
    throw new Error("The current input and render have not completed pixel review");
  }

  validateGeometry({
    width: scene.diagram_bounds.width,
    height: scene.diagram_bounds.height,
    viewportInset: scene.viewport_inset,
    routeClearance: scene.route_clearance,
    endpointGap: scene.endpoint_gap,
    nodes: scene.nodes,
    edges: scene.edges,
    groups: scene.groups,
    ...(scene.sequence === undefined ? {} : {sequenceLifelines: scene.sequence.lifelines}),
  });
  assertCompleteFinalFrame(scene);

  const expectedBoundaries = new Set(scene.timeline.flatMap((action) => [
    action.boundary_frames.before,
    action.boundary_frames.active,
    action.boundary_frames.settled,
  ]));
  const actualBoundaries = new Set(
    manifest.outputs
      .filter((output) => output.kind === "boundary-frame")
      .map((output) => output.frame),
  );
  for (const frame of expectedBoundaries) {
    if (!actualBoundaries.has(frame)) throw new Error(`Missing boundary review frame ${frame}`);
  }

  const expectedFormats = new Set(plan.formats);
  for (const format of expectedFormats) {
    const kind = format === "png" ? "final" : "animation";
    if (!manifest.outputs.some((output) => output.format === format && output.kind === kind)) {
      throw new Error(`Render manifest is missing required ${format} output`);
    }
  }
  if (!manifest.outputs.some((output) => output.kind === "contact-sheet")) {
    throw new Error("Render manifest is missing the boundary-driven contact sheet");
  }

  const inspected = [];
  for (const expected of manifest.outputs) {
    const current = await inspectOutput({
      runRoot,
      relativePath: expected.path,
      kind: expected.kind,
      format: expected.format,
      ...(expected.frame === undefined ? {} : {frame: expected.frame}),
    });
    if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) {
      throw new Error(`Output changed after rendering: ${expected.path}`);
    }
    if (current.width !== expected.width || current.height !== expected.height) {
      throw new Error(`Output dimensions changed after rendering: ${expected.path}`);
    }
    if (expected.kind !== "contact-sheet" && (
      current.width !== scene.width || current.height !== scene.height
    )) {
      throw new Error(`Output dimensions do not match the render plan: ${expected.path}`);
    }
    if (expected.format !== "png") {
      const expectedCodec = expected.format === "mp4" ? "h264" : "vp8";
      if (current.codec !== expectedCodec) {
        throw new Error(`Unexpected ${expected.format} codec: ${current.codec}`);
      }
      const expectedDuration = scene.duration_in_frames / scene.fps;
      if (
        current.duration_seconds === null
        || Math.abs(current.duration_seconds - expectedDuration) > 1 / scene.fps + 0.01
      ) {
        throw new Error(`Output duration does not match the timeline: ${expected.path}`);
      }
    }
    inspected.push(current);
  }
  const digest = calculateManifestDigest(scene.input_digest, inspected);
  if (digest !== manifest.render_digest) {
    throw new Error("Render manifest digest does not match its output checksums");
  }
  const manifestBytes = await readFile(await resolveExistingWithin(runRoot, "render-manifest.json"));
  if (manifestBytes.length === 0 || sha256(manifestBytes).length !== 64) {
    throw new Error("Render manifest is empty or unreadable");
  }
  return {
    inputDigest: scene.input_digest,
    renderDigest: manifest.render_digest,
    checkedOutputs: inspected.map((output) => output.path),
    reviewed,
  };
}

export async function verifyRunOrInvalidateReview(options: {
  runRoot: string;
  rendererRoot?: string;
  requireReview: boolean;
}): Promise<VerificationResult> {
  try {
    return await verifyRun(options);
  } catch (error) {
    const state = await loadState(options.runRoot);
    await saveState(options.runRoot, invalidateReview(state));
    throw error;
  }
}
