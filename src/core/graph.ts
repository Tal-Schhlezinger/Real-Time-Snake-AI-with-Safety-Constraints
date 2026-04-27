import { DIRECTIONS, DIRECTION_VECTORS, addCoords, coordKey, inBounds, nodeIdForCoord } from './coords.js';
import { coordListToSet, portalCellMap } from './board-map.js';
import type { Direction, EditableMapDraft, GraphEdge, GraphNode, GraphSnapshot, NodeId, SavedMap } from './types.js';

export interface HydratedGraph {
  snapshot: GraphSnapshot;
  nodesById: Map<NodeId, GraphNode>;
  outgoing: Map<NodeId, GraphEdge[]>;
  incoming: Map<NodeId, GraphEdge[]>;
  undirectedNeighbors: Map<NodeId, Set<NodeId>>;
  directionLookup: Map<string, GraphEdge>;
}

export interface GraphBuildResult {
  graph: GraphSnapshot;
  portalErrors: string[];
}

function createEdgeId(from: NodeId, to: NodeId, direction: Direction, viaPortalId?: string): string {
  return viaPortalId ? `${from}:${direction}:${to}:p:${viaPortalId}` : `${from}:${direction}:${to}`;
}

export function buildGraphFromDraft(draft: Pick<EditableMapDraft | SavedMap, 'width' | 'height' | 'walls' | 'portals'>): GraphBuildResult {
  const wallSet = coordListToSet(draft.walls);
  const portalMap = portalCellMap(draft.portals);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const portalErrors: string[] = [];

  for (let y = 0; y < draft.height; y += 1) {
    for (let x = 0; x < draft.width; x += 1) {
      const coord = { x, y };
      const key = coordKey(coord);
      if (wallSet.has(key) || portalMap.has(key)) {
        continue;
      }
      nodes.push({ id: nodeIdForCoord(coord), x, y });
    }
  }

  const nodeSet = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    const source = { x: node.x, y: node.y };
    for (const direction of DIRECTIONS) {
      const neighbor = addCoords(source, DIRECTION_VECTORS[direction]);
      if (!inBounds(neighbor, draft.width, draft.height)) {
        continue;
      }

      const neighborKey = coordKey(neighbor);
      if (wallSet.has(neighborKey)) {
        continue;
      }

      const portal = portalMap.get(neighborKey);
      if (portal) {
        const exit = addCoords(portal.pairCoord, DIRECTION_VECTORS[direction]);
        if (!inBounds(exit, draft.width, draft.height)) {
          portalErrors.push(`Portal ${portal.portalId} exits out of bounds when entering from ${neighbor.x},${neighbor.y}.`);
          continue;
        }
        const exitKey = coordKey(exit);
        if (wallSet.has(exitKey) || portalMap.has(exitKey)) {
          portalErrors.push(`Portal ${portal.portalId} exits onto an invalid tile at ${exit.x},${exit.y}.`);
          continue;
        }
        const targetId = nodeIdForCoord(exit);
        if (!nodeSet.has(targetId)) {
          portalErrors.push(`Portal ${portal.portalId} exits onto a non-playable tile at ${exit.x},${exit.y}.`);
          continue;
        }
        edges.push({
          id: createEdgeId(node.id, targetId, direction, portal.portalId),
          from: node.id,
          to: targetId,
          direction,
          kind: 'portal',
          viaPortalId: portal.portalId
        });
        continue;
      }

      const targetId = nodeIdForCoord(neighbor);
      if (!nodeSet.has(targetId)) {
        continue;
      }
      edges.push({
        id: createEdgeId(node.id, targetId, direction),
        from: node.id,
        to: targetId,
        direction,
        kind: 'adjacent'
      });
    }
  }

  return {
    graph: { nodes, edges },
    portalErrors
  };
}

export function hydrateGraph(snapshot: GraphSnapshot): HydratedGraph {
  const nodesById = new Map<NodeId, GraphNode>();
  const outgoing = new Map<NodeId, GraphEdge[]>();
  const incoming = new Map<NodeId, GraphEdge[]>();
  const undirectedNeighbors = new Map<NodeId, Set<NodeId>>();
  const directionLookup = new Map<string, GraphEdge>();

  for (const node of snapshot.nodes) {
    nodesById.set(node.id, node);
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
    undirectedNeighbors.set(node.id, new Set());
  }

  for (const edge of snapshot.edges) {
    outgoing.get(edge.from)?.push(edge);
    incoming.get(edge.to)?.push(edge);
    undirectedNeighbors.get(edge.from)?.add(edge.to);
    undirectedNeighbors.get(edge.to)?.add(edge.from);
    directionLookup.set(`${edge.from}:${edge.direction}`, edge);
  }

  return {
    snapshot,
    nodesById,
    outgoing,
    incoming,
    undirectedNeighbors,
    directionLookup
  };
}

export function compareGraphSnapshots(a: GraphSnapshot, b: GraphSnapshot): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) {
    return false;
  }

  const nodeKey = (node: GraphNode) => `${node.id}:${node.x}:${node.y}`;
  const edgeKey = (edge: GraphEdge) =>
    `${edge.id}:${edge.from}:${edge.to}:${edge.direction}:${edge.kind}:${edge.viaPortalId ?? ''}`;

  const aNodes = [...a.nodes].map(nodeKey).sort();
  const bNodes = [...b.nodes].map(nodeKey).sort();
  const aEdges = [...a.edges].map(edgeKey).sort();
  const bEdges = [...b.edges].map(edgeKey).sort();

  return aNodes.every((value, index) => value === bNodes[index]) && aEdges.every((value, index) => value === bEdges[index]);
}

export function edgeExists(graph: HydratedGraph, from: NodeId, to: NodeId): boolean {
  return (graph.outgoing.get(from) ?? []).some((edge) => edge.to === to);
}

export function graphNodeIds(snapshot: GraphSnapshot): NodeId[] {
  return snapshot.nodes.map((node) => node.id);
}
