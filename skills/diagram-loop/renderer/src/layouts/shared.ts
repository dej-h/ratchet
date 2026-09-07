import type {Point} from "../compiled-schema.js";
import type {PositionedNode} from "./types.js";

export function nodePort(
  node: Pick<PositionedNode, "id" | "x" | "y" | "width" | "height">,
  side: "north" | "east" | "south" | "west",
  edgeId: string,
): PositionedNode["ports"][number] {
  const coordinates = {
    north: {x: node.x + node.width / 2, y: node.y},
    east: {x: node.x + node.width, y: node.y + node.height / 2},
    south: {x: node.x + node.width / 2, y: node.y + node.height},
    west: {x: node.x, y: node.y + node.height / 2},
  }[side];
  return {id: `${node.id}-${edgeId}-${side}`, owner: node.id, side, ...coordinates};
}

export function orthogonalRoute(start: Point, end: Point, direction: "lr" | "tb"): Point[] {
  const first = {x: start.x, y: start.y};
  const last = {x: end.x, y: end.y};
  if (direction === "lr") {
    const middle = (start.x + end.x) / 2;
    return [first, {x: middle, y: start.y}, {x: middle, y: end.y}, last];
  }
  const middle = (start.y + end.y) / 2;
  return [first, {x: start.x, y: middle}, {x: end.x, y: middle}, last];
}

export function portsForRelativeNodes(
  source: Pick<PositionedNode, "id" | "x" | "y" | "width" | "height">,
  destination: Pick<PositionedNode, "id" | "x" | "y" | "width" | "height">,
  edgeId: string,
): {sourcePort: PositionedNode["ports"][number]; destinationPort: PositionedNode["ports"][number]; direction: "lr" | "tb"} {
  const sourceCenter = {x: source.x + source.width / 2, y: source.y + source.height / 2};
  const destinationCenter = {
    x: destination.x + destination.width / 2,
    y: destination.y + destination.height / 2,
  };
  const dx = destinationCenter.x - sourceCenter.x;
  const dy = destinationCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? {sourcePort: nodePort(source, "east", edgeId), destinationPort: nodePort(destination, "west", edgeId), direction: "lr"}
      : {sourcePort: nodePort(source, "west", edgeId), destinationPort: nodePort(destination, "east", edgeId), direction: "lr"};
  }
  return dy >= 0
    ? {sourcePort: nodePort(source, "south", edgeId), destinationPort: nodePort(destination, "north", edgeId), direction: "tb"}
    : {sourcePort: nodePort(source, "north", edgeId), destinationPort: nodePort(destination, "south", edgeId), direction: "tb"};
}

export function centeredOffset(
  nodes: Array<{x: number; y: number; width: number; height: number}>,
  width: number,
  height: number,
  inset: number,
): {x: number; y: number} {
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  if (contentWidth > width - inset * 2 || contentHeight > height - inset * 2) {
    throw new Error(
      `Layout needs ${Math.ceil(contentWidth)}x${Math.ceil(contentHeight)}px but the safe viewport is ${width - inset * 2}x${height - inset * 2}px`,
    );
  }
  return {
    x: (width - contentWidth) / 2 - minX,
    y: (height - contentHeight) / 2 - minY,
  };
}
