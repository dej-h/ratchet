import assert from "node:assert/strict";
import {rm, writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {renderRun} from "../../src/render.js";
import {recordRunReview} from "../../src/review.js";
import {resolveWithin} from "../../src/paths.js";
import {advancePhase, loadState, saveState} from "../../src/state.js";
import {verifyRun, verifyRunOrInvalidateReview} from "../../src/verify.js";
import {BASE_PLAN, createApprovedRun, RENDERER_ROOT} from "../helpers.js";

test("one composition produces checked PNG, contact sheet, H.264, and VP8 outputs", {
  timeout: 180_000,
}, async (context) => {
  const scene = `version: 1
kind: architecture
title: Media smoke
audience: engineer
direction: lr
nodes:
  - {id: source, label: Source, role: client, importance: primary}
  - {id: target, label: Target, role: service, importance: primary}
edges:
  - {id: send, from: source, to: target, label: "send\\nrequest", role: primary}
groups: []
narrative:
  - {action: reveal, targets: [source, target], caption: Both systems become visible.}
  - {action: trace, edge: send}
  - {action: finalOverview}
`;
  const runRoot = await createApprovedRun({
    scene,
    plan: {
      ...BASE_PLAN,
      width: 640,
      height: 540,
      formats: ["png", "webm", "mp4"],
      pacing: "compact",
      viewport_inset: 32,
    },
  });
  context.after(async () => rm(path.dirname(path.dirname(runRoot)), {recursive: true, force: true}));
  let state = await loadState(runRoot);
  while (state.phase < 4) state = advancePhase(state, state.phase + 1, "media smoke setup");
  await saveState(runRoot, state);
  const browserExecutable = process.env.DIAGRAM_LOOP_BROWSER_EXECUTABLE;
  const manifest = await renderRun({
    runRoot,
    rendererRoot: RENDERER_ROOT,
    ...(browserExecutable === undefined ? {} : {browserExecutable}),
  });
  assert.equal(manifest.composition.width, 640);
  assert.equal(manifest.composition.height, 540);
  assert.equal(manifest.outputs.find((output) => output.format === "mp4")?.codec, "h264");
  assert.equal(manifest.outputs.find((output) => output.format === "webm")?.codec, "vp8");
  await saveState(runRoot, advancePhase(await loadState(runRoot), 5, "review smoke outputs"));
  await recordRunReview(runRoot, [
    "renders/final.png",
    "renders/contact-sheet.png",
    "renders/final.webm",
    "renders/final.mp4",
  ]);
  await saveState(runRoot, advancePhase(await loadState(runRoot), 6, "verify smoke outputs"));
  const verified = await verifyRun({runRoot, rendererRoot: RENDERER_ROOT, requireReview: true});
  assert.equal(verified.reviewed, true);
  assert.equal(verified.renderDigest, manifest.render_digest);
  await writeFile(resolveWithin(runRoot, "renders/final.png"), "changed after review");
  await assert.rejects(
    verifyRunOrInvalidateReview({runRoot, rendererRoot: RENDERER_ROOT, requireReview: true}),
    /Output changed|Unsupported image|decode|PNG/u,
  );
  assert.equal((await loadState(runRoot)).render.reviewed_render_digest, null);
});
