import type {CompiledEdge, CompiledNode, CompiledScene, CompiledSequence, Point, Rect} from "./compiled-schema.js";

const EPSILON = 0.01;

export function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - EPSILON
    && inner.y >= outer.y - EPSILON
    && inner.x + inner.width <= outer.x + outer.width + EPSILON
    && inner.y + inner.height <= outer.y + outer.height + EPSILON;
}

export function rectsOverlap(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width - EPSILON
    && left.x + left.width > right.x + EPSILON
    && left.y < right.y + right.height - EPSILON
    && left.y + left.height > right.y + EPSILON;
}

function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x - EPSILON
    && point.x <= rect.x + rect.width + EPSILON
    && point.y >= rect.y - EPSILON
    && point.y <= rect.y + rect.height + EPSILON;
}

function pointInRectInterior(point: Point, rect: Rect): boolean {
  return point.x > rect.x + EPSILON
    && point.x < rect.x + rect.width - EPSILON
    && point.y > rect.y + EPSILON
    && point.y < rect.y + rect.height - EPSILON;
}

export function segmentIntersectsRect(start: Point, end: Point, rect: Rect): boolean {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let lower = 0;
  let upper = 1;
  const boundaries: Array<[number, number]> = [
    [-dx, start.x - rect.x],
    [dx, rect.x + rect.width - start.x],
    [-dy, start.y - rect.y],
    [dy, rect.y + rect.height - start.y],
  ];
  for (const [p, q] of boundaries) {
    if (Math.abs(p) < EPSILON) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) lower = Math.max(lower, ratio);
    else upper = Math.min(upper, ratio);
    if (lower > upper) return false;
  }
  return lower <= upper;
}

export function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function pointAlong(start: Point, end: Point, amount: number): Point {
  const length = distance(start, end);
  if (length <= amount + EPSILON) {
    throw new Error(`Route segment ${length.toFixed(2)} is too short for ${amount}px trim`);
  }
  const ratio = amount / length;
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

export function trimRoute(points: Point[], gap: number): Point[] {
  if (points.length < 2) throw new Error("Routes need at least two points");
  const first = points[0];
  const second = points[1];
  const penultimate = points.at(-2);
  const last = points.at(-1);
  if (first === undefined || second === undefined || penultimate === undefined || last === undefined) {
    throw new Error("Routes need at least two points");
  }
  const trimmed = points.map((point) => ({...point}));
  trimmed[0] = pointAlong(first, second, gap);
  trimmed[trimmed.length - 1] = pointAlong(last, penultimate, gap);
  return trimmed;
}

function nodeRect(node: CompiledNode): Rect {
  return {x: node.x, y: node.y, width: node.width, height: node.height};
}

function pointEquals(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < EPSILON && Math.abs(left.y - right.y) < EPSILON;
}

function portBelongsToBoundary(node: CompiledNode, port: CompiledNode["ports"][number]): boolean {
  const withinHorizontal = port.x >= node.x - EPSILON
    && port.x <= node.x + node.width + EPSILON;
  const withinVertical = port.y >= node.y - EPSILON
    && port.y <= node.y + node.height + EPSILON;
  switch (port.side) {
    case "north": return withinHorizontal && Math.abs(port.y - node.y) < EPSILON;
    case "east": return withinVertical && Math.abs(port.x - (node.x + node.width)) < EPSILON;
    case "south": return withinHorizontal && Math.abs(port.y - (node.y + node.height)) < EPSILON;
    case "west": return withinVertical && Math.abs(port.x - node.x) < EPSILON;
    case "lifeline": return Math.abs(port.x - (node.x + node.width / 2)) < EPSILON
      && port.y >= node.y + node.height - EPSILON;
  }
}

export function validateGeometry(options: {
  width: number;
  height: number;
  viewportInset: number;
  routeClearance: number;
  endpointGap: number;
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  groups?: CompiledScene["groups"];
  sequenceLifelines?: CompiledSequence["lifelines"];
}): void {
  const viewport: Rect = {
    x: options.viewportInset,
    y: options.viewportInset,
    width: options.width - options.viewportInset * 2,
    height: options.height - options.viewportInset * 2,
  };
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error("Viewport inset leaves no usable canvas");
  }

  for (const node of options.nodes) {
    const bounds = nodeRect(node);
    if (!rectContainsRect(viewport, bounds)) {
      throw new Error(`Node ${node.id} is outside the viewport-safe area`);
    }
    if (!rectContainsRect(node.safe_area, node.content_bounds)) {
      throw new Error(`Node ${node.id} content violates its safe area`);
    }
    if (!rectContainsRect(node.safe_area, node.label_layout.bounds)) {
      throw new Error(`Node ${node.id} label violates its safe area`);
    }
    if (
      node.subtitle_layout !== undefined
      && !rectContainsRect(node.safe_area, node.subtitle_layout.bounds)
    ) {
      throw new Error(`Node ${node.id} subtitle violates its safe area`);
    }
    for (const port of node.ports) {
      if (port.owner !== node.id || !portBelongsToBoundary(node, port)) {
        throw new Error(`Port ${port.id} does not belong to ${node.id}'s declared boundary`);
      }
    }
  }

  for (let leftIndex = 0; leftIndex < options.nodes.length; leftIndex += 1) {
    const left = options.nodes[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < options.nodes.length; rightIndex += 1) {
      const right = options.nodes[rightIndex];
      if (right !== undefined && rectsOverlap(nodeRect(left), nodeRect(right))) {
        throw new Error(`Nodes ${left.id} and ${right.id} overlap`);
      }
    }
  }

  const groupById = new Map<string, NonNullable<typeof options.groups>[number]>();
  for (const group of options.groups ?? []) {
    if (groupById.has(group.id)) throw new Error(`Duplicate compiled group ID: ${group.id}`);
    groupById.set(group.id, group);
  }
  const nodeById = new Map(options.nodes.map((node) => [node.id, node]));
  for (const group of options.groups ?? []) {
    if (!rectContainsRect(viewport, group.bounds)) {
      throw new Error(`Group ${group.id} is outside the viewport-safe area`);
    }
    if (group.parent !== undefined) {
      const parent = groupById.get(group.parent);
      if (parent === undefined || !rectContainsRect(parent.bounds, group.bounds)) {
        throw new Error(`Group ${group.id} is not contained by parent ${group.parent}`);
      }
    }
    if (!rectContainsRect(group.bounds, group.label_layout.bounds)) {
      throw new Error(`Group ${group.id} label escapes its compiled boundary`);
    }
    if (!rectContainsRect(viewport, group.label_layout.bounds)) {
      throw new Error(`Group ${group.id} label is outside the viewport-safe area`);
    }
    if (options.nodes.some((node) => rectsOverlap(group.label_layout.bounds, nodeRect(node)))) {
      throw new Error(`Group ${group.id} label overlaps diagram content`);
    }
    for (const nodeId of group.nodes) {
      const node = nodeById.get(nodeId);
      if (node === undefined || !rectContainsRect(group.bounds, nodeRect(node))) {
        throw new Error(`Group ${group.id} does not contain declared node ${nodeId}`);
      }
    }
  }
  const groups = options.groups ?? [];
  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    const left = groups[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex += 1) {
      const right = groups[rightIndex];
      if (right !== undefined && rectsOverlap(left.label_layout.bounds, right.label_layout.bounds)) {
        throw new Error(`Group labels ${left.id} and ${right.id} overlap`);
      }
    }
  }

  for (const lifeline of options.sequenceLifelines ?? []) {
    const node = nodeById.get(lifeline.node);
    if (node === undefined) throw new Error(`Sequence lifeline references missing node ${lifeline.node}`);
    if (
      lifeline.x < viewport.x - EPSILON
      || lifeline.x > viewport.x + viewport.width + EPSILON
      || lifeline.start_y < viewport.y - EPSILON
      || lifeline.end_y > viewport.y + viewport.height + EPSILON
      || lifeline.end_y < lifeline.start_y
    ) {
      throw new Error(`Sequence lifeline for ${lifeline.node} escapes the viewport-safe area`);
    }
  }

  for (const edge of options.edges) {
    const source = nodeById.get(edge.from);
    const destination = nodeById.get(edge.to);
    if (source === undefined || destination === undefined) {
      throw new Error(`Edge ${edge.id} references a missing endpoint`);
    }
    if (!rectContainsRect(viewport, edge.label_bounds)) {
      throw new Error(`Edge ${edge.id} label is outside the viewport-safe area`);
    }
    if (!rectContainsRect(edge.label_bounds, edge.label_layout.bounds)) {
      throw new Error(`Edge ${edge.id} text escapes its compiled capsule`);
    }
    for (const group of groups) {
      if (rectsOverlap(edge.label_bounds, group.label_layout.bounds)) {
        throw new Error(`Edge ${edge.id} label overlaps group label ${group.id}`);
      }
    }
    const start = edge.points[0];
    const end = edge.points.at(-1);
    const visibleStart = edge.visible_points[0];
    const visibleEnd = edge.visible_points.at(-1);
    if (start === undefined || end === undefined || visibleStart === undefined || visibleEnd === undefined) {
      throw new Error(`Edge ${edge.id} has an incomplete route`);
    }
    if (!source.ports.some((port) => pointEquals(port, start))) {
      throw new Error(`Edge ${edge.id} does not start on a port owned by ${source.id}`);
    }
    if (!destination.ports.some((port) => pointEquals(port, end))) {
      throw new Error(`Edge ${edge.id} does not end on a port owned by ${destination.id}`);
    }
    if (
      distance(start, visibleStart) + EPSILON < options.endpointGap
      || distance(end, visibleEnd) + EPSILON < options.endpointGap
    ) {
      throw new Error(`Edge ${edge.id} violates the endpoint gap`);
    }
    if (pointInRectInterior(visibleStart, nodeRect(source))) {
      throw new Error(`Edge ${edge.id} visible start remains inside ${source.id}`);
    }
    if (pointInRectInterior(visibleEnd, nodeRect(destination))) {
      throw new Error(`Edge ${edge.id} visible end remains inside ${destination.id}`);
    }
    for (let pointIndex = 0; pointIndex < edge.points.length - 1; pointIndex += 1) {
      const segmentStart = edge.points[pointIndex];
      const segmentEnd = edge.points[pointIndex + 1];
      if (segmentStart === undefined || segmentEnd === undefined) continue;
      for (const node of options.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        if (segmentIntersectsRect(
          segmentStart,
          segmentEnd,
          expandRect(nodeRect(node), options.routeClearance),
        )) {
          throw new Error(`Edge ${edge.id} crosses non-endpoint node ${node.id}`);
        }
      }
      for (const group of groups) {
        if (segmentIntersectsRect(segmentStart, segmentEnd, group.label_layout.bounds)) {
          throw new Error(`Edge ${edge.id} crosses group label ${group.id}`);
        }
      }
      for (const otherEdge of options.edges) {
        if (
          otherEdge.id !== edge.id
          && otherEdge.dashed !== edge.dashed
          && segmentIntersectsRect(segmentStart, segmentEnd, otherEdge.label_bounds)
        ) {
          throw new Error(`Edge ${edge.id} crosses label for edge ${otherEdge.id}`);
        }
      }
    }
    for (const node of options.nodes) {
      if (rectsOverlap(edge.label_bounds, nodeRect(node))) {
        throw new Error(`Edge ${edge.id} label overlaps node ${node.id}`);
      }
    }
  }
  for (let leftIndex = 0; leftIndex < options.edges.length; leftIndex += 1) {
    const left = options.edges[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < options.edges.length; rightIndex += 1) {
      const right = options.edges[rightIndex];
      if (right !== undefined && rectsOverlap(left.label_bounds, right.label_bounds)) {
        throw new Error(`Edge labels ${left.id} and ${right.id} overlap`);
      }
    }
  }
}

export function labelBoundsForRoute(options: {
  points: Point[];
  width: number;
  height: number;
  nodes: Array<Pick<CompiledNode, "x" | "y" | "width" | "height">>;
  occupied?: Rect[];
  avoidRoutes?: Point[][];
  routeClearance?: number;
  viewport: Rect;
}): Rect {
  const segments = options.points.slice(0, -1).map((start, index) => ({
    start,
    end: options.points[index + 1] as Point,
    length: distance(start, options.points[index + 1] as Point),
  }));
  const first = options.points[0];
  const last = options.points.at(-1);
  if (first !== undefined && last !== undefined && options.points.length > 2) {
    const horizontal = Math.abs(last.x - first.x) >= Math.abs(last.y - first.y);
    const crossAxisDrift = horizontal ? Math.abs(last.y - first.y) : Math.abs(last.x - first.x);
    if (crossAxisDrift <= options.height) {
      segments.push({start: first, end: last, length: distance(first, last)});
    }
  }
  segments.sort((left, right) => right.length - left.length);
  const offsets = [
    0,
    options.height + 10,
    -(options.height + 10),
    options.height * 2 + 12,
    -(options.height * 2 + 12),
    options.height * 3 + 16,
    -(options.height * 3 + 16),
  ];
  const positions = [0.5, 0.3, 0.7, 0.2, 0.8];
  for (const segment of segments) {
    const horizontal = Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y);
    for (const position of positions) {
      for (const offset of offsets) {
        const center = {
          x: segment.start.x + (segment.end.x - segment.start.x) * position + (horizontal ? 0 : offset),
          y: segment.start.y + (segment.end.y - segment.start.y) * position + (horizontal ? offset : 0),
        };
        const candidate = {
          x: center.x - options.width / 2,
          y: center.y - options.height / 2,
          width: options.width,
          height: options.height,
        };
        if (
          rectContainsRect(options.viewport, candidate)
          && !options.nodes.some((node) => rectsOverlap(candidate, node))
          && !(options.occupied ?? []).some((bounds) => rectsOverlap(candidate, bounds))
          && !(options.avoidRoutes ?? []).some((route) => route.slice(0, -1).some((start, index) =>
            segmentIntersectsRect(
              start,
              route[index + 1] as Point,
              expandRect(candidate, options.routeClearance ?? 0),
            )
          ))
        ) return candidate;
      }
    }
  }
  throw new Error("No collision-free edge-label position exists");
}
