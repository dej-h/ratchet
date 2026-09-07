import {DESIGN_TOKENS} from "../design-tokens.js";
import type {Scene} from "../schema.js";
import {centeredOffset, nodePort, orthogonalRoute, portsForRelativeNodes} from "./shared.js";
import type {LayoutInput, LayoutResult, PositionedNode} from "./types.js";

export function layoutStaged(input: LayoutInput): LayoutResult {
  if (input.scene.kind !== "flow" || input.scene.stages === undefined) {
    throw new Error("Staged layout requires a flow scene with stages");
  }
  const measuredById = new Map(input.nodes.map((node) => [node.id, node]));
  const columns: PositionedNode[][] = [];
  let x = 0;
  for (const stage of input.scene.stages) {
    const measured = stage.nodes.map((nodeId) => {
      const node = measuredById.get(nodeId);
      if (node === undefined) throw new Error(`Stage references missing node: ${nodeId}`);
      return node;
    });
    const columnWidth = Math.max(...measured.map((node) => node.width));
    const totalHeight = measured.reduce((total, node) => total + node.height, 0)
      + DESIGN_TOKENS.layout.nodeSpacing * (measured.length - 1);
    let y = -totalHeight / 2;
    const column = measured.map((node) => {
      const positioned: PositionedNode = {
        ...node,
        x: x + (columnWidth - node.width) / 2,
        y,
        ports: [],
      };
      y += node.height + DESIGN_TOKENS.layout.nodeSpacing;
      return positioned;
    });
    columns.push(column);
    x += columnWidth + DESIGN_TOKENS.layout.stageSpacing;
  }
  const nodes = columns.flat();
  const offset = centeredOffset(nodes, input.width, input.height, input.viewportInset);
  for (const node of nodes) {
    node.x += offset.x;
    node.y += offset.y;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = input.scene.edges.map((edge) => {
    const source = nodeById.get(edge.from);
    const destination = nodeById.get(edge.to);
    if (source === undefined || destination === undefined) throw new Error(`Missing endpoint for ${edge.id}`);
    if (edge.role === "feedback") {
      const sourceCenterX = source.x + source.width / 2;
      const sourceCenterY = source.y + source.height / 2;
      const destinationCenterX = destination.x + destination.width / 2;
      const destinationCenterY = destination.y + destination.height / 2;
      const sourcePort = nodePort(
        source,
        destinationCenterX >= sourceCenterX ? "east" : "west",
        edge.id,
      );
      const destinationPort = nodePort(
        destination,
        sourceCenterY >= destinationCenterY ? "south" : "north",
        edge.id,
      );
      source.ports.push(sourcePort);
      destination.ports.push(destinationPort);
      return {
        id: edge.id,
        points: [
          {x: sourcePort.x, y: sourcePort.y},
          {x: destinationPort.x, y: sourcePort.y},
          {x: destinationPort.x, y: destinationPort.y},
        ],
      };
    }
    const {sourcePort, destinationPort, direction} = portsForRelativeNodes(source, destination, edge.id);
    source.ports.push(sourcePort);
    destination.ports.push(destinationPort);
    return {id: edge.id, points: orthogonalRoute(sourcePort, destinationPort, direction)};
  });
  return {nodes, edges};
}
