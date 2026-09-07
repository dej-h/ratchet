import {mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import {createCanvas} from "@napi-rs/canvas";

import {designDigest} from "../src/design-digest.js";
import {rendererRootFromModule} from "../src/io.js";
import {resolveWithin} from "../src/paths.js";
import type {RenderPlan} from "../src/schema.js";
import {approveGate, initializeRun, loadState, saveState} from "../src/state.js";

export const RENDERER_ROOT = rendererRootFromModule(import.meta.url);
export const FIXTURE_ROOT = path.join(RENDERER_ROOT, "test", "fixtures");

export const BASE_PLAN: RenderPlan = {
  version: 1,
  width: 1920,
  height: 1080,
  fps: 30,
  formats: ["png"],
  pacing: "deliberate",
  final_hold_seconds: 5,
  viewport_inset: 64,
  endpoint_gap: 8,
  route_clearance: 12,
  background: "#0b1020",
  foreground: "#f7f8fc",
  remotion_license_basis: "evaluation",
};

function renderPlanMarkdown(plan: RenderPlan): string {
  return `---
version: 1
width: ${plan.width}
height: ${plan.height}
fps: ${plan.fps}
formats: [${plan.formats.join(", ")}]
pacing: ${plan.pacing}
final_hold_seconds: ${plan.final_hold_seconds}
viewport_inset: ${plan.viewport_inset}
endpoint_gap: ${plan.endpoint_gap}
route_clearance: ${plan.route_clearance}
background: "${plan.background}"
foreground: "${plan.foreground}"
remotion_license_basis: ${plan.remotion_license_basis}
---

# Test render plan
`;
}

export async function createApprovedRun(options: {
  scene: string;
  assets?: string;
  plan?: RenderPlan;
}): Promise<string> {
  const baseRoot = await mkdtemp(path.join(tmpdir(), "ratchet-diagram-test-"));
  const initialized = await initializeRun({
    baseRoot,
    repoKey: "ratchet",
    slug: "fixture",
    templateRoot: path.resolve(RENDERER_ROOT, "..", "templates"),
  });
  const runRoot = initialized.runRoot;
  await Promise.all([
    writeFile(resolveWithin(runRoot, "intent.md"), "# Intent\n\nTest-approved visual intent.\n"),
    writeFile(resolveWithin(runRoot, "storyboard.md"), "# Storyboard\n\nTest-approved reveal order.\n"),
    writeFile(resolveWithin(runRoot, "scene.yaml"), options.scene),
    writeFile(resolveWithin(runRoot, "assets.yaml"), options.assets ?? "version: 1\nassets: []\n"),
    writeFile(resolveWithin(runRoot, "render-plan.md"), renderPlanMarkdown(options.plan ?? BASE_PLAN)),
  ]);
  const canvas = createCanvas(64, 36);
  const context = canvas.getContext("2d");
  context.fillStyle = "#0b1020";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await writeFile(resolveWithin(runRoot, "renders/style-frame.png"), canvas.toBuffer("image/png"));
  const digest = await designDigest(runRoot);
  const state = approveGate({
    state: await loadState(runRoot),
    gate: "a",
    wording: "Approve the fixture design",
    digest,
  });
  await saveState(runRoot, state);
  return runRoot;
}
