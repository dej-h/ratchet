import type {CSSProperties, ReactNode} from "react";
import React from "react";
import {AbsoluteFill, useCurrentFrame} from "remotion";

import type {CompiledEdge, CompiledNode, CompiledScene, Point, TextLayout} from "./compiled-schema.js";
import {DESIGN_TOKENS} from "./design-tokens.js";
import {arrowState, frameStateAt, scaffoldOpacity} from "./frame-state.js";

export type DiagramCompositionProps = {
  scene: CompiledScene | null;
};

function pathData(points: Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return "";
  return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(" ");
}

function roleColor(role: string): {fill: string; stroke: string} {
  const colors: Record<string, {fill: string; stroke: string}> = {
    actor: {fill: "#161d31", stroke: "#8aa4ff"},
    client: {fill: "#15243d", stroke: "#61a7ff"},
    service: {fill: "#1d2140", stroke: "#9d8cff"},
    process: {fill: "#182c30", stroke: "#62d6c4"},
    "data-store": {fill: "#2c2435", stroke: "#d891ff"},
    queue: {fill: "#30291b", stroke: "#e9b95f"},
    "external-system": {fill: "#2d2027", stroke: "#f08cab"},
  };
  return colors[role] ?? {fill: "#1d2140", stroke: "#9d8cff"};
}

function TextBlock(options: {
  layout: TextLayout;
  fill: string;
  fontFamily: string;
  fontSize: number;
}): ReactNode {
  return (
    <text
      x={options.layout.bounds.x}
      y={options.layout.first_baseline}
      fill={options.fill}
      fontFamily={options.fontFamily}
      fontSize={options.fontSize}
    >
      {options.layout.lines.map((line, index) => (
        <tspan
          key={`${line}-${index}`}
          x={options.layout.bounds.x}
          dy={index === 0 ? 0 : options.layout.line_height}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function spriteFrameAt(options: {
  frame: number;
  startFrame: number;
  compositionFps: number;
  sequenceFps: number;
  frameCount: number;
}): number {
  const elapsedFrames = Math.max(0, options.frame - options.startFrame);
  const sequenceFrame = Math.floor(elapsedFrames * options.sequenceFps / options.compositionFps);
  return Math.min(options.frameCount - 1, sequenceFrame);
}

function renderAsset(
  node: CompiledNode,
  frame: number,
  compositionFps: number,
  sequenceStartFrame: number,
): ReactNode {
  if (node.asset === undefined) return null;
  const bounds = node.asset.bounds;
  if (node.asset.svg_body !== undefined && node.asset.view_box !== undefined) {
    return (
      <svg
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        viewBox={node.asset.view_box}
        color="#f7f8fc"
        aria-hidden="true"
        dangerouslySetInnerHTML={{__html: node.asset.svg_body}}
      />
    );
  }
  if (node.asset.data_uri !== undefined) {
    const sequence = node.asset.sequence;
    if (
      sequence !== undefined
      && node.asset.source_width !== undefined
      && node.asset.source_height !== undefined
    ) {
      const index = spriteFrameAt({
        frame,
        startFrame: sequenceStartFrame,
        compositionFps,
        sequenceFps: sequence.frames_per_second,
        frameCount: sequence.frame_count,
      });
      const cellWidth = node.asset.source_width / sequence.columns;
      const cellHeight = node.asset.source_height / sequence.rows;
      const column = index % sequence.columns;
      const row = Math.floor(index / sequence.columns);
      return (
        <svg
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          viewBox={`${column * cellWidth} ${row * cellHeight} ${cellWidth} ${cellHeight}`}
          preserveAspectRatio="xMidYMid meet"
          overflow="hidden"
          aria-hidden="true"
        >
          <image
            href={node.asset.data_uri}
            x={0}
            y={0}
            width={node.asset.source_width}
            height={node.asset.source_height}
          />
        </svg>
      );
    }
    return (
      <image
        href={node.asset.data_uri}
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  return null;
}

function NodeCard(options: {
  node: CompiledNode;
  opacity: number;
  highlighted: boolean;
  dimmed: boolean;
  fontFamily: string;
  frame: number;
  compositionFps: number;
  sequenceStartFrame: number;
}): ReactNode {
  const {node} = options;
  const color = roleColor(node.role);
  const opacity = options.opacity * (options.dimmed ? 0.28 : 1);
  return (
    <g opacity={opacity}>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={18}
        fill={color.fill}
        stroke={options.highlighted ? "#ffffff" : color.stroke}
        strokeWidth={options.highlighted ? 5 : 3}
        strokeDasharray={node.concurrency_state === "wait" ? "10 8" : undefined}
      />
      {renderAsset(node, options.frame, options.compositionFps, options.sequenceStartFrame)}
      <TextBlock
        layout={node.label_layout}
        fill="#f7f8fc"
        fontFamily={options.fontFamily}
        fontSize={DESIGN_TOKENS.node.labelSize}
      />
      {node.subtitle_layout === undefined ? null : (
        <TextBlock
          layout={node.subtitle_layout}
          fill="#aebbd4"
          fontFamily={options.fontFamily}
          fontSize={DESIGN_TOKENS.node.subtitleSize}
        />
      )}
    </g>
  );
}

function EdgeView(options: {
  edge: CompiledEdge;
  progress: number;
  sourceVisible: boolean;
  destinationVisible: boolean;
  fontFamily: string;
}): ReactNode {
  const {edge} = options;
  const progress = Math.max(0, Math.min(1, options.progress));
  const maskId = `trace-mask-${edge.id}`;
  const route = pathData(edge.visible_points);
  const arrow = arrowState({
    points: edge.visible_points,
    progress,
    showFromProgress: edge.arrow_show_from_progress,
    destinationVisible: options.destinationVisible,
  });
  const quietOpacity = scaffoldOpacity({
    dashed: edge.dashed,
    progress,
    sourceVisible: options.sourceVisible,
    destinationVisible: options.destinationVisible,
  });
  return (
    <g>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <rect x="0" y="0" width="100%" height="100%" fill="black" />
        <path
          d={route}
          fill="none"
          stroke="white"
          strokeWidth={9}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${progress} ${Math.max(0.0001, 1 - progress)}`}
        />
      </mask>
      <path
        d={route}
        fill="none"
        stroke="#7b8dab"
        strokeWidth={3}
        strokeDasharray={edge.dashed ? "10 10" : undefined}
        opacity={quietOpacity}
      />
      <path
        d={route}
        fill="none"
        stroke="#77c4ff"
        strokeWidth={4}
        strokeDasharray={edge.dashed ? "10 10" : undefined}
        strokeLinecap="round"
        mask={`url(#${maskId})`}
      />
      <g opacity={arrow.opacity} transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}>
        <path d="M 0 0 L -14 -8 L -11 0 L -14 8 Z" fill="#77c4ff" />
      </g>
      <g opacity={progress > 0 || quietOpacity > 0 ? 1 : 0}>
        <rect
          x={edge.label_bounds.x}
          y={edge.label_bounds.y}
          width={edge.label_bounds.width}
          height={edge.label_bounds.height}
          rx={edge.label_bounds.height / 2}
          fill="#0d1528"
          stroke="#344665"
          strokeWidth={1.5}
        />
        <TextBlock
          layout={edge.label_layout}
          fill="#c8d4e9"
          fontFamily={options.fontFamily}
          fontSize={DESIGN_TOKENS.edge.labelSize}
        />
      </g>
    </g>
  );
}

export function DiagramComposition({scene}: DiagramCompositionProps): ReactNode {
  const frame = useCurrentFrame();
  if (scene === null) throw new Error("Compiled scene input is required");
  const state = frameStateAt(scene, frame);
  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  const sequenceStartByNode = new Map(scene.nodes.map((node) => {
    const firstReveal = scene.timeline.find((action) =>
      (action.action === "reveal" || action.action === "parallel")
      && action.targets.includes(node.id));
    return [node.id, firstReveal?.start_frame ?? 0];
  }));
  const cameraNode = state.cameraTarget === null ? undefined : nodeById.get(state.cameraTarget);
  const diagramCenterX = scene.diagram_bounds.x + scene.diagram_bounds.width / 2;
  const diagramCenterY = scene.diagram_bounds.y + scene.diagram_bounds.height / 2;
  const centerX = cameraNode === undefined ? diagramCenterX : cameraNode.x + cameraNode.width / 2;
  const centerY = cameraNode === undefined ? diagramCenterY : cameraNode.y + cameraNode.height / 2;
  const cameraTransform = [
    `translate(${diagramCenterX} ${diagramCenterY})`,
    `scale(${state.cameraScale})`,
    `translate(${-centerX} ${-centerY})`,
  ].join(" ");
  const fontFace = `@font-face{font-family:"${scene.font.family}";src:url("${scene.font.data_uri}") format("woff2");font-style:normal;font-weight:400;}`;
  const fillStyle: CSSProperties = {
    backgroundColor: scene.background,
    color: scene.foreground,
    fontFamily: scene.font.family,
  };
  const concurrencyOpacity = Math.max(0, ...Object.values(state.nodeOpacity));
  return (
    <AbsoluteFill style={fillStyle}>
      <style>{fontFace}</style>
      <svg width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
        <g transform={cameraTransform}>
          {scene.concurrency === undefined ? null : (
            <g>
              <g opacity={concurrencyOpacity}>
                <line
                  x1={scene.concurrency.axis.x}
                  y1={scene.concurrency.axis.y}
                  x2={scene.concurrency.axis.x + scene.concurrency.axis.width}
                  y2={scene.concurrency.axis.y}
                  stroke="#60708f"
                  strokeWidth={2}
                />
                <TextBlock
                  layout={scene.concurrency.axis.start_label}
                  fill="#91a1bd"
                  fontFamily={scene.font.family}
                  fontSize={DESIGN_TOKENS.concurrency.axisLabelSize}
                />
                <TextBlock
                  layout={scene.concurrency.axis.end_label}
                  fill="#91a1bd"
                  fontFamily={scene.font.family}
                  fontSize={DESIGN_TOKENS.concurrency.axisLabelSize}
                />
              </g>
              {scene.concurrency.spans.map((span) => (
                <rect
                  key={`${span.node}-time-span`}
                  x={span.bounds.x}
                  y={span.bounds.y}
                  width={span.bounds.width}
                  height={span.bounds.height}
                  rx={4}
                  fill={span.state === "wait" ? "none" : "#77c4ff"}
                  stroke="#77c4ff"
                  strokeWidth={2}
                  strokeDasharray={span.state === "wait" ? "8 6" : undefined}
                  opacity={state.nodeOpacity[span.node] ?? 0}
                />
              ))}
            </g>
          )}
          {scene.groups.map((group) => (
            <g key={group.id}>
              <rect
                x={group.bounds.x}
                y={group.bounds.y}
                width={group.bounds.width}
                height={group.bounds.height}
                rx={20}
                fill="none"
                stroke="#475777"
                strokeWidth={2}
                strokeDasharray="9 8"
              />
              <TextBlock
                layout={group.label_layout}
                fill="#91a1bd"
                fontFamily={scene.font.family}
                fontSize={DESIGN_TOKENS.group.labelSize}
              />
            </g>
          ))}
          {scene.sequence?.lifelines.map((lifeline) => (
            <line
              key={`${lifeline.node}-lifeline`}
              x1={lifeline.x}
              y1={lifeline.start_y}
              x2={lifeline.x}
              y2={lifeline.end_y}
              stroke="#3a4a68"
              strokeWidth={2}
              strokeDasharray="8 8"
              opacity={state.nodeOpacity[lifeline.node] ?? 0}
            />
          ))}
          {scene.edges.map((edge) => (
            <EdgeView
              key={edge.id}
              edge={edge}
              progress={state.edgeProgress[edge.id] ?? 0}
              sourceVisible={(state.nodeOpacity[edge.from] ?? 0) >= 0.99}
              destinationVisible={(state.nodeOpacity[edge.to] ?? 0) >= 0.99}
              fontFamily={scene.font.family}
            />
          ))}
          {scene.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              opacity={state.nodeOpacity[node.id] ?? 0}
              highlighted={state.highlighted.has(node.id)}
              dimmed={state.dimmed.has(node.id)}
              fontFamily={scene.font.family}
              frame={frame}
              compositionFps={scene.fps}
              sequenceStartFrame={sequenceStartByNode.get(node.id) ?? 0}
            />
          ))}
        </g>
      </svg>
      {state.caption === null ? null : (
        <div style={{
          position: "absolute",
          left: state.captionBounds?.x,
          top: state.captionBounds?.y,
          width: state.captionBounds?.width,
          height: state.captionBounds?.height,
          boxSizing: "border-box",
          padding: `${DESIGN_TOKENS.caption.verticalInset}px ${DESIGN_TOKENS.caption.horizontalInset}px`,
          borderRadius: 18,
          background: "rgba(8, 14, 29, 0.90)",
          border: `${DESIGN_TOKENS.caption.borderWidth}px solid #344665`,
          color: "#f7f8fc",
          fontFamily: scene.font.family,
          fontSize: DESIGN_TOKENS.caption.fontSize,
          lineHeight: DESIGN_TOKENS.caption.lineHeight,
          textAlign: "center",
          whiteSpace: "pre-line",
        }}>
          {state.caption}
        </div>
      )}
    </AbsoluteFill>
  );
}
