import {copyFile, mkdir, readFile} from "node:fs/promises";
import {homedir} from "node:os";
import path from "node:path";

import {z} from "zod";
import {parse, stringify} from "yaml";

import {reviewIsCurrent} from "./digest.js";
import {atomicWriteFile} from "./io.js";
import {
  assertManagedRunRoot,
  ensureDirectoryWithin,
  parseRunKey,
  resolveExistingWithin,
  resolveWithin,
  resolveWritableWithin,
} from "./paths.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const NullableDigestSchema = DigestSchema.nullable();
const GateSchema = z.object({
  approved: z.boolean(),
  wording: z.string().min(1).nullable(),
  approved_design_digest: NullableDigestSchema.optional(),
  approved_render_digest: NullableDigestSchema.optional(),
}).strict();
const PhaseStatusSchema = z.enum(["pending", "active", "done", "blocked"]);

export const DiagramStateSchema = z.object({
  run: z.string().min(1),
  repo_key: z.string().min(1),
  status: z.enum(["active", "blocked", "awaiting-gate-a", "awaiting-gate-b", "closed"]),
  phase: z.number().int().min(0).max(7),
  archetype: z.enum([
    "architecture", "flow", "sequence", "concurrency", "feedback",
  ]).nullable(),
  medium: z.enum(["static", "animated"]).nullable(),
  gate_a: GateSchema,
  gate_b: GateSchema,
  current: z.object({
    owner_artifact: z.string().min(1),
    next_boundary: z.string().min(1),
  }).strict(),
  phases: z.record(z.string(), PhaseStatusSchema),
  render: z.object({
    input_digest: NullableDigestSchema,
    reviewed_input_digest: NullableDigestSchema,
    render_digest: NullableDigestSchema,
    reviewed_render_digest: NullableDigestSchema,
    reviewed_outputs: z.array(z.string()),
  }).strict(),
  active_blockers: z.array(z.string()),
  evidence_references: z.array(z.string()),
}).strict();

export type DiagramState = z.infer<typeof DiagramStateSchema>;

const OWNER_ARTIFACTS = [
  "intent.md",
  "scene.yaml",
  "assets.yaml",
  "storyboard.md",
  "render-plan.md",
  "review.md",
  "result.md",
  "result.md",
] as const;

const TEMPLATE_FILES = [
  "intent.md",
  "storyboard.md",
  "scene.yaml",
  "assets.yaml",
  "render-plan.md",
  "review.md",
  "result.md",
] as const;

export function defaultDiagramRoot(): string {
  return path.join(homedir(), ".claude", "diagram-loops");
}

export function firstIncompleteBoundary(state: DiagramState): number | null {
  for (let phase = 0; phase <= 7; phase += 1) {
    if (state.phases[String(phase)] !== "done") return phase;
  }
  return null;
}

export async function loadState(runRoot: string): Promise<DiagramState> {
  const statePath = await resolveExistingWithin(runRoot, "state.md");
  return DiagramStateSchema.parse(parse(await readFile(statePath, "utf8")));
}

export async function saveState(runRoot: string, state: DiagramState): Promise<void> {
  const parsed = DiagramStateSchema.parse(state);
  await atomicWriteFile(
    runRoot,
    "state.md",
    `# Diagram loop state. This file is YAML despite its Markdown extension.\n${stringify(parsed, {lineWidth: 100})}`,
  );
}

export async function initializeRun(options: {
  baseRoot?: string;
  repoKey: string;
  slug: string;
  templateRoot: string;
}): Promise<{runRoot: string; state: DiagramState; resumed: boolean}> {
  const baseRoot = path.resolve(options.baseRoot ?? defaultDiagramRoot());
  const repoKey = parseRunKey(options.repoKey, "repo key");
  const slug = parseRunKey(options.slug, "slug");
  await mkdir(baseRoot, {recursive: true});
  await ensureDirectoryWithin(baseRoot, repoKey);
  const runRoot = await ensureDirectoryWithin(baseRoot, `${repoKey}/${slug}`);
  if (options.baseRoot === undefined) await assertManagedRunRoot(runRoot);
  await ensureDirectoryWithin(runRoot, "renders");
  try {
    const state = await loadState(runRoot);
    return {runRoot, state, resumed: true};
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
  }
  const state: DiagramState = DiagramStateSchema.parse({
    run: slug,
    repo_key: repoKey,
    status: "active",
    phase: 0,
    archetype: null,
    medium: null,
    gate_a: {approved: false, wording: null, approved_design_digest: null},
    gate_b: {approved: false, wording: null, approved_render_digest: null},
    current: {owner_artifact: "intent.md", next_boundary: "frame the visual objective"},
    phases: Object.fromEntries(Array.from({length: 8}, (_, phase) => [
      String(phase), phase === 0 ? "active" : "pending",
    ])),
    render: {
      input_digest: null,
      reviewed_input_digest: null,
      render_digest: null,
      reviewed_render_digest: null,
      reviewed_outputs: [],
    },
    active_blockers: [],
    evidence_references: [],
  });
  for (const file of TEMPLATE_FILES) {
    await copyFile(resolveWithin(options.templateRoot, file), await resolveWritableWithin(runRoot, file));
  }
  await saveState(runRoot, state);
  return {runRoot, state, resumed: false};
}

function rewindToPhase(state: DiagramState, phase: number, nextBoundary: string): DiagramState {
  const phases = {...state.phases};
  for (let index = 0; index < phase; index += 1) phases[String(index)] = "done";
  phases[String(phase)] = "active";
  for (let index = phase + 1; index <= 7; index += 1) phases[String(index)] = "pending";
  return DiagramStateSchema.parse({
    ...state,
    status: "active",
    phase,
    phases,
    current: {owner_artifact: OWNER_ARTIFACTS[phase], next_boundary: nextBoundary},
  });
}

export function invalidateReview(state: DiagramState): DiagramState {
  const invalidated = DiagramStateSchema.parse({
    ...state,
    status: state.status === "closed" ? "active" : state.status,
    gate_b: {approved: false, wording: null, approved_render_digest: null},
    render: {
      ...state.render,
      reviewed_input_digest: null,
      reviewed_render_digest: null,
      reviewed_outputs: [],
    },
  });
  return state.phase >= 5
    ? rewindToPhase(invalidated, 5, "repeat pixel review for the current render")
    : invalidated;
}

export function reopenDesign(state: DiagramState): DiagramState {
  const reset = DiagramStateSchema.parse({
    ...state,
    status: "active",
    archetype: null,
    medium: null,
    gate_a: {approved: false, wording: null, approved_design_digest: null},
    gate_b: {approved: false, wording: null, approved_render_digest: null},
    render: {
      input_digest: null,
      reviewed_input_digest: null,
      render_digest: null,
      reviewed_render_digest: null,
      reviewed_outputs: [],
    },
  });
  return rewindToPhase(reset, 0, "revise and reapprove the Gate A design inputs");
}

export function recordInputDigest(state: DiagramState, digest: string): DiagramState {
  DigestSchema.parse(digest);
  const invalidated = state.render.input_digest === digest ? state : invalidateReview(state);
  const updated = DiagramStateSchema.parse({
    ...invalidated,
    render: {
      ...invalidated.render,
      input_digest: digest,
      ...(state.render.input_digest === digest ? {} : {render_digest: null}),
    },
  });
  return state.render.input_digest !== null && state.render.input_digest !== digest
    ? rewindToPhase(updated, 4, "rerender the changed compiled input")
    : updated;
}

export function beginRender(state: DiagramState): DiagramState {
  if (state.phase < 4) throw new Error("Rendering starts only after entering Phase 4");
  const invalidated = invalidateReview(state);
  return rewindToPhase(DiagramStateSchema.parse({
    ...invalidated,
    render: {...invalidated.render, render_digest: null},
  }), 4, "produce a current render");
}

export function recordRunConfiguration(
  state: DiagramState,
  archetype: NonNullable<DiagramState["archetype"]>,
  medium: NonNullable<DiagramState["medium"]>,
): DiagramState {
  return DiagramStateSchema.parse({...state, archetype, medium});
}

export function recordRenderDigest(
  state: DiagramState,
  digest: string,
): DiagramState {
  DigestSchema.parse(digest);
  const invalidated = state.render.render_digest === digest ? state : invalidateReview(state);
  return DiagramStateSchema.parse({
    ...invalidated,
    render: {...invalidated.render, render_digest: digest},
  });
}

export function recordReview(
  state: DiagramState,
  outputs: string[],
): DiagramState {
  if (state.phase !== 5) throw new Error("Pixel review is recorded only during Phase 5");
  if (state.render.input_digest === null || state.render.render_digest === null) {
    throw new Error("Cannot review before input and render digests exist");
  }
  return DiagramStateSchema.parse({
    ...state,
    status: "awaiting-gate-b",
    render: {
      ...state.render,
      reviewed_input_digest: state.render.input_digest,
      reviewed_render_digest: state.render.render_digest,
      reviewed_outputs: [...outputs].sort(),
    },
  });
}

export function approveGate(options: {
  state: DiagramState;
  gate: "a" | "b";
  wording: string;
  digest: string;
}): DiagramState {
  const wording = options.wording.trim();
  if (wording.length === 0) throw new Error("Gate wording must be the exact non-empty user message");
  DigestSchema.parse(options.digest);
  if (options.gate === "a") {
    if (options.state.phase !== 0) throw new Error("Gate A is recorded only at the Phase 0 boundary");
    return DiagramStateSchema.parse({
      ...options.state,
      status: "active",
      gate_a: {approved: true, wording, approved_design_digest: options.digest},
    });
  }
  if (options.state.phase !== 7) throw new Error("Gate B is recorded only at the Phase 7 boundary");
  if (!reviewIsCurrent({
    currentInputDigest: options.state.render.input_digest ?? "",
    reviewedInputDigest: options.state.render.reviewed_input_digest,
    currentRenderDigest: options.state.render.render_digest,
    reviewedRenderDigest: options.state.render.reviewed_render_digest,
  })) {
    throw new Error("Gate B cannot approve a stale or unreviewed render");
  }
  if (options.digest !== options.state.render.reviewed_render_digest) {
    throw new Error("Gate B digest does not identify the reviewed render");
  }
  return DiagramStateSchema.parse({
    ...options.state,
    gate_b: {approved: true, wording, approved_render_digest: options.digest},
  });
}

export function advancePhase(
  state: DiagramState,
  phase: number,
  nextBoundary: string,
): DiagramState {
  if (!Number.isInteger(phase) || phase < 0 || phase > 7) throw new Error("Phase must be 0 through 7");
  if (phase > 0 && !state.gate_a.approved) throw new Error("Gate A approval is required before Phase 1");
  if (phase < state.phase || phase > state.phase + 1) {
    throw new Error(`Phase transitions must advance exactly one boundary; current Phase ${state.phase}`);
  }
  const reviewCurrent = reviewIsCurrent({
    currentInputDigest: state.render.input_digest ?? "",
    reviewedInputDigest: state.render.reviewed_input_digest,
    currentRenderDigest: state.render.render_digest,
    reviewedRenderDigest: state.render.reviewed_render_digest,
  });
  if (phase >= 5 && (state.render.input_digest === null || state.render.render_digest === null)) {
    throw new Error("A current compiled render is required before Phase 5");
  }
  if (phase >= 6 && !reviewCurrent) {
    throw new Error("Current pixel-review evidence is required before Phase 6");
  }
  const phases = {...state.phases};
  if (phase > state.phase) phases[String(state.phase)] = "done";
  phases[String(phase)] = "active";
  return DiagramStateSchema.parse({
    ...state,
    phase,
    phases,
    current: {owner_artifact: OWNER_ARTIFACTS[phase], next_boundary: nextBoundary},
  });
}

export function closeRun(state: DiagramState): DiagramState {
  if (!state.gate_b.approved) throw new Error("Gate B approval is required before close");
  if (!reviewIsCurrent({
    currentInputDigest: state.render.input_digest ?? "",
    reviewedInputDigest: state.render.reviewed_input_digest,
    currentRenderDigest: state.render.render_digest,
    reviewedRenderDigest: state.render.reviewed_render_digest,
  })) throw new Error("The reviewed render changed before close");
  return DiagramStateSchema.parse({
    ...state,
    status: "closed",
    phase: 7,
    phases: Object.fromEntries(Array.from({length: 8}, (_, phase) => [String(phase), "done"])),
    current: {owner_artifact: "result.md", next_boundary: "closed"},
  });
}
