import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";

import {compileRun} from "../src/compile.js";
import {resolveWithin} from "../src/paths.js";
import {
  advancePhase,
  approveGate,
  closeRun,
  firstIncompleteBoundary,
  initializeRun,
  loadState,
  recordInputDigest,
  recordRenderDigest,
  recordReview,
  invalidateReview,
} from "../src/state.js";
import {createApprovedRun, RENDERER_ROOT} from "./helpers.js";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

function advanceTo(state: ReturnType<typeof approveGate>, target: number) {
  let current = state;
  while (current.phase < target) {
    current = advancePhase(current, current.phase + 1, `enter phase ${current.phase + 1}`);
  }
  return current;
}

test("an external run initializes once and resumes the same active boundary", async (context) => {
  const baseRoot = await mkdtemp(path.join(tmpdir(), "diagram-state-"));
  context.after(async () => rm(baseRoot, {recursive: true, force: true}));
  const options = {
    baseRoot,
    repoKey: "ratchet",
    slug: "premium-architecture",
    templateRoot: path.resolve(RENDERER_ROOT, "..", "templates"),
  };
  const first = await initializeRun(options);
  assert.equal(first.resumed, false);
  assert.equal(first.runRoot, path.join(baseRoot, "ratchet", "premium-architecture"));
  assert.equal(first.state.gate_a.approved, false);
  assert.equal(firstIncompleteBoundary(first.state), 0);

  const second = await initializeRun(options);
  assert.equal(second.resumed, true);
  assert.deepEqual(second.state, first.state);
});

test("gates require exact conversation wording and current reviewed digests", async (context) => {
  const baseRoot = await mkdtemp(path.join(tmpdir(), "diagram-gates-"));
  context.after(async () => rm(baseRoot, {recursive: true, force: true}));
  const initialized = await initializeRun({
    baseRoot,
    repoKey: "ratchet",
    slug: "gates",
    templateRoot: path.resolve(RENDERER_ROOT, "..", "templates"),
  });
  assert.throws(
    () => advancePhase(initialized.state, 1, "specify scene"),
    /Gate A approval is required/u,
  );
  assert.throws(
    () => approveGate({state: initialized.state, gate: "a", wording: " ", digest: DIGEST_A}),
    /exact non-empty user message/u,
  );
  const gateA = approveGate({
    state: initialized.state,
    gate: "a",
    wording: "Yes, use this direction",
    digest: DIGEST_A,
  });
  const phaseOne = advancePhase(gateA, 1, "compile scene.yaml");
  assert.equal(firstIncompleteBoundary(phaseOne), 1);
  assert.equal(phaseOne.gate_a.wording, "Yes, use this direction");

  const phaseFour = advanceTo(phaseOne, 4);
  const rendered = recordRenderDigest(recordInputDigest(phaseFour, DIGEST_A), DIGEST_B);
  const phaseFive = advancePhase(rendered, 5, "review current pixels");
  assert.throws(
    () => approveGate({state: phaseFive, gate: "b", wording: "Ship it", digest: DIGEST_B}),
    /Phase 7 boundary/u,
  );
  const reviewed = recordReview(phaseFive, ["renders/final.png"]);
  const phaseSeven = advanceTo(reviewed, 7);
  assert.throws(
    () => approveGate({state: phaseSeven, gate: "b", wording: "Ship it", digest: DIGEST_C}),
    /does not identify/u,
  );
  const gateB = approveGate({state: phaseSeven, gate: "b", wording: "Ship it", digest: DIGEST_B});
  assert.equal(closeRun(gateB).status, "closed");
});

test("input and output drift both invalidate completed pixel review", async (context) => {
  const baseRoot = await mkdtemp(path.join(tmpdir(), "diagram-drift-"));
  context.after(async () => rm(baseRoot, {recursive: true, force: true}));
  const initialized = await initializeRun({
    baseRoot,
    repoKey: "ratchet",
    slug: "drift",
    templateRoot: path.resolve(RENDERER_ROOT, "..", "templates"),
  });
  const gateA = approveGate({state: initialized.state, gate: "a", wording: "Approved", digest: DIGEST_A});
  const phaseFour = advanceTo(gateA, 4);
  const rendered = recordRenderDigest(recordInputDigest(phaseFour, DIGEST_A), DIGEST_B);
  const reviewed = recordReview(
    advancePhase(rendered, 5, "review current pixels"),
    ["renders/final.png"],
  );
  const inputDrift = recordInputDigest(reviewed, DIGEST_C);
  assert.equal(inputDrift.render.reviewed_input_digest, null);
  assert.equal(inputDrift.gate_b.approved, false);
  const rerendered = recordReview(
    advancePhase(recordRenderDigest(recordInputDigest(inputDrift, DIGEST_C), DIGEST_B), 5, "review again"),
    ["renders/final.png"],
  );
  const outputDrift = recordRenderDigest(rerendered, DIGEST_C);
  assert.equal(outputDrift.render.reviewed_render_digest, null);
  assert.throws(() => closeRun(outputDrift), /Gate B approval/u);
});

test("phase transitions cannot skip required boundaries", async (context) => {
  const baseRoot = await mkdtemp(path.join(tmpdir(), "diagram-phase-skip-"));
  context.after(async () => rm(baseRoot, {recursive: true, force: true}));
  const initialized = await initializeRun({
    baseRoot,
    repoKey: "ratchet",
    slug: "phase-skip",
    templateRoot: path.resolve(RENDERER_ROOT, "..", "templates"),
  });
  const gateA = approveGate({state: initialized.state, gate: "a", wording: "Approved", digest: DIGEST_A});
  assert.throws(() => advancePhase(gateA, 2, "skip phase one"), /exactly one boundary/u);
});

test("changing an approved design artifact makes compilation refuse Gate A", async (context) => {
  const scene = `version: 1
kind: architecture
title: Small graph
audience: engineer
direction: lr
nodes:
  - {id: source, label: Source, role: client, importance: primary}
  - {id: target, label: Target, role: service, importance: primary}
edges:
  - {id: send, from: source, to: target, label: send, role: primary}
groups: []
narrative:
  - {action: reveal, targets: [source, target]}
  - {action: trace, edge: send}
  - {action: finalOverview}
`;
  const runRoot = await createApprovedRun({scene});
  context.after(async () => rm(path.dirname(path.dirname(runRoot)), {recursive: true, force: true}));
  await writeFile(resolveWithin(runRoot, "intent.md"), "# Intent\n\nChanged after approval.\n");
  await assert.rejects(compileRun(runRoot, RENDERER_ROOT), /Gate A approval is stale/u);
  const stateText = await readFile(resolveWithin(runRoot, "state.md"), "utf8");
  assert.match(stateText, /phase: 0/u);
  assert.match(stateText, /approved: false/u);
  assert.match(stateText, /revise and reapprove the Gate A design inputs/u);
});

test("invalidating a closed run reopens its pixel-review boundary", async (context) => {
  const baseRoot = await mkdtemp(path.join(tmpdir(), "diagram-closed-drift-"));
  context.after(async () => rm(baseRoot, {recursive: true, force: true}));
  const initialized = await initializeRun({
    baseRoot,
    repoKey: "ratchet",
    slug: "closed-drift",
    templateRoot: path.resolve(RENDERER_ROOT, "..", "templates"),
  });
  const gateA = approveGate({state: initialized.state, gate: "a", wording: "Approved", digest: DIGEST_A});
  const rendered = recordRenderDigest(recordInputDigest(advanceTo(gateA, 4), DIGEST_A), DIGEST_B);
  const reviewed = recordReview(advancePhase(rendered, 5, "review"), ["renders/final.png"]);
  const gateB = approveGate({state: advanceTo(reviewed, 7), gate: "b", wording: "Approved", digest: DIGEST_B});
  const reopened = invalidateReview(closeRun(gateB));
  assert.equal(reopened.status, "active");
  assert.equal(reopened.phase, 5);
  assert.equal(firstIncompleteBoundary(reopened), 5);
});

test("successful compilation records the chosen archetype and medium", async (context) => {
  const scene = `version: 1
kind: feedback
title: Feedback graph
audience: engineer
direction: lr
nodes:
  - {id: source, label: Source, role: client, importance: primary}
  - {id: target, label: Target, role: service, importance: primary}
edges:
  - {id: return, from: source, to: target, label: response, role: feedback}
groups: []
narrative:
  - {action: reveal, targets: [source, target]}
  - {action: trace, edge: return}
  - {action: finalOverview}
`;
  const runRoot = await createApprovedRun({scene});
  context.after(async () => rm(path.dirname(path.dirname(runRoot)), {recursive: true, force: true}));
  await compileRun(runRoot, RENDERER_ROOT);
  const state = await loadState(runRoot);
  assert.equal(state.archetype, "feedback");
  assert.equal(state.medium, "static");
});
