import { hydrateGraph } from './graph.js';
import type { GraphSnapshot, NodeId } from './types.js';

export interface HamiltonianSolveOptions {
  timeLimitMs?: number;
  signal?: AbortSignal;
  onProgress?: (expansions: number) => void;
  progressEvery?: number;
  startNodeId?: NodeId;
  neighborOrderSeed?: number;
  neighborBias?: (current: NodeId, next: NodeId) => number;
}

export interface HamiltonianSolveResult {
  status: 'found' | 'not-found' | 'timed-out' | 'cancelled';
  cycle: NodeId[];
  expansions: number;
  durationMs: number;
}

function countAllowedNeighbors(nodeId: NodeId, allowed: Set<NodeId>, neighbors: Map<NodeId, Set<NodeId>>): number {
  let count = 0;
  for (const neighbor of neighbors.get(nodeId) ?? []) {
    if (allowed.has(neighbor)) {
      count += 1;
    }
  }
  return count;
}

function countAllowedOutgoing(nodeId: NodeId, allowed: Set<NodeId>, outgoing: Map<NodeId, { to: NodeId }[]>): number {
  let count = 0;
  for (const edge of outgoing.get(nodeId) ?? []) {
    if (allowed.has(edge.to)) {
      count += 1;
    }
  }
  return count;
}

function countAllowedIncoming(nodeId: NodeId, allowed: Set<NodeId>, incoming: Map<NodeId, { from: NodeId }[]>): number {
  let count = 0;
  for (const edge of incoming.get(nodeId) ?? []) {
    if (allowed.has(edge.from)) {
      count += 1;
    }
  }
  return count;
}

function isResidualConnected(start: NodeId, allowed: Set<NodeId>, neighbors: Map<NodeId, Set<NodeId>>): boolean {
  const visited = new Set<NodeId>();
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of neighbors.get(current) ?? []) {
      if (!allowed.has(neighbor) || visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return visited.size === allowed.size;
}

function hashSeededNodeKey(nodeId: NodeId, seed: number, salt: string): number {
  let hash = 2166136261 ^ seed;
  const text = `${salt}:${nodeId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseStartNode(graph: ReturnType<typeof hydrateGraph>, preferredStartNodeId?: NodeId, seed = 0): NodeId | null {
  if (preferredStartNodeId && graph.nodesById.has(preferredStartNodeId)) {
    return preferredStartNodeId;
  }

  const nodes = [...graph.nodesById.keys()];
  if (nodes.length === 0) {
    return null;
  }

  nodes.sort((left, right) => {
    const leftDegree = (graph.undirectedNeighbors.get(left) ?? new Set()).size;
    const rightDegree = (graph.undirectedNeighbors.get(right) ?? new Set()).size;
    if (leftDegree !== rightDegree) {
      return leftDegree - rightDegree;
    }
    const leftOutgoing = (graph.outgoing.get(left) ?? []).length;
    const rightOutgoing = (graph.outgoing.get(right) ?? []).length;
    if (leftOutgoing !== rightOutgoing) {
      return leftOutgoing - rightOutgoing;
    }
    const leftSeeded = hashSeededNodeKey(left, seed, 'start');
    const rightSeeded = hashSeededNodeKey(right, seed, 'start');
    if (leftSeeded !== rightSeeded) {
      return leftSeeded - rightSeeded;
    }
    return left.localeCompare(right);
  });

  return nodes[0] ?? null;
}

export function solveHamiltonianCycle(snapshot: GraphSnapshot, options: HamiltonianSolveOptions = {}): HamiltonianSolveResult {
  const startedAt = performance.now();
  const graph = hydrateGraph(snapshot);
  const totalNodes = snapshot.nodes.length;
  const timeLimitMs = options.timeLimitMs ?? 7_500;
  const progressEvery = options.progressEvery ?? 2_500;
  const neighborOrderSeed = options.neighborOrderSeed ?? 0;

  if (totalNodes === 0) {
    return {
      status: 'not-found',
      cycle: [],
      expansions: 0,
      durationMs: performance.now() - startedAt
    };
  }

  const start = chooseStartNode(graph, options.startNodeId, neighborOrderSeed);
  if (!start) {
    return {
      status: 'not-found',
      cycle: [],
      expansions: 0,
      durationMs: performance.now() - startedAt
    };
  }

  const path: NodeId[] = [start];
  const visited = new Set<NodeId>(path);
  let expansions = 0;
  let cancelled = false;
  let timedOut = false;

  const hasOutgoingToStart = (nodeId: NodeId) => (graph.outgoing.get(nodeId) ?? []).some((edge) => edge.to === start);

  const checkLimits = (): boolean => {
    if (options.signal?.aborted) {
      cancelled = true;
      return false;
    }
    if (performance.now() - startedAt > timeLimitMs) {
      timedOut = true;
      return false;
    }
    return true;
  };

  const residualIsViable = (current: NodeId): boolean => {
    const allowed = new Set<NodeId>();
    for (const nodeId of graph.nodesById.keys()) {
      if (!visited.has(nodeId) || nodeId === current || nodeId === start) {
        allowed.add(nodeId);
      }
    }

    if (!allowed.has(current) || !allowed.has(start)) {
      return false;
    }

    if (!isResidualConnected(current, allowed, graph.undirectedNeighbors)) {
      return false;
    }

    for (const nodeId of allowed) {
      const supportDegree = countAllowedNeighbors(nodeId, allowed, graph.undirectedNeighbors);
      const outgoingDegree = countAllowedOutgoing(nodeId, allowed, graph.outgoing);
      const incomingDegree = countAllowedIncoming(nodeId, allowed, graph.incoming);

      if (nodeId === current) {
        if (allowed.size > 1 && outgoingDegree < 1) {
          return false;
        }
        continue;
      }

      if (nodeId === start) {
        if (allowed.size > 1 && incomingDegree < 1) {
          return false;
        }
        continue;
      }

      if (supportDegree < 2 || outgoingDegree < 1 || incomingDegree < 1) {
        return false;
      }
    }

    return true;
  };

  const search = (current: NodeId): NodeId[] | null => {
    if (!checkLimits()) {
      return null;
    }

    if (path.length === totalNodes) {
      return hasOutgoingToStart(current) ? [...path] : null;
    }

    expansions += 1;
    if (expansions % progressEvery === 0) {
      options.onProgress?.(expansions);
    }

    const allowedNodes = new Set([...graph.nodesById.keys()].filter((nodeId) => !visited.has(nodeId) || nodeId === start));
    const candidates = (graph.outgoing.get(current) ?? [])
      .filter((edge) => !visited.has(edge.to))
      .map((edge) => edge.to)
      .sort((left, right) => {
        const leftBias = options.neighborBias?.(current, left) ?? 0;
        const rightBias = options.neighborBias?.(current, right) ?? 0;
        if (leftBias !== rightBias) {
          return leftBias - rightBias;
        }

        const leftAllowed = countAllowedOutgoing(left, allowedNodes, graph.outgoing);
        const rightAllowed = countAllowedOutgoing(right, allowedNodes, graph.outgoing);
        if (leftAllowed !== rightAllowed) {
          return leftAllowed - rightAllowed;
        }
        const leftSupport = (graph.undirectedNeighbors.get(left) ?? new Set()).size;
        const rightSupport = (graph.undirectedNeighbors.get(right) ?? new Set()).size;
        if (leftSupport !== rightSupport) {
          return leftSupport - rightSupport;
        }
        const leftSeeded = hashSeededNodeKey(left, neighborOrderSeed, current);
        const rightSeeded = hashSeededNodeKey(right, neighborOrderSeed, current);
        if (leftSeeded !== rightSeeded) {
          return leftSeeded - rightSeeded;
        }
        return left.localeCompare(right);
      });

    for (const next of candidates) {
      visited.add(next);
      path.push(next);

      if (residualIsViable(next)) {
        const result = search(next);
        if (result) {
          return result;
        }
      }

      path.pop();
      visited.delete(next);
    }

    return null;
  };

  const cycle = search(start);
  const durationMs = performance.now() - startedAt;

  if (cycle) {
    return {
      status: 'found',
      cycle,
      expansions,
      durationMs
    };
  }

  if (cancelled) {
    return {
      status: 'cancelled',
      cycle: [],
      expansions,
      durationMs
    };
  }

  if (timedOut) {
    return {
      status: 'timed-out',
      cycle: [],
      expansions,
      durationMs
    };
  }

  return {
    status: 'not-found',
    cycle: [],
    expansions,
    durationMs
  };
}
