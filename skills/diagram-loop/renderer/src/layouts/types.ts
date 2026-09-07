import type {Point} from "../compiled-schema.js";
import type {MeasuredNode} from "../measurement.js";
import type {Scene} from "../schema.js";

export interface PositionedNode extends MeasuredNode {
  x: number;
  y: number;
  ports: Array<{
    id: string;
    owner: string;
    side: "north" | "east" | "south" | "west" | "lifeline";
    x: number;
    y: number;
  }>;
  concurrencyState?: "work" | "wait";
}

export interface RoutedEdge {
  id: string;
  points: Point[];
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
}

export interface LayoutInput {
  scene: Scene;
  nodes: MeasuredNode[];
  width: number;
  height: number;
  viewportInset: number;
}
