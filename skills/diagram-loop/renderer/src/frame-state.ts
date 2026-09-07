import type {CompiledAction, CompiledScene, Point, Rect} from "./compiled-schema.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function progressFor(frame: number, action: CompiledAction): number {
  const duration = Math.max(1, action.active_end_frame - action.start_frame);
  return clamp((frame - action.start_frame) / duration);
}

export interface DiagramFrameState {
  nodeOpacity: Record<string, number>;
  edgeProgress: Record<string, number>;
  highlighted: Set<string>;
  dimmed: Set<string>;
  cameraTarget: string | null;
  cameraScale: number;
  caption: string | null;
  captionBounds: Rect | null;
}

function applyAction(
  state: DiagramFrameState,
  action: CompiledAction,
  progress: number,
  scene: CompiledScene,
): void {
  switch (action.action) {
    case "reveal":
    case "parallel":
      for (const target of action.targets) {
        if (target in state.nodeOpacity) {
          state.nodeOpacity[target] = Math.max(state.nodeOpacity[target] ?? 0, progress);
        }
      }
      return;
    case "trace":
    case "flow":
      for (const target of action.targets) {
        if (target in state.edgeProgress) {
          state.edgeProgress[target] = Math.max(state.edgeProgress[target] ?? 0, progress);
        }
      }
      return;
    case "highlight":
      if (progress > 0) state.highlighted = new Set(action.targets);
      return;
    case "dim":
      if (progress > 0) state.dimmed = new Set(action.targets);
      return;
    case "focus":
    case "zoom":
      if (progress > 0) {
        state.cameraTarget = action.targets[0] ?? null;
        state.cameraScale = 1 + 0.12 * progress;
        state.highlighted = new Set(action.targets);
        state.dimmed = new Set(
          scene.nodes.map((node) => node.id).filter((id) => !state.highlighted.has(id)),
        );
      }
      return;
    case "finalOverview":
      for (const node of scene.nodes) state.nodeOpacity[node.id] = 1;
      for (const edge of scene.edges) state.edgeProgress[edge.id] = 1;
      state.highlighted.clear();
      state.dimmed.clear();
      state.cameraTarget = null;
      state.cameraScale = 1;
      return;
    case "wait":
      return;
    default:
      return assertNever(action.action);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported compiled action: ${String(value)}`);
}

export function frameStateAt(scene: CompiledScene, frame: number): DiagramFrameState {
  const state: DiagramFrameState = {
    nodeOpacity: Object.fromEntries(scene.nodes.map((node) => [node.id, 0])),
    edgeProgress: Object.fromEntries(scene.edges.map((edge) => [edge.id, 0])),
    highlighted: new Set(),
    dimmed: new Set(),
    cameraTarget: null,
    cameraScale: 1,
    caption: null,
    captionBounds: null,
  };
  for (const action of scene.timeline) {
    if (frame >= action.end_frame) {
      applyAction(state, action, 1, scene);
      continue;
    }
    if (frame >= action.start_frame) {
      applyAction(state, action, progressFor(frame, action), scene);
      state.caption = action.caption ?? null;
      state.captionBounds = action.caption_bounds ?? null;
    }
    break;
  }
  return state;
}

export interface PolylinePosition extends Point {
  angle: number;
  segmentIndex: number;
}

export interface ArrowState extends PolylinePosition {
  opacity: number;
  visible: boolean;
}

export function scaffoldOpacity(options: {
  dashed: boolean;
  progress: number;
  sourceVisible: boolean;
  destinationVisible: boolean;
}): number {
  if (options.dashed) return options.progress > 0 ? 0.12 : 0;
  return options.sourceVisible && options.destinationVisible ? 0.16 : 0;
}

export function arrowState(options: {
  points: Point[];
  progress: number;
  showFromProgress: number;
  destinationVisible: boolean;
}): ArrowState {
  const progress = clamp(options.progress);
  const position = positionOnPolyline(options.points, progress);
  const lastSegment = options.points.length - 2;
  const opacity = clamp(
    (progress - options.showFromProgress) / (1 - options.showFromProgress),
  );
  const visible = position.segmentIndex === lastSegment
    && options.destinationVisible
    && opacity > 0;
  return {...position, opacity: visible ? opacity : 0, visible};
}

export function positionOnPolyline(points: Point[], progress: number): PolylinePosition {
  if (points.length < 2) throw new Error("Polyline needs at least two points");
  const lengths = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1] as Point;
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * clamp(progress);
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] as number;
    const start = points[index] as Point;
    const end = points[index + 1] as Point;
    if (remaining <= length || index === lengths.length - 1) {
      const ratio = length === 0 ? 0 : Math.min(1, remaining / length);
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
        segmentIndex: index,
      };
    }
    remaining -= length;
  }
  throw new Error("Could not locate polyline progress");
}
