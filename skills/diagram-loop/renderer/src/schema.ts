import {z} from "zod";
import {wordCount} from "./text.js";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]*$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const HexColorSchema = z.string().regex(/^#[a-fA-F0-9]{6}$/u);

const LabelSchema = z.string().min(1).max(56).superRefine((value, context) => {
  const lines = value.split("\n");
  if (lines.length > 2) {
    context.addIssue({code: "custom", message: "labels may use at most two lines"});
  }
  if (lines.some((line) => line.trim().length === 0)) {
    context.addIssue({code: "custom", message: "label lines must not be empty"});
  }
  if (wordCount(value) > 4) {
    context.addIssue({code: "custom", message: "labels may use at most four words"});
  }
});

const SubtitleSchema = z.string().min(1).max(72).superRefine((value, context) => {
  if (value.includes("\n")) {
    context.addIssue({code: "custom", message: "subtitles must use one line"});
  }
  if (wordCount(value) > 8) {
    context.addIssue({code: "custom", message: "subtitles may use at most eight words"});
  }
});

export const NodeRoleSchema = z.enum([
  "actor",
  "process",
  "service",
  "client",
  "data-store",
  "queue",
  "external-system",
]);

export const AudienceSchema = z.enum(["nontechnical", "mixed", "engineer", "domain-expert"]);
export const EdgeRoleSchema = z.enum(["primary", "supporting", "feedback", "async", "return"]);
export const CoreSceneKindSchema = z.enum(["architecture", "flow", "sequence", "concurrency", "feedback"]);
export const NarrativeActionNameSchema = z.enum([
  "reveal", "trace", "flow", "highlight", "dim", "focus", "zoom", "parallel", "wait", "finalOverview",
]);

export const SceneNodeSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  subtitle: SubtitleSchema.optional(),
  role: NodeRoleSchema,
  importance: z.enum(["primary", "secondary"]).default("primary"),
  asset: IdentifierSchema.optional(),
  asset_presentation: z.enum(["icon", "frame"]).default("icon"),
  asset_sequence: z.object({
    columns: z.number().int().min(1).max(12),
    rows: z.number().int().min(1).max(12),
    frame_count: z.number().int().min(2).max(144),
    frames_per_second: z.number().positive().max(12),
  }).strict().optional(),
}).strict().superRefine((node, context) => {
  if (node.asset_presentation === "frame" && node.asset === undefined) {
    context.addIssue({code: "custom", path: ["asset"], message: "frame presentation requires an asset"});
  }
  if (node.asset_sequence !== undefined) {
    if (node.asset === undefined || node.asset_presentation !== "frame") {
      context.addIssue({
        code: "custom",
        path: ["asset_sequence"],
        message: "asset sequences require a frame-presented asset",
      });
    }
    if (node.asset_sequence.frame_count > node.asset_sequence.columns * node.asset_sequence.rows) {
      context.addIssue({
        code: "custom",
        path: ["asset_sequence", "frame_count"],
        message: "frame count exceeds the sprite grid capacity",
      });
    }
  }
});

export const SceneEdgeSchema = z.object({
  id: IdentifierSchema,
  from: IdentifierSchema,
  to: IdentifierSchema,
  label: z.string().min(1).max(80).superRefine((value, context) => {
    const lines = value.split("\n");
    if (lines.length > 2) {
      context.addIssue({code: "custom", message: "edge labels may use at most two lines"});
    }
    if (lines.some((line) => line.trim().length === 0)) {
      context.addIssue({code: "custom", message: "edge label lines must not be empty"});
    }
    if (wordCount(value) > 8) {
      context.addIssue({code: "custom", message: "edge labels may use at most eight words"});
    }
  }),
  role: EdgeRoleSchema,
}).strict();

export const SceneGroupSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  nodes: z.array(IdentifierSchema).min(1),
  parent: IdentifierSchema.optional(),
}).strict();

const CaptionSchema = z.string().min(1).max(180).optional();

export const NarrativeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reveal"),
    targets: z.array(IdentifierSchema).min(1),
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("trace"),
    edge: IdentifierSchema,
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("flow"),
    edge: IdentifierSchema,
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("highlight"),
    targets: z.array(IdentifierSchema).min(1),
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("dim"),
    targets: z.array(IdentifierSchema).min(1),
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("focus"),
    targets: z.array(IdentifierSchema).length(1),
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("zoom"),
    target: IdentifierSchema,
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("parallel"),
    targets: z.array(IdentifierSchema).min(2),
    caption: CaptionSchema,
  }).strict(),
  z.object({
    action: z.literal("wait"),
    seconds: z.number().positive().max(30),
    caption: CaptionSchema,
  }).strict(),
  z.object({action: z.literal("finalOverview")}).strict(),
]);

const SceneBaseShape = {
  version: z.literal(1),
  title: z.string().min(1).max(96),
  audience: AudienceSchema,
  nodes: z.array(SceneNodeSchema).min(2).max(12),
  edges: z.array(SceneEdgeSchema).max(24),
  groups: z.array(SceneGroupSchema).max(8).default([]),
  narrative: z.array(NarrativeActionSchema).min(1).max(32),
};

const DirectionSchema = z.enum(["lr", "tb"]).default("lr");
const StageSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  nodes: z.array(IdentifierSchema).min(1),
}).strict();
const LaneSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  nodes: z.array(IdentifierSchema).min(1),
}).strict();
const ConcurrencySpanSchema = z.object({
  node: IdentifierSchema,
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  state: z.enum(["work", "wait"]),
}).strict();

const ArchitectureSceneSchema = z.object({
  ...SceneBaseShape,
  kind: z.literal("architecture"),
  direction: DirectionSchema,
}).strict();

const FlowSceneSchema = z.object({
  ...SceneBaseShape,
  kind: z.literal("flow"),
  direction: DirectionSchema,
  stages: z.array(StageSchema).min(2).max(8).optional(),
}).strict();

const FeedbackSceneSchema = z.object({
  ...SceneBaseShape,
  kind: z.literal("feedback"),
  direction: DirectionSchema,
}).strict();

const SequenceSceneSchema = z.object({
  ...SceneBaseShape,
  kind: z.literal("sequence"),
}).strict();

const ConcurrencySceneSchema = z.object({
  ...SceneBaseShape,
  kind: z.literal("concurrency"),
  lanes: z.array(LaneSchema).min(2).max(8),
  spans: z.array(ConcurrencySpanSchema).min(2).max(12),
}).strict();

export const SceneSchema = z.discriminatedUnion("kind", [
  ArchitectureSceneSchema,
  FlowSceneSchema,
  FeedbackSceneSchema,
  SequenceSceneSchema,
  ConcurrencySceneSchema,
]).superRefine((scene, context) => {
  const nodeIds = new Set<string>();
  let primaryCount = 0;
  let secondaryCount = 0;
  for (const [index, node] of scene.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      context.addIssue({
        code: "custom",
        path: ["nodes", index, "id"],
        message: `duplicate node ID: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
    if (node.importance === "primary") primaryCount += 1;
    else secondaryCount += 1;
  }
  if (primaryCount > 8) {
    context.addIssue({code: "custom", path: ["nodes"], message: "at most eight primary concepts"});
  }
  if (secondaryCount > 4) {
    context.addIssue({code: "custom", path: ["nodes"], message: "at most four secondary concepts"});
  }

  const edgeIds = new Set<string>();
  for (const [index, edge] of scene.edges.entries()) {
    if (edgeIds.has(edge.id)) {
      context.addIssue({code: "custom", path: ["edges", index, "id"], message: `duplicate edge ID: ${edge.id}`});
    }
    edgeIds.add(edge.id);
    for (const endpoint of ["from", "to"] as const) {
      if (!nodeIds.has(edge[endpoint])) {
        context.addIssue({
          code: "custom",
          path: ["edges", index, endpoint],
          message: `unknown node: ${edge[endpoint]}`,
        });
      }
    }
  }

  const groupIds = new Set(scene.groups.map((group) => group.id));
  for (const [index, group] of scene.groups.entries()) {
    if (scene.groups.findIndex((candidate) => candidate.id === group.id) !== index) {
      context.addIssue({code: "custom", path: ["groups", index, "id"], message: `duplicate group ID: ${group.id}`});
    }
    for (const nodeId of group.nodes) {
      if (!nodeIds.has(nodeId)) {
        context.addIssue({code: "custom", path: ["groups", index, "nodes"], message: `unknown node: ${nodeId}`});
      }
    }
    if (group.parent !== undefined) {
      const parent = scene.groups.find((candidate) => candidate.id === group.parent);
      if (!groupIds.has(group.parent) || parent?.parent !== undefined) {
        context.addIssue({code: "custom", path: ["groups", index, "parent"], message: "groups support at most two levels"});
      }
    }
  }

  const validatePartitions = (
    partitions: ReadonlyArray<{id: string; nodes: string[]}>,
    field: "stages" | "lanes",
  ): void => {
    const seen = new Set<string>();
    const partitionIds = new Set<string>();
    const generatedPrefix = field === "stages" ? "stage--" : "lane--";
    for (const [index, partition] of partitions.entries()) {
      if (partitionIds.has(partition.id)) {
        context.addIssue({code: "custom", path: [field, index, "id"], message: `duplicate ${field.slice(0, -1)} ID: ${partition.id}`});
      }
      partitionIds.add(partition.id);
      const generatedId = `${generatedPrefix}${partition.id}`;
      if (groupIds.has(generatedId)) {
        context.addIssue({code: "custom", path: [field, index, "id"], message: `generated group ID collides with authored group: ${generatedId}`});
      }
      for (const nodeId of partition.nodes) {
        if (!nodeIds.has(nodeId)) {
          context.addIssue({code: "custom", path: [field, index, "nodes"], message: `unknown node: ${nodeId}`});
        }
        if (seen.has(nodeId)) {
          context.addIssue({code: "custom", path: [field, index, "nodes"], message: `node appears twice: ${nodeId}`});
        }
        seen.add(nodeId);
      }
    }
    if (seen.size !== nodeIds.size) {
      context.addIssue({code: "custom", path: [field], message: `every node must belong to exactly one ${field.slice(0, -1)}`});
    }
  };

  if (scene.kind === "flow" && scene.stages !== undefined) {
    validatePartitions(scene.stages, "stages");
  }
  if (scene.kind === "concurrency") {
    validatePartitions(scene.lanes, "lanes");
    const spanned = new Set<string>();
    for (const [index, span] of scene.spans.entries()) {
      if (!nodeIds.has(span.node)) {
        context.addIssue({code: "custom", path: ["spans", index, "node"], message: `unknown node: ${span.node}`});
      }
      if (spanned.has(span.node)) {
        context.addIssue({code: "custom", path: ["spans", index, "node"], message: `node has multiple time spans: ${span.node}`});
      }
      spanned.add(span.node);
    }
    if (spanned.size !== nodeIds.size) {
      context.addIssue({code: "custom", path: ["spans"], message: "every concurrency node requires exactly one time span"});
    }
  }
  if (scene.kind === "sequence" && scene.edges.length === 0) {
    context.addIssue({code: "custom", path: ["edges"], message: "sequence scenes require at least one message"});
  }

  for (const [index, action] of scene.narrative.entries()) {
    if ("targets" in action) {
      for (const target of action.targets) {
        if (!nodeIds.has(target)) {
          context.addIssue({code: "custom", path: ["narrative", index, "targets"], message: `unknown node: ${target}`});
        }
      }
    }
    if ("target" in action && !nodeIds.has(action.target)) {
      context.addIssue({code: "custom", path: ["narrative", index, "target"], message: `unknown node: ${action.target}`});
    }
    if ("edge" in action && !edgeIds.has(action.edge)) {
      context.addIssue({code: "custom", path: ["narrative", index, "edge"], message: `unknown edge: ${action.edge}`});
    }
  }
  if (scene.narrative.at(-1)?.action !== "finalOverview") {
    context.addIssue({code: "custom", path: ["narrative"], message: "the last action must be finalOverview"});
  }
});

export const AssetEntrySchema = z.object({
  id: IdentifierSchema,
  type: z.enum(["icon", "repository", "screenshot", "official", "generic"]),
  status: z.enum(["selected", "candidate", "unresolved"]),
  source_url: z.string().url(),
  source_revision: z.string().min(1).max(200),
  license_name: z.string().min(1).max(200),
  license_url: z.string().url(),
  trademark_url: z.string().url().optional(),
  attribution: z.string().max(500).optional(),
  sha256: Sha256Schema,
  transformations: z.array(z.string().min(1).max(120)).default([]),
  path: z.string().optional(),
  ref: z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/u).optional(),
}).strict().superRefine((asset, context) => {
  if (asset.type === "icon") {
    if (asset.ref === undefined || asset.path !== undefined) {
      context.addIssue({code: "custom", message: "icon assets require ref and forbid path"});
    }
    if (asset.ref?.startsWith("logos:") === true && asset.trademark_url === undefined) {
      context.addIssue({code: "custom", path: ["trademark_url"], message: "logo icons require an official trademark or brand-terms URL"});
    }
    return;
  }
  if (asset.ref !== undefined) {
    context.addIssue({code: "custom", message: "non-icon assets forbid ref"});
  }
  if (asset.status === "selected") {
    if (asset.path === undefined) {
      context.addIssue({code: "custom", message: "selected file assets require path"});
    } else if (
      asset.path.length === 0 ||
      asset.path.startsWith("/") ||
      asset.path.includes("\\") ||
      asset.path.split("/").includes("..")
    ) {
      context.addIssue({code: "custom", path: ["path"], message: "asset path must be normalized and run-relative"});
    }
  }
});

export const AssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(AssetEntrySchema).max(32),
}).strict().superRefine((manifest, context) => {
  const seen = new Set<string>();
  for (const [index, asset] of manifest.assets.entries()) {
    if (seen.has(asset.id)) {
      context.addIssue({code: "custom", path: ["assets", index, "id"], message: `duplicate asset ID: ${asset.id}`});
    }
    seen.add(asset.id);
  }
});

export const RenderPlanSchema = z.object({
  version: z.literal(1),
  width: z.number().int().min(640).max(3840),
  height: z.number().int().min(360).max(2160),
  fps: z.number().int().min(24).max(60),
  formats: z.array(z.enum(["png", "webm", "mp4"])).min(1).refine(
    (formats) => new Set(formats).size === formats.length,
    {message: "formats must be unique"},
  ),
  pacing: z.enum(["deliberate", "compact", "narrated"]),
  final_hold_seconds: z.number().positive().max(30),
  viewport_inset: z.number().nonnegative().max(320),
  endpoint_gap: z.number().nonnegative().max(48),
  route_clearance: z.number().nonnegative().max(64),
  background: HexColorSchema,
  foreground: HexColorSchema,
  remotion_license_basis: z.enum([
    "individual",
    "nonprofit",
    "small-company",
    "company-license",
    "evaluation",
  ]),
}).strict().superRefine((plan, context) => {
  if (plan.pacing === "deliberate" && plan.final_hold_seconds < 5) {
    context.addIssue({code: "custom", path: ["final_hold_seconds"], message: "deliberate pacing requires a five-second final hold"});
  }
  if (!plan.formats.includes("png")) {
    context.addIssue({code: "custom", path: ["formats"], message: "every render plan requires a PNG final frame"});
  }
  if (plan.formats.some((format) => format !== "png")) {
    for (const required of ["webm", "mp4"] as const) {
      if (!plan.formats.includes(required)) {
        context.addIssue({code: "custom", path: ["formats"], message: `animated plans require ${required}`});
      }
    }
  }
});

export type Scene = z.infer<typeof SceneSchema>;
export type SceneNode = z.infer<typeof SceneNodeSchema>;
export type SceneEdge = z.infer<typeof SceneEdgeSchema>;
export type NarrativeAction = z.infer<typeof NarrativeActionSchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type RenderPlan = z.infer<typeof RenderPlanSchema>;
