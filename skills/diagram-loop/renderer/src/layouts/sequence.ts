import {DESIGN_TOKENS} from "../design-tokens.js";
import type {LayoutInput, LayoutResult, PositionedNode} from "./types.js";

export function layoutSequence(input: LayoutInput): LayoutResult {
  if (input.scene.kind !== "sequence") throw new Error("Sequence layout requires sequence input");
  const usableWidth = input.width - input.viewportInset * 2;
  const columnWidth = usableWidth / input.nodes.length;
  const top = input.viewportInset + 72;
  const nodes: PositionedNode[] = input.nodes.map((node, index) => ({
    ...node,
    x: input.viewportInset + columnWidth * index + (columnWidth - node.width) / 2,
    y: top,
    ports: [],
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const messageTop = Math.max(...nodes.map((node) => node.y + node.height))
    + DESIGN_TOKENS.layout.sequenceMessageGap;
  const messageSpacing = DESIGN_TOKENS.layout.sequenceMessageSpacing;
  const lastMessageY = messageTop + Math.max(0, input.scene.edges.length - 1) * messageSpacing;
  if (lastMessageY + DESIGN_TOKENS.layout.sequenceLifelineTail > input.height - input.viewportInset) {
    throw new Error("Sequence messages and lifelines do not fit the viewport-safe area");
  }
  const edges = input.scene.edges.map((edge, index) => {
    const source = nodeById.get(edge.from);
    const destination = nodeById.get(edge.to);
    if (source === undefined || destination === undefined) throw new Error(`Missing endpoint for ${edge.id}`);
    const y = messageTop + index * messageSpacing;
    const sourcePort = {
      id: `${source.id}-${edge.id}-lifeline`, owner: source.id, side: "lifeline" as const,
      x: source.x + source.width / 2, y,
    };
    const destinationPort = {
      id: `${destination.id}-${edge.id}-lifeline`, owner: destination.id, side: "lifeline" as const,
      x: destination.x + destination.width / 2, y,
    };
    source.ports.push(sourcePort);
    destination.ports.push(destinationPort);
    return {id: edge.id, points: [sourcePort, destinationPort]};
  });
  return {nodes, edges};
}
