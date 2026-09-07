import {createRequire} from "node:module";

import type {
  ELK as ElkInstance,
  ElkEdgeSection,
  ElkExtendedEdge,
  ElkNode,
} from "elkjs";

import {DESIGN_TOKENS} from "../design-tokens.js";
import {centeredOffset} from "./shared.js";
import type {LayoutInput, LayoutResult, PositionedNode} from "./types.js";

const require = createRequire(import.meta.url);
const ELK = require("elkjs") as new () => ElkInstance;

export async function layoutLayered(input: LayoutInput): Promise<LayoutResult> {
  if (!["architecture", "flow", "feedback"].includes(input.scene.kind)) {
    throw new Error("ELK layered layout only supports graph archetypes");
  }
  const direction = "direction" in input.scene ? input.scene.direction : "lr";
  const sourceSide = direction === "lr" ? "EAST" : "SOUTH";
  const destinationSide = direction === "lr" ? "WEST" : "NORTH";
  const portId = (nodeId: string, edgeId: string, endpoint: "source" | "target"): string =>
    `${nodeId}--${edgeId}--${endpoint}`;
  const elk = new ELK();
  const inputGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "lr" ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(DESIGN_TOKENS.layout.layerSpacing),
      "elk.spacing.nodeNode": String(DESIGN_TOKENS.layout.nodeSpacing),
      "elk.spacing.edgeNode": "24",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
    children: input.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: {"elk.portConstraints": "FIXED_SIDE"},
      ports: input.scene.edges.flatMap((edge) => {
        const ports = [];
        if (edge.from === node.id) {
          ports.push({
            id: portId(node.id, edge.id, "source"),
            width: 0,
            height: 0,
            layoutOptions: {"elk.port.side": sourceSide},
          });
        }
        if (edge.to === node.id) {
          ports.push({
            id: portId(node.id, edge.id, "target"),
            width: 0,
            height: 0,
            layoutOptions: {"elk.port.side": destinationSide},
          });
        }
        return ports;
      }),
    })),
    edges: input.scene.edges.map((edge) => ({
      id: edge.id,
      sources: [portId(edge.from, edge.id, "source")],
      targets: [portId(edge.to, edge.id, "target")],
    })),
  };
  const graph = await elk.layout(inputGraph);
  const measuredById = new Map(input.nodes.map((node) => [node.id, node]));
  const nodes: PositionedNode[] = (graph.children ?? []).map((child) => {
    const measured = measuredById.get(child.id);
    if (measured === undefined || child.x === undefined || child.y === undefined) {
      throw new Error(`ELK omitted geometry for ${child.id}`);
    }
    return {...measured, x: child.x, y: child.y, ports: []};
  });
  const offset = centeredOffset(nodes, input.width, input.height, input.viewportInset);
  for (const node of nodes) {
    node.x += offset.x;
    node.y += offset.y;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const elkEdgeById = new Map<string, ElkExtendedEdge>(
    (graph.edges ?? []).map((edge) => [edge.id, edge]),
  );
  const edges = input.scene.edges.map((edge) => {
    const source = nodeById.get(edge.from);
    const destination = nodeById.get(edge.to);
    const elkEdge = elkEdgeById.get(edge.id);
    const section: ElkEdgeSection | undefined = elkEdge?.sections?.[0];
    if (source === undefined || destination === undefined || section === undefined) {
      throw new Error(`ELK omitted route for ${edge.id}`);
    }
    const sourcePort = {
      id: portId(source.id, edge.id, "source"),
      owner: source.id,
      side: (direction === "lr" ? "east" : "south") as "east" | "south",
      x: section.startPoint.x + offset.x,
      y: section.startPoint.y + offset.y,
    };
    const destinationPort = {
      id: portId(destination.id, edge.id, "target"),
      owner: destination.id,
      side: (direction === "lr" ? "west" : "north") as "west" | "north",
      x: section.endPoint.x + offset.x,
      y: section.endPoint.y + offset.y,
    };
    source.ports.push(sourcePort);
    destination.ports.push(destinationPort);
    const elkPoints = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      .map((point) => ({x: point.x + offset.x, y: point.y + offset.y}));
    return {
      id: edge.id,
      points: elkPoints,
    };
  });
  return {nodes, edges};
}
