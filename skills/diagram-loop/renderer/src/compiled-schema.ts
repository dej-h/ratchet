import {z} from "zod";
import {
  AudienceSchema,
  CoreSceneKindSchema,
  EdgeRoleSchema,
  NarrativeActionNameSchema,
  NodeRoleSchema,
} from "./schema.js";

const PointSchema = z.object({x: z.number(), y: z.number()}).strict();
const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
}).strict();

const TextLayoutSchema = z.object({
  lines: z.array(z.string()).min(1).max(2),
  bounds: RectSchema,
  first_baseline: z.number(),
  line_height: z.number().positive(),
}).strict();

export const CompiledNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  role: NodeRoleSchema,
  importance: z.enum(["primary", "secondary"]),
  concurrency_state: z.enum(["work", "wait"]).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  safe_area: RectSchema,
  content_bounds: RectSchema,
  label_layout: TextLayoutSchema,
  subtitle_layout: TextLayoutSchema.optional(),
  asset: z.object({
    id: z.string(),
    type: z.string(),
    presentation: z.enum(["icon", "frame"]),
    bounds: RectSchema,
    data_uri: z.string().optional(),
    svg_body: z.string().optional(),
    view_box: z.string().optional(),
    source_width: z.number().positive().optional(),
    source_height: z.number().positive().optional(),
    sequence: z.object({
      columns: z.number().int().positive(),
      rows: z.number().int().positive(),
      frame_count: z.number().int().min(2),
      frames_per_second: z.number().positive(),
    }).strict().optional(),
  }).strict().optional(),
  ports: z.array(z.object({
    id: z.string(),
    owner: z.string(),
    side: z.enum(["north", "east", "south", "west", "lifeline"]),
    x: z.number(),
    y: z.number(),
  }).strict()),
}).strict().superRefine((node, context) => {
  if (node.label_layout.lines.join("\n") !== node.label) {
    context.addIssue({code: "custom", path: ["label_layout"], message: "compiled node label lines must match the label"});
  }
  if ((node.subtitle === undefined) !== (node.subtitle_layout === undefined)) {
    context.addIssue({code: "custom", path: ["subtitle_layout"], message: "node subtitle text and layout must be compiled together"});
  } else if (
    node.subtitle !== undefined
    && node.subtitle_layout?.lines.join("\n") !== node.subtitle
  ) {
    context.addIssue({code: "custom", path: ["subtitle_layout"], message: "compiled node subtitle lines must match the subtitle"});
  }
  if (node.asset?.sequence !== undefined && (
    node.asset.data_uri === undefined
    || node.asset.source_width === undefined
    || node.asset.source_height === undefined
  )) {
    context.addIssue({
      code: "custom",
      path: ["asset", "sequence"],
      message: "compiled asset sequences require raster data and source dimensions",
    });
  }
});

export const CompiledEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string(),
  role: EdgeRoleSchema,
  points: z.array(PointSchema).min(2),
  visible_points: z.array(PointSchema).min(2),
  label_bounds: RectSchema,
  label_layout: TextLayoutSchema,
  dashed: z.boolean(),
  arrow_show_from_progress: z.number().min(0.85).max(0.9),
}).strict();

export const CompiledActionSchema = z.object({
  index: z.number().int().nonnegative(),
  action: NarrativeActionNameSchema,
  targets: z.array(z.string()),
  caption: z.string().optional(),
  caption_bounds: RectSchema.optional(),
  start_frame: z.number().int().nonnegative(),
  active_end_frame: z.number().int().positive(),
  end_frame: z.number().int().positive(),
  boundary_frames: z.object({
    before: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    settled: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((action, context) => {
  if ((action.caption === undefined) !== (action.caption_bounds === undefined)) {
    context.addIssue({code: "custom", path: ["caption_bounds"], message: "caption text and bounds must be compiled together"});
  }
});

const CompiledConcurrencySchema = z.object({
  axis: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    start_label: TextLayoutSchema,
    end_label: TextLayoutSchema,
  }).strict(),
  spans: z.array(z.object({
    node: z.string(),
    lane: z.string(),
    start: z.number().nonnegative(),
    duration: z.number().positive(),
    state: z.enum(["work", "wait"]),
    bounds: RectSchema,
  }).strict()),
}).strict();

const CompiledSequenceSchema = z.object({
  lifelines: z.array(z.object({
    node: z.string(),
    x: z.number(),
    start_y: z.number(),
    end_y: z.number(),
  }).strict()).min(2),
}).strict();

export const CompiledSceneSchema = z.object({
  version: z.literal(1),
  input_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  title: z.string(),
  kind: CoreSceneKindSchema,
  audience: AudienceSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  duration_in_frames: z.number().int().positive(),
  final_hold_frames: z.number().int().positive(),
  viewport_inset: z.number().nonnegative(),
  endpoint_gap: z.number().nonnegative(),
  route_clearance: z.number().nonnegative(),
  background: z.string(),
  foreground: z.string(),
  diagram_bounds: RectSchema,
  font: z.object({
    family: z.string(),
    data_uri: z.string(),
    sha256: z.string(),
  }).strict(),
  nodes: z.array(CompiledNodeSchema),
  edges: z.array(CompiledEdgeSchema),
  groups: z.array(z.object({
    id: z.string(),
    label: z.string(),
    bounds: RectSchema,
    label_layout: TextLayoutSchema,
    nodes: z.array(z.string()),
    parent: z.string().optional(),
  }).strict()),
  concurrency: CompiledConcurrencySchema.optional(),
  sequence: CompiledSequenceSchema.optional(),
  timeline: z.array(CompiledActionSchema),
  boundary_frames: z.array(z.number().int().nonnegative()),
}).strict().superRefine((scene, context) => {
  if ((scene.kind === "concurrency") !== (scene.concurrency !== undefined)) {
    context.addIssue({code: "custom", path: ["concurrency"], message: "concurrency geometry must match the scene kind"});
  }
  if ((scene.kind === "sequence") !== (scene.sequence !== undefined)) {
    context.addIssue({code: "custom", path: ["sequence"], message: "sequence geometry must match the scene kind"});
  }
  const groupIds = new Set<string>();
  for (const [index, group] of scene.groups.entries()) {
    if (groupIds.has(group.id)) {
      context.addIssue({code: "custom", path: ["groups", index, "id"], message: `duplicate compiled group ID: ${group.id}`});
    }
    groupIds.add(group.id);
    if (group.label_layout.lines.join("\n") !== group.label) {
      context.addIssue({code: "custom", path: ["groups", index, "label_layout"], message: "compiled group label lines must match the label"});
    }
  }
  for (const [index, edge] of scene.edges.entries()) {
    if (edge.label_layout.lines.join("\n") !== edge.label) {
      context.addIssue({code: "custom", path: ["edges", index, "label_layout"], message: "compiled edge label lines must match the label"});
    }
  }
  if (
    scene.diagram_bounds.x !== 0
    || scene.diagram_bounds.y !== 0
    || scene.diagram_bounds.width !== scene.width
    || scene.diagram_bounds.height > scene.height
  ) {
    context.addIssue({code: "custom", path: ["diagram_bounds"], message: "diagram bounds must be a top-aligned subset of the canvas"});
  }
  if (scene.concurrency !== undefined) {
    if (scene.concurrency.axis.start_label.lines.join("\n") !== String(scene.concurrency.axis.start)) {
      context.addIssue({code: "custom", path: ["concurrency", "axis", "start_label"], message: "compiled start label must match the time axis"});
    }
    if (scene.concurrency.axis.end_label.lines.join("\n") !== String(scene.concurrency.axis.end)) {
      context.addIssue({code: "custom", path: ["concurrency", "axis", "end_label"], message: "compiled end label must match the time axis"});
    }
  }
});

export type Point = z.infer<typeof PointSchema>;
export type Rect = z.infer<typeof RectSchema>;
export type CompiledNode = z.infer<typeof CompiledNodeSchema>;
export type CompiledEdge = z.infer<typeof CompiledEdgeSchema>;
export type CompiledAction = z.infer<typeof CompiledActionSchema>;
export type CompiledScene = z.infer<typeof CompiledSceneSchema>;
export type CompiledConcurrency = z.infer<typeof CompiledConcurrencySchema>;
export type CompiledSequence = z.infer<typeof CompiledSequenceSchema>;
export type TextLayout = z.infer<typeof TextLayoutSchema>;
