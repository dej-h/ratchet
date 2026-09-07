import type {
  CompiledEdge,
  CompiledNode,
  CompiledConcurrency,
  CompiledScene,
  CompiledSequence,
  Rect,
  TextLayout,
} from "./compiled-schema.js";
import {DESIGN_TOKENS} from "./design-tokens.js";
import {labelBoundsForRoute, rectContainsRect, rectsOverlap, trimRoute, validateGeometry} from "./geometry.js";
import type {LoadedFont} from "./font.js";
import {measureText} from "./font.js";
import {layoutScene} from "./layouts/index.js";
import {diagramBoundsForScene, measureNodes} from "./measurement.js";
import type {ResolvedAsset} from "./assets.js";
import type {RenderPlan, Scene} from "./schema.js";

export interface CompiledGeometry {
  diagramBounds: Rect;
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  groups: CompiledScene["groups"];
  concurrency?: CompiledConcurrency;
  sequence?: CompiledSequence;
}

function compileTextLayout(options: {
  font: LoadedFont;
  text: string;
  size: number;
  lineHeight: number;
  x: number;
  y: number;
}): TextLayout {
  const measurement = measureText(options.font, options.text, options.size, options.lineHeight);
  return {
    lines: options.text.split("\n"),
    bounds: {x: options.x, y: options.y, width: measurement.width, height: measurement.height},
    first_baseline: options.y + measurement.ascent,
    line_height: options.size * options.lineHeight,
  };
}

function compileNode(
  node: Awaited<ReturnType<typeof layoutScene>>["nodes"][number],
  font: LoadedFont,
): CompiledNode {
  const safeArea = {
    x: node.x + node.inset,
    y: node.y + node.inset,
    width: node.width - node.inset * 2,
    height: node.height - node.inset * 2,
  };
  const contentBounds = {
    x: node.x + (node.width - node.contentWidth) / 2,
    y: node.y + (node.height - node.contentHeight) / 2,
    width: node.contentWidth,
    height: node.contentHeight,
  };
  const labelMeasurement = measureText(
    font,
    node.source.label,
    DESIGN_TOKENS.node.labelSize,
    DESIGN_TOKENS.node.labelLineHeight,
  );
  const subtitleMeasurement = node.source.subtitle === undefined
    ? undefined
    : measureText(
      font,
      node.source.subtitle,
      DESIGN_TOKENS.node.subtitleSize,
      DESIGN_TOKENS.node.subtitleLineHeight,
    );
  const textHeight = labelMeasurement.height
    + (subtitleMeasurement === undefined ? 0 : DESIGN_TOKENS.node.lineGap + subtitleMeasurement.height);
  const isFrame = node.asset !== undefined && node.source.asset_presentation === "frame";
  const textTop = isFrame
    ? contentBounds.y
    : contentBounds.y + (contentBounds.height - textHeight) / 2;
  const iconTextWidth = node.asset === undefined || isFrame
    ? 0
    : node.assetWidth + DESIGN_TOKENS.node.iconTextGap;
  const textLeft = contentBounds.x + iconTextWidth;
  const labelX = node.asset === undefined || isFrame
    ? contentBounds.x + (contentBounds.width - labelMeasurement.width) / 2
    : textLeft;
  const labelLayout = compileTextLayout({
    font,
    text: node.source.label,
    size: DESIGN_TOKENS.node.labelSize,
    lineHeight: DESIGN_TOKENS.node.labelLineHeight,
    x: labelX,
    y: textTop,
  });
  const subtitleLayout = node.source.subtitle === undefined || subtitleMeasurement === undefined
    ? undefined
    : compileTextLayout({
      font,
      text: node.source.subtitle,
      size: DESIGN_TOKENS.node.subtitleSize,
      lineHeight: DESIGN_TOKENS.node.subtitleLineHeight,
      x: node.asset === undefined || isFrame
        ? contentBounds.x + (contentBounds.width - subtitleMeasurement.width) / 2
        : textLeft,
      y: textTop + labelMeasurement.height + DESIGN_TOKENS.node.lineGap,
    });
  return {
    id: node.id,
    label: node.source.label,
    ...(node.source.subtitle === undefined ? {} : {subtitle: node.source.subtitle}),
    role: node.source.role,
    importance: node.source.importance,
    ...(node.concurrencyState === undefined ? {} : {concurrency_state: node.concurrencyState}),
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    safe_area: safeArea,
    content_bounds: contentBounds,
    label_layout: labelLayout,
    ...(subtitleLayout === undefined ? {} : {subtitle_layout: subtitleLayout}),
    ...(node.asset === undefined ? {} : {
      asset: {
        id: node.asset.id,
        type: node.asset.type,
        presentation: node.source.asset_presentation,
        bounds: isFrame
          ? {
            x: contentBounds.x + (contentBounds.width - node.assetWidth) / 2,
            y: contentBounds.y + textHeight + DESIGN_TOKENS.node.assetFrameTextGap,
            width: node.assetWidth,
            height: node.assetHeight,
          }
          : {
            x: contentBounds.x,
            y: node.y + (node.height - node.assetHeight) / 2,
            width: node.assetWidth,
            height: node.assetHeight,
          },
        ...(node.asset.dataUri === undefined ? {} : {data_uri: node.asset.dataUri}),
        ...(node.asset.svgBody === undefined ? {} : {svg_body: node.asset.svgBody}),
        ...(node.asset.viewBox === undefined ? {} : {view_box: node.asset.viewBox}),
        ...(node.asset.pixelWidth === undefined ? {} : {source_width: node.asset.pixelWidth}),
        ...(node.asset.pixelHeight === undefined ? {} : {source_height: node.asset.pixelHeight}),
        ...(node.source.asset_sequence === undefined ? {} : {sequence: node.source.asset_sequence}),
      },
    }),
    ports: node.ports,
  };
}

function boundsAround(rectangles: Rect[]): Rect {
  const minX = Math.min(...rectangles.map((bounds) => bounds.x)) - DESIGN_TOKENS.group.sidePadding;
  const minY = Math.min(...rectangles.map((bounds) => bounds.y)) - DESIGN_TOKENS.group.topPadding;
  const maxX = Math.max(...rectangles.map((bounds) => bounds.x + bounds.width)) + DESIGN_TOKENS.group.sidePadding;
  const maxY = Math.max(...rectangles.map((bounds) => bounds.y + bounds.height)) + DESIGN_TOKENS.group.bottomPadding;
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
}

function concurrencyLaneBounds(
  scene: Extract<Scene, {kind: "concurrency"}>,
  nodes: CompiledNode[],
  plan: RenderPlan,
): Map<string, Rect> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const rows = scene.lanes.map((lane) => {
    const members = lane.nodes.map((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node === undefined) throw new Error(`Lane ${lane.id} references missing node ${nodeId}`);
      return node;
    });
    return {
      id: lane.id,
      top: Math.min(...members.map((node) => node.y)),
      bottom: Math.max(...members.map((node) => node.y + node.height)),
    };
  });
  return new Map(rows.map((row) => {
    const top = Math.max(plan.viewport_inset, row.top - DESIGN_TOKENS.group.laneTopPadding);
    const bottom = Math.min(
      plan.height - plan.viewport_inset,
      row.bottom + DESIGN_TOKENS.group.bottomPadding,
    );
    return [row.id, {
      x: plan.viewport_inset,
      y: top,
      width: plan.width - plan.viewport_inset * 2,
      height: bottom - top,
    }];
  }));
}

function compileGroups(
  scene: Scene,
  nodes: CompiledNode[],
  plan: RenderPlan,
  font: LoadedFont,
): CompiledGeometry["groups"] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const laneBounds = scene.kind === "concurrency"
    ? concurrencyLaneBounds(scene, nodes, plan)
    : new Map<string, Rect>();
  const partitions: Array<{id: string; label: string; nodes: string[]; parent?: string; fullWidth?: boolean}> = [
    ...scene.groups.map((group) => ({
      id: group.id,
      label: group.label,
      nodes: group.nodes,
      ...(group.parent === undefined ? {} : {parent: group.parent}),
    })),
    ...(scene.kind === "flow" && scene.stages !== undefined
      ? scene.stages.map((stage) => ({
        id: `stage--${stage.id}`,
        label: stage.label,
        nodes: stage.nodes,
      }))
      : []),
    ...(scene.kind === "concurrency"
      ? scene.lanes.map((lane) => ({
        id: `lane--${lane.id}`,
        label: lane.label,
        nodes: lane.nodes,
        fullWidth: true,
      }))
      : []),
  ];
  const compiledBounds = partitions.map((group) => {
    const members = group.nodes.map((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node === undefined) throw new Error(`Group ${group.id} references missing node ${nodeId}`);
      return node;
    });
    let bounds: Rect;
    if (group.fullWidth === true) {
      const laneId = group.id.slice("lane--".length);
      const generatedBounds = laneBounds.get(laneId);
      if (generatedBounds === undefined) throw new Error(`Missing generated bounds for ${group.id}`);
      bounds = generatedBounds;
    } else {
      bounds = boundsAround(members.map((node) => ({
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      })));
    }
    return {
      id: group.id,
      label: group.label,
      nodes: [...group.nodes],
      ...(group.parent === undefined ? {} : {parent: group.parent}),
      bounds,
    };
  });
  const compiledIds = new Set<string>();
  for (const group of compiledBounds) {
    if (compiledIds.has(group.id)) throw new Error(`Duplicate compiled group ID: ${group.id}`);
    compiledIds.add(group.id);
  }
  const generatedLaneIds = new Set(
    scene.kind === "concurrency" ? scene.lanes.map((lane) => `lane--${lane.id}`) : [],
  );
  const compiledLanes = compiledBounds.filter((group) => generatedLaneIds.has(group.id));
  for (let leftIndex = 0; leftIndex < compiledLanes.length; leftIndex += 1) {
    const left = compiledLanes[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < compiledLanes.length; rightIndex += 1) {
      const right = compiledLanes[rightIndex];
      if (right !== undefined && rectsOverlap(left.bounds, right.bounds)) {
        throw new Error(`Generated lanes ${left.id} and ${right.id} overlap`);
      }
    }
  }
  for (const parent of compiledBounds.filter((group) => group.parent === undefined)) {
    const childBounds = compiledBounds
      .filter((group) => group.parent === parent.id)
      .map((group) => group.bounds);
    if (childBounds.length > 0) parent.bounds = boundsAround([parent.bounds, ...childBounds]);
  }
  const viewport = {
    x: plan.viewport_inset,
    y: plan.viewport_inset,
    width: plan.width - plan.viewport_inset * 2,
    height: plan.height - plan.viewport_inset * 2,
  };
  const compiled = compiledBounds.map((group) => {
    const labelLayout = compileTextLayout({
      font,
      text: group.label,
      size: DESIGN_TOKENS.group.labelSize,
      lineHeight: DESIGN_TOKENS.group.labelLineHeight,
      x: group.bounds.x + DESIGN_TOKENS.group.labelLeftInset,
      y: group.bounds.y + DESIGN_TOKENS.group.labelTopInset,
    });
    if (!rectContainsRect(group.bounds, labelLayout.bounds) || !rectContainsRect(viewport, labelLayout.bounds)) {
      throw new Error(`Group ${group.id} label escapes its compiled boundary`);
    }
    if (nodes.some((node) => rectsOverlap(labelLayout.bounds, node))) {
      throw new Error(`Group ${group.id} label overlaps diagram content; shorten or wrap it`);
    }
    return {...group, label_layout: labelLayout};
  });
  for (let leftIndex = 0; leftIndex < compiled.length; leftIndex += 1) {
    const left = compiled[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < compiled.length; rightIndex += 1) {
      const right = compiled[rightIndex];
      if (right !== undefined && rectsOverlap(left.label_layout.bounds, right.label_layout.bounds)) {
        throw new Error(`Group labels ${left.id} and ${right.id} overlap`);
      }
    }
  }
  return compiled.sort((left, right) => Number(left.parent !== undefined) - Number(right.parent !== undefined));
}

function compileConcurrency(
  scene: Extract<Scene, {kind: "concurrency"}>,
  nodes: CompiledNode[],
  plan: RenderPlan,
  groups: CompiledGeometry["groups"],
  font: LoadedFont,
): CompiledConcurrency {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const laneByNode = new Map(scene.lanes.flatMap((lane) => lane.nodes.map((node) => [node, lane.id] as const)));
  const end = Math.max(...scene.spans.map((span) => span.start + span.duration));
  const startMeasurement = measureText(
    font,
    "0",
    DESIGN_TOKENS.concurrency.axisLabelSize,
    DESIGN_TOKENS.concurrency.axisLabelLineHeight,
  );
  const endText = String(end);
  const endMeasurement = measureText(
    font,
    endText,
    DESIGN_TOKENS.concurrency.axisLabelSize,
    DESIGN_TOKENS.concurrency.axisLabelLineHeight,
  );
  const labelHeight = Math.max(startMeasurement.height, endMeasurement.height);
  const labelY = plan.height - plan.viewport_inset - labelHeight;
  const axisY = labelY - DESIGN_TOKENS.concurrency.axisLabelGap;
  const axis = {
    x: plan.viewport_inset,
    y: axisY,
    width: plan.width - plan.viewport_inset * 2,
    start: 0,
    end,
    start_label: compileTextLayout({
      font,
      text: "0",
      size: DESIGN_TOKENS.concurrency.axisLabelSize,
      lineHeight: DESIGN_TOKENS.concurrency.axisLabelLineHeight,
      x: plan.viewport_inset,
      y: labelY,
    }),
    end_label: compileTextLayout({
      font,
      text: endText,
      size: DESIGN_TOKENS.concurrency.axisLabelSize,
      lineHeight: DESIGN_TOKENS.concurrency.axisLabelLineHeight,
      x: plan.width - plan.viewport_inset - endMeasurement.width,
      y: labelY,
    }),
  };
  const spans = scene.spans.map((span) => {
    const node = nodeById.get(span.node);
    const lane = laneByNode.get(span.node);
    if (node === undefined || lane === undefined) throw new Error(`Missing concurrency geometry for ${span.node}`);
    const compiledSpan = {
      ...span,
      lane,
      bounds: {
        x: axis.x + span.start / end * axis.width,
        y: Math.max(plan.viewport_inset, node.y - DESIGN_TOKENS.concurrency.spanOffset),
        width: span.duration / end * axis.width,
        height: DESIGN_TOKENS.concurrency.spanHeight,
      },
    };
    const laneBounds = groups.find((group) => group.id === `lane--${lane}`)?.bounds;
    if (laneBounds === undefined || !rectContainsRect(laneBounds, compiledSpan.bounds)) {
      throw new Error(`Concurrency span for ${span.node} escapes lane ${lane}`);
    }
    const laneLabel = groups.find((group) => group.id === `lane--${lane}`)?.label_layout.bounds;
    if (laneLabel === undefined || rectsOverlap(laneLabel, compiledSpan.bounds)) {
      throw new Error(`Concurrency span for ${span.node} overlaps lane ${lane} label`);
    }
    return compiledSpan;
  });
  const viewport = {
    x: plan.viewport_inset,
    y: plan.viewport_inset,
    width: plan.width - plan.viewport_inset * 2,
    height: plan.height - plan.viewport_inset * 2,
  };
  if (
    axis.y < viewport.y
    || !rectContainsRect(viewport, axis.start_label.bounds)
    || !rectContainsRect(viewport, axis.end_label.bounds)
  ) {
    throw new Error("Concurrency time axis labels escape the viewport-safe area");
  }
  const generatedLaneIds = new Set(scene.lanes.map((lane) => `lane--${lane.id}`));
  if (groups.some((group) => generatedLaneIds.has(group.id) && group.bounds.y + group.bounds.height > axis.y)) {
    throw new Error("Concurrency lanes overlap the time axis; use a taller canvas or fewer lanes");
  }
  return {axis, spans};
}

function compileSequence(nodes: CompiledNode[], plan: RenderPlan): CompiledSequence {
  const messageY = nodes.flatMap((node) => node.ports
    .filter((port) => port.side === "lifeline")
    .map((port) => port.y));
  if (messageY.length === 0) throw new Error("Sequence scenes require at least one compiled message");
  const endY = Math.max(...messageY) + DESIGN_TOKENS.layout.sequenceLifelineTail;
  const viewportBottom = plan.height - plan.viewport_inset;
  if (endY > viewportBottom) {
    throw new Error("Sequence lifelines do not fit the viewport-safe area");
  }
  return {
    lifelines: nodes.map((node) => ({
      node: node.id,
      x: node.x + node.width / 2,
      start_y: node.y + node.height,
      end_y: endY,
    })),
  };
}

export async function compileGeometry(options: {
  scene: Scene;
  plan: RenderPlan;
  font: LoadedFont;
  assets: Map<string, ResolvedAsset>;
}): Promise<CompiledGeometry> {
  const diagramBounds = diagramBoundsForScene(options.scene, options.font, options.plan);
  const geometryPlan = {...options.plan, height: diagramBounds.height};
  const measuredNodes = measureNodes({
    nodes: options.scene.nodes,
    font: options.font,
    assets: options.assets,
  });
  const hasBoundaries = options.scene.groups.length > 0
    || (options.scene.kind === "flow" && options.scene.stages !== undefined)
    || options.scene.kind === "concurrency";
  const hasNestedGroups = options.scene.groups.some((group) => group.parent !== undefined);
  const boundaryInset = Math.max(
    hasNestedGroups ? 96 : hasBoundaries ? 48 : 0,
    options.scene.kind === "concurrency" ? DESIGN_TOKENS.group.laneTopPadding : 0,
  );
  const layout = await layoutScene({
    scene: options.scene,
    nodes: measuredNodes,
    width: options.plan.width,
    height: geometryPlan.height,
    viewportInset: geometryPlan.viewport_inset + boundaryInset,
  });
  const nodes = layout.nodes.map((node) => compileNode(node, options.font));
  const routesById = new Map(layout.edges.map((edge) => [edge.id, edge.points]));
  const viewport = {
    x: options.plan.viewport_inset,
    y: options.plan.viewport_inset,
    width: options.plan.width - options.plan.viewport_inset * 2,
    height: geometryPlan.height - geometryPlan.viewport_inset * 2,
  };
  const groups = compileGroups(options.scene, nodes, geometryPlan, options.font);
  const edgeById = new Map(options.scene.edges.map((sceneEdge) => [sceneEdge.id, sceneEdge]));
  const isDashedRole = (role: Scene["edges"][number]["role"]): boolean =>
    role === "feedback" || role === "return" || role === "async";
  const edges: CompiledEdge[] = [];
  for (const edge of options.scene.edges) {
    const points = routesById.get(edge.id);
    if (points === undefined) throw new Error(`Layout omitted edge ${edge.id}`);
    const label = measureText(
      options.font,
      edge.label,
      DESIGN_TOKENS.edge.labelSize,
      DESIGN_TOKENS.edge.labelLineHeight,
    );
    let labelBounds: Rect;
    try {
      labelBounds = labelBoundsForRoute({
        points,
        width: label.width + DESIGN_TOKENS.edge.labelHorizontalInset * 2,
        height: label.height + DESIGN_TOKENS.edge.labelVerticalInset * 2,
        nodes,
        viewport,
        occupied: [
          ...groups.map((group) => group.label_layout.bounds),
          ...edges.map((compiledEdge) => compiledEdge.label_bounds),
        ],
        avoidRoutes: [...routesById.entries()]
          .filter(([routeId]) => {
            const other = edgeById.get(routeId);
            return routeId !== edge.id
              && other !== undefined
              && isDashedRole(other.role) !== isDashedRole(edge.role);
          })
          .map(([, route]) => route),
        routeClearance: DESIGN_TOKENS.edge.strokeWidth,
      });
    } catch (error) {
      throw new Error(
        `Unable to place label for edge ${edge.id}: ${error instanceof Error ? error.message : String(error)}`,
        {cause: error},
      );
    }
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      role: edge.role,
      points,
      visible_points: trimRoute(points, options.plan.endpoint_gap),
      label_bounds: labelBounds,
      label_layout: compileTextLayout({
        font: options.font,
        text: edge.label,
        size: DESIGN_TOKENS.edge.labelSize,
        lineHeight: DESIGN_TOKENS.edge.labelLineHeight,
        x: labelBounds.x + DESIGN_TOKENS.edge.labelHorizontalInset,
        y: labelBounds.y + DESIGN_TOKENS.edge.labelVerticalInset,
      }),
      dashed: edge.role === "feedback" || edge.role === "return" || edge.role === "async",
      arrow_show_from_progress: DESIGN_TOKENS.edge.arrowShowFromProgress,
    });
  }
  const sequence = options.scene.kind === "sequence" ? compileSequence(nodes, geometryPlan) : undefined;
  validateGeometry({
    width: options.plan.width,
    height: geometryPlan.height,
    viewportInset: options.plan.viewport_inset,
    routeClearance: options.plan.route_clearance,
    endpointGap: options.plan.endpoint_gap,
    nodes,
    edges,
    groups,
    ...(sequence === undefined ? {} : {sequenceLifelines: sequence.lifelines}),
  });
  return {
    diagramBounds,
    nodes,
    edges,
    groups,
    ...(options.scene.kind === "concurrency"
      ? {concurrency: compileConcurrency(options.scene, nodes, geometryPlan, groups, options.font)}
      : {}),
    ...(sequence === undefined ? {} : {sequence}),
  };
}
