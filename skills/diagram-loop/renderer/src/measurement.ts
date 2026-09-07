import type {ResolvedAsset} from "./assets.js";
import {DESIGN_TOKENS} from "./design-tokens.js";
import {measureText, type LoadedFont} from "./font.js";
import type {Rect} from "./compiled-schema.js";
import type {RenderPlan, Scene, SceneNode} from "./schema.js";

export interface MeasuredNode {
  id: string;
  source: SceneNode;
  width: number;
  height: number;
  inset: number;
  textWidth: number;
  contentWidth: number;
  contentHeight: number;
  assetWidth: number;
  assetHeight: number;
  asset?: ResolvedAsset;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function measureNodes(options: {
  nodes: SceneNode[];
  font: LoadedFont;
  assets: Map<string, ResolvedAsset>;
}): MeasuredNode[] {
  return options.nodes.map((node) => {
    const asset = node.asset === undefined ? undefined : options.assets.get(node.asset);
    const label = measureText(
      options.font,
      node.label,
      DESIGN_TOKENS.node.labelSize,
      DESIGN_TOKENS.node.labelLineHeight,
    );
    const subtitle = node.subtitle === undefined
      ? undefined
      : measureText(
        options.font,
        node.subtitle,
        DESIGN_TOKENS.node.subtitleSize,
        DESIGN_TOKENS.node.subtitleLineHeight,
      );
    const textWidth = Math.max(label.width, subtitle?.width ?? 0);
    const textHeight = label.height
      + (subtitle === undefined ? 0 : DESIGN_TOKENS.node.lineGap + subtitle.height);
    const inset = node.importance === "primary"
      ? DESIGN_TOKENS.node.primaryInset
      : DESIGN_TOKENS.node.secondaryInset;
    const isFrame = asset !== undefined && node.asset_presentation === "frame";
    const columns = node.asset_sequence?.columns ?? 1;
    const rows = node.asset_sequence?.rows ?? 1;
    const sourceFrameWidth = (asset?.pixelWidth ?? 1) / columns;
    const sourceFrameHeight = (asset?.pixelHeight ?? 1) / rows;
    const frameRatio = sourceFrameWidth / sourceFrameHeight;
    const assetWidth = isFrame
      ? Math.min(
        DESIGN_TOKENS.node.assetFrameWidth,
        DESIGN_TOKENS.node.assetFrameMaximumHeight * frameRatio,
      )
      : asset === undefined ? 0 : DESIGN_TOKENS.node.iconSize;
    const assetHeight = isFrame
      ? assetWidth / frameRatio
      : asset === undefined ? 0 : DESIGN_TOKENS.node.iconSize;
    const contentWidth = isFrame
      ? Math.max(textWidth, assetWidth)
      : (asset === undefined ? 0 : assetWidth + DESIGN_TOKENS.node.iconTextGap) + textWidth;
    const contentHeight = isFrame
      ? textHeight + DESIGN_TOKENS.node.assetFrameTextGap + assetHeight
      : Math.max(textHeight, assetHeight);
    const width = isFrame
      ? contentWidth + inset * 2
      : clamp(
        contentWidth + inset * 2,
        DESIGN_TOKENS.node.minimumWidth,
        DESIGN_TOKENS.node.maximumWidth,
      );
    if (contentWidth > width - inset * 2 + 0.01) {
      throw new Error(`Node ${node.id} text exceeds the measured safe width; shorten scene.yaml`);
    }
    return {
      id: node.id,
      source: node,
      width,
      height: Math.max(96, contentHeight + inset * 2),
      inset,
      textWidth,
      contentWidth,
      contentHeight,
      assetWidth,
      assetHeight,
      ...(asset === undefined ? {} : {asset}),
    };
  });
}

export function wrapCaption(font: LoadedFont, caption: string, plan: RenderPlan): string {
  const margin = Math.max(
    DESIGN_TOKENS.caption.minimumMargin,
    Math.min(DESIGN_TOKENS.caption.maximumMargin, plan.width * DESIGN_TOKENS.caption.marginRatio),
  );
  const availableWidth = plan.width
    - margin * 2
    - DESIGN_TOKENS.caption.horizontalInset * 2
    - DESIGN_TOKENS.caption.borderWidth * 2;
  const lines: string[] = [];
  let current = "";
  for (const word of caption.trim().split(/\s+/u)) {
    if (measureText(
      font,
      word,
      DESIGN_TOKENS.caption.fontSize,
      DESIGN_TOKENS.caption.lineHeight,
    ).width > availableWidth) {
      throw new Error(`Caption word cannot fit the measured caption area: ${word}`);
    }
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (measureText(
      font,
      candidate,
      DESIGN_TOKENS.caption.fontSize,
      DESIGN_TOKENS.caption.lineHeight,
    ).width <= availableWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  if (lines.length > DESIGN_TOKENS.caption.maximumLines) {
    throw new Error("Caption needs more than three measured lines; shorten scene.yaml");
  }
  return lines.join("\n");
}

export interface CaptionLayout {
  text: string;
  bounds: Rect;
}

export function measureCaption(font: LoadedFont, caption: string, plan: RenderPlan): CaptionLayout {
  const text = wrapCaption(font, caption, plan);
  const measurement = measureText(
    font,
    text,
    DESIGN_TOKENS.caption.fontSize,
    DESIGN_TOKENS.caption.lineHeight,
  );
  const margin = Math.max(
    DESIGN_TOKENS.caption.minimumMargin,
    Math.min(DESIGN_TOKENS.caption.maximumMargin, plan.width * DESIGN_TOKENS.caption.marginRatio),
  );
  const height = measurement.height
    + DESIGN_TOKENS.caption.verticalInset * 2
    + DESIGN_TOKENS.caption.borderWidth * 2;
  const bounds = {
    x: margin,
    y: plan.height - DESIGN_TOKENS.caption.bottomInset - height,
    width: plan.width - margin * 2,
    height,
  };
  if (bounds.y < 0 || bounds.width <= 0) {
    throw new Error("Caption does not fit inside the render plan");
  }
  return {text, bounds};
}

export function diagramBoundsForScene(scene: Scene, font: LoadedFont, plan: RenderPlan): Rect {
  const captionTop = Math.min(
    plan.height,
    ...scene.narrative.flatMap((action) => {
      if (action.action === "finalOverview" || action.caption === undefined) return [];
      return [measureCaption(font, action.caption, plan).bounds.y];
    }),
  );
  const height = captionTop === plan.height
    ? plan.height
    : captionTop - DESIGN_TOKENS.caption.diagramGap;
  if (height <= plan.viewport_inset * 2) {
    throw new Error("Captions leave no viewport-safe diagram area; use a larger canvas or shorter captions");
  }
  return {x: 0, y: 0, width: plan.width, height};
}
