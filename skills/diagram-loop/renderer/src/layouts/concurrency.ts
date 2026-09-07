import {DESIGN_TOKENS} from "../design-tokens.js";
import {centeredOffset, orthogonalRoute, portsForRelativeNodes} from "./shared.js";
import type {LayoutInput, LayoutResult, PositionedNode} from "./types.js";

export function layoutConcurrency(input: LayoutInput): LayoutResult {
  if (input.scene.kind !== "concurrency") {
    throw new Error("Concurrency layout requires concurrency input");
  }
  const measuredById = new Map(input.nodes.map((node) => [node.id, node]));
  const rows: PositionedNode[][] = [];
  const spanByNode = new Map(input.scene.spans.map((span) => [span.node, span]));
  const maximumEnd = Math.max(...input.scene.spans.map((span) => span.start + span.duration));
  const usableWidth = input.width - input.viewportInset * 2;
  let y = 0;
  for (const lane of input.scene.lanes) {
    const measured = lane.nodes.map((nodeId) => {
      const node = measuredById.get(nodeId);
      if (node === undefined) throw new Error(`Lane references missing node: ${nodeId}`);
      return node;
    });
    const rowHeight = Math.max(...measured.map((node) => node.height));
    const row = measured.map((node) => {
      const span = spanByNode.get(node.id);
      if (span === undefined) throw new Error(`Concurrency node has no time span: ${node.id}`);
      const progress = (span.start + span.duration / 2) / maximumEnd;
      const center = input.viewportInset + progress * usableWidth;
      const positioned: PositionedNode = {
        ...node,
        x: Math.max(input.viewportInset, Math.min(input.width - input.viewportInset - node.width, center - node.width / 2)),
        y: y + (rowHeight - node.height) / 2,
        ports: [],
        concurrencyState: span.state,
      };
      return positioned;
    });
    rows.push(row);
    y += rowHeight + DESIGN_TOKENS.layout.laneSpacing;
  }
  const nodes = rows.flat();
  const offset = centeredOffset(nodes, input.width, input.height, input.viewportInset);
  for (const node of nodes) {
    node.y += offset.y;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = input.scene.edges.map((edge) => {
    const source = nodeById.get(edge.from);
    const destination = nodeById.get(edge.to);
    if (source === undefined || destination === undefined) throw new Error(`Missing endpoint for ${edge.id}`);
    const {sourcePort, destinationPort, direction} = portsForRelativeNodes(source, destination, edge.id);
    source.ports.push(sourcePort);
    destination.ports.push(destinationPort);
    return {id: edge.id, points: orthogonalRoute(sourcePort, destinationPort, direction)};
  });
  return {nodes, edges};
}
