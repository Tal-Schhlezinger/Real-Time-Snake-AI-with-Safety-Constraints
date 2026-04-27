import { buildGraphFromDraft, compareGraphSnapshots, edgeExists, hydrateGraph } from './graph.js';
import { solveHamiltonianCycle, type HamiltonianSolveOptions } from './hamiltonian-cycle-solver.js';
import { coordKey, nodeIdForCoord } from './coords.js';
import { coordListToSet } from './board-map.js';
import type { EditableMapDraft, GraphSnapshot, MapValidationResult, SavedMap, ValidationMessage } from './types.js';

export interface MapValidationOptions extends HamiltonianSolveOptions {}

function message(code: ValidationMessage['code'], text: string): ValidationMessage {
  return {
    code,
    message: text
  };
}

function walkConnectivity(graph: ReturnType<typeof hydrateGraph>): Set<string> {
  const nodeIds = [...graph.nodesById.keys()];
  const firstNodeId = nodeIds[0];
  if (!firstNodeId) {
    return new Set();
  }
  const seen = new Set<string>([firstNodeId]);
  const queue = [firstNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph.undirectedNeighbors.get(current) ?? []) {
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function findBridgeEdges(graph: ReturnType<typeof hydrateGraph>): Array<[string, string]> {
  const nodeIds = [...graph.nodesById.keys()];
  const visited = new Set<string>();
  const tin = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges: Array<[string, string]> = [];
  let timer = 0;

  const dfs = (nodeId: string, parent: string | null): void => {
    visited.add(nodeId);
    timer += 1;
    tin.set(nodeId, timer);
    low.set(nodeId, timer);

    for (const next of graph.undirectedNeighbors.get(nodeId) ?? []) {
      if (next === parent) {
        continue;
      }
      if (visited.has(next)) {
        low.set(nodeId, Math.min(low.get(nodeId) ?? Number.POSITIVE_INFINITY, tin.get(next) ?? Number.POSITIVE_INFINITY));
        continue;
      }
      dfs(next, nodeId);
      low.set(nodeId, Math.min(low.get(nodeId) ?? Number.POSITIVE_INFINITY, low.get(next) ?? Number.POSITIVE_INFINITY));
      if ((low.get(next) ?? 0) > (tin.get(nodeId) ?? 0)) {
        bridges.push(nodeId < next ? [nodeId, next] : [next, nodeId]);
      }
    }
  };

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, null);
    }
  }

  return bridges;
}

export function validateHamiltonianCycle(graphSnapshot: GraphSnapshot, cycle: string[]): boolean {
  if (cycle.length !== graphSnapshot.nodes.length) {
    return false;
  }

  const graph = hydrateGraph(graphSnapshot);
  const unique = new Set(cycle);
  if (unique.size !== cycle.length) {
    return false;
  }

  for (const nodeId of unique) {
    if (!graph.nodesById.has(nodeId)) {
      return false;
    }
  }

  for (let index = 0; index < cycle.length; index += 1) {
    const current = cycle[index]!;
    const next = cycle[(index + 1) % cycle.length]!;
    if (!edgeExists(graph, current, next)) {
      return false;
    }
  }

  return true;
}

export function validateDraftMap(draft: EditableMapDraft, options: MapValidationOptions = {}): MapValidationResult {
  const startedAt = performance.now();
  const reasons: ValidationMessage[] = [];

  if (!draft.snakeSpawn) {
    const emptyGraph: GraphSnapshot = { nodes: [], edges: [] };
    return {
      isValid: false,
      graph: emptyGraph,
      cycle: [],
      reasons: [message('missing-snake-spawn', 'Place a snake spawn point on a playable tile.')],
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const wallSet = coordListToSet(draft.walls);
  const portalCells = new Set<string>();
  for (const portal of draft.portals) {
    const aKey = coordKey(portal.a);
    const bKey = coordKey(portal.b);
    if (portalCells.has(aKey) || portalCells.has(bKey) || wallSet.has(aKey) || wallSet.has(bKey) || aKey === bKey) {
      reasons.push(message('portal-overlap', 'Portals must use unique non-wall tiles and cannot overlap each other.'));
      break;
    }
    portalCells.add(aKey);
    portalCells.add(bKey);
  }

  const spawnKey = coordKey(draft.snakeSpawn);
  if (wallSet.has(spawnKey) || portalCells.has(spawnKey)) {
    reasons.push(message('spawn-on-invalid-tile', 'The snake spawn must be on a normal playable tile, not a wall or portal.'));
  }

  if (reasons.length > 0) {
    return {
      isValid: false,
      graph: { nodes: [], edges: [] },
      cycle: [],
      reasons,
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const { graph, portalErrors } = buildGraphFromDraft(draft);
  if (portalErrors.length > 0) {
    return {
      isValid: false,
      graph,
      cycle: [],
      reasons: portalErrors.map((error) => message('portal-exit-invalid', error)),
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  if (graph.nodes.length === 0) {
    return {
      isValid: false,
      graph,
      cycle: [],
      reasons: [message('playable-graph-empty', 'The playable graph is empty after excluding walls and portal tiles.')],
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const graphView = hydrateGraph(graph);
  const spawnNodeId = nodeIdForCoord(draft.snakeSpawn);
  if (!graphView.nodesById.has(spawnNodeId)) {
    return {
      isValid: false,
      graph,
      cycle: [],
      reasons: [message('spawn-on-invalid-tile', 'The snake spawn does not land on a playable graph node.')],
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const connected = walkConnectivity(graphView);
  if (connected.size !== graph.nodes.length) {
    reasons.push(message('disconnected-playable-graph', 'The playable graph is disconnected, so no Hamiltonian cycle can cover it.'));
  }

  for (const node of graph.nodes) {
    const supportDegree = (graphView.undirectedNeighbors.get(node.id) ?? new Set()).size;
    const outgoingDegree = (graphView.outgoing.get(node.id) ?? []).length;
    const incomingDegree = (graphView.incoming.get(node.id) ?? []).length;
    if (supportDegree < 2) {
      reasons.push(message('dead-end-cell', `Cell ${node.x},${node.y} is a dead end with degree ${supportDegree}.`));
      break;
    }
    if (outgoingDegree < 1 || incomingDegree < 1) {
      reasons.push(message('insufficient-directed-degree', `Cell ${node.x},${node.y} does not have enough legal directed movement to be part of a cycle.`));
      break;
    }
  }

  const bridges = findBridgeEdges(graphView);
  if (bridges.length > 0) {
    reasons.push(message('bridge-edge', 'The playable graph contains a bridge/cut edge, which blocks any Hamiltonian cycle.'));
  }

  if (reasons.length > 0) {
    return {
      isValid: false,
      graph,
      cycle: [],
      reasons,
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const solved = solveHamiltonianCycle(graph, options);
  const durationMs = performance.now() - startedAt;

  if (solved.status === 'found' && validateHamiltonianCycle(graph, solved.cycle)) {
    return {
      isValid: true,
      graph,
      cycle: solved.cycle,
      reasons: [],
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        expansions: solved.expansions,
        durationMs
      }
    };
  }

  let code: ValidationMessage['code'] = 'no-hamiltonian-cycle';
  let text = 'No Hamiltonian cycle was found for this playable graph.';
  if (solved.status === 'timed-out') {
    code = 'timed-out';
    text = 'Validation timed out before a Hamiltonian cycle was found.';
  } else if (solved.status === 'cancelled') {
    code = 'cancelled';
    text = 'Validation was cancelled before a Hamiltonian cycle was found.';
  }

  return {
    isValid: false,
    graph,
    cycle: [],
    reasons: [message(code, text)],
    stats: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      expansions: solved.expansions,
      durationMs
    }
  };
}

export function validateLoadedMap(savedMap: SavedMap, options: MapValidationOptions = {}): MapValidationResult {
  const startedAt = performance.now();
  const draft: EditableMapDraft = {
    id: savedMap.id,
    name: savedMap.name,
    width: savedMap.width,
    height: savedMap.height,
    walls: savedMap.walls,
    portals: savedMap.portals,
    snakeSpawn: savedMap.snakeSpawn,
    createdAt: savedMap.createdAt,
    updatedAt: savedMap.updatedAt
  };

  if (!draft.snakeSpawn) {
    return {
      isValid: false,
      graph: { nodes: [], edges: [] },
      cycle: [],
      reasons: [message('missing-snake-spawn', 'The saved map is missing its snake spawn point.')],
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const wallSet = coordListToSet(draft.walls);
  const portalCells = new Set<string>();
  for (const portal of draft.portals) {
    const aKey = coordKey(portal.a);
    const bKey = coordKey(portal.b);
    if (portalCells.has(aKey) || portalCells.has(bKey) || wallSet.has(aKey) || wallSet.has(bKey) || aKey === bKey) {
      return {
        isValid: false,
        graph: { nodes: [], edges: [] },
        cycle: [],
        reasons: [message('portal-overlap', 'The saved map contains overlapping or invalid portal tiles.')],
        stats: {
          nodeCount: 0,
          edgeCount: 0,
          expansions: 0,
          durationMs: performance.now() - startedAt
        }
      };
    }
    portalCells.add(aKey);
    portalCells.add(bKey);
  }

  if (wallSet.has(coordKey(draft.snakeSpawn)) || portalCells.has(coordKey(draft.snakeSpawn))) {
    return {
      isValid: false,
      graph: { nodes: [], edges: [] },
      cycle: [],
      reasons: [message('spawn-on-invalid-tile', 'The saved map places the snake spawn on an invalid tile.')],
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  const { graph, portalErrors } = buildGraphFromDraft(savedMap);
  if (portalErrors.length > 0) {
    return {
      isValid: false,
      graph,
      cycle: [],
      reasons: portalErrors.map((error) => message('portal-exit-invalid', error)),
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  if (!compareGraphSnapshots(graph, savedMap.graph) || !validateHamiltonianCycle(graph, savedMap.hamiltonianCycle)) {
    return {
      isValid: false,
      graph,
      cycle: [],
      reasons: [message('graph-grid-mismatch', 'The saved graph or Hamiltonian cycle does not match the current grid and portal rules.')]
      ,
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        expansions: 0,
        durationMs: performance.now() - startedAt
      }
    };
  }

  return {
    isValid: true,
    graph,
    cycle: savedMap.hamiltonianCycle,
    reasons: [],
    stats: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      expansions: 0,
      durationMs: performance.now() - startedAt
    }
  };
}
