import { appleForward, validLockedCertificate } from './hamiltonian-certificate.js';
import { hydrateGraph } from './graph.js';
import { validateHamiltonianCycle } from './map-validator.js';
import type { GameState, HamiltonianCycle, NodeId } from './types.js';

export type LateGameFreeSpaceFailureReason =
  | 'free-count-above-threshold'
  | 'missing-head-or-tail'
  | 'disconnected-free-space'
  | 'no-hamilton-path'
  | 'budget-exhausted'
  | 'cycle-validation-failed'
  | 'apple-forward-failed';

export interface LateGameFreeSpacePathSolverOptions {
  freeCountThreshold?: number;
  maxExpansions?: number;
}

export interface LateGameFreeSpaceCycleValidity {
  graphValid: boolean;
  lockedCertificateValid: boolean;
  appleForwardValid: boolean | null;
}

export interface LateGameFreeSpacePathDiagnostics {
  freeCount: number;
  searchAttempted: boolean;
  nodesExpanded: number;
  budgetExhausted: boolean;
  success: boolean;
  failureReason: LateGameFreeSpaceFailureReason | null;
  appleIndexOnFoundPath: number | null;
  resultingCycleValidity: LateGameFreeSpaceCycleValidity;
  foundPath: NodeId[] | null;
  cycle: HamiltonianCycle | null;
}

const DEFAULT_OPTIONS: Required<LateGameFreeSpacePathSolverOptions> = {
  freeCountThreshold: 20,
  maxExpansions: 100_000
};

interface SearchContext {
  graph: ReturnType<typeof hydrateGraph>;
  freeNodes: NodeId[];
  freeSet: Set<NodeId>;
  head: NodeId;
  tail: NodeId;
  apple: NodeId | null;
  maxExpansions: number;
  nodesExpanded: number;
  budgetExhausted: boolean;
  disconnectedPrunes: number;
}

function emptyValidity(): LateGameFreeSpaceCycleValidity {
  return {
    graphValid: false,
    lockedCertificateValid: false,
    appleForwardValid: null
  };
}

function makeFailure(
  freeCount: number,
  searchAttempted: boolean,
  nodesExpanded: number,
  budgetExhausted: boolean,
  failureReason: LateGameFreeSpaceFailureReason,
  overrides: Partial<LateGameFreeSpacePathDiagnostics> = {}
): LateGameFreeSpacePathDiagnostics {
  return {
    freeCount,
    searchAttempted,
    nodesExpanded,
    budgetExhausted,
    success: false,
    failureReason,
    appleIndexOnFoundPath: null,
    resultingCycleValidity: emptyValidity(),
    foundPath: null,
    cycle: null,
    ...overrides
  };
}

function hasDirectedEdge(context: SearchContext, from: NodeId, to: NodeId): boolean {
  return (context.graph.outgoing.get(from) ?? []).some((edge) => edge.to === to);
}

function remainingFreeNodes(context: SearchContext, visitedFree: Set<NodeId>): NodeId[] {
  return context.freeNodes.filter((nodeId) => !visitedFree.has(nodeId));
}

function remainingGraphConnected(context: SearchContext, current: NodeId, visitedFree: Set<NodeId>): boolean {
  const allowed = new Set<NodeId>([current, context.tail, ...remainingFreeNodes(context, visitedFree)]);
  const visited = new Set<NodeId>([current]);
  const queue = [current];

  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const neighbor of context.graph.undirectedNeighbors.get(node) ?? []) {
      if (!allowed.has(neighbor) || visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return visited.size === allowed.size;
}

function onwardDegree(context: SearchContext, nodeId: NodeId, visitedFree: Set<NodeId>): number {
  let degree = 0;
  const remaining = remainingFreeNodes(context, visitedFree);
  for (const edge of context.graph.outgoing.get(nodeId) ?? []) {
    if (edge.to === context.tail && remaining.length === 0) {
      degree += 1;
    } else if (context.freeSet.has(edge.to) && !visitedFree.has(edge.to)) {
      degree += 1;
    }
  }
  return degree;
}

function candidateNextNodes(context: SearchContext, current: NodeId, visitedFree: Set<NodeId>): NodeId[] {
  const candidates: NodeId[] = [];
  for (const edge of context.graph.outgoing.get(current) ?? []) {
    if (edge.to === context.tail) {
      if (visitedFree.size === context.freeNodes.length) {
        candidates.push(edge.to);
      }
      continue;
    }

    if (context.freeSet.has(edge.to) && !visitedFree.has(edge.to)) {
      candidates.push(edge.to);
    }
  }

  return candidates.sort((left, right) => {
    const leftVisited = new Set(visitedFree);
    const rightVisited = new Set(visitedFree);
    if (context.freeSet.has(left)) {
      leftVisited.add(left);
    }
    if (context.freeSet.has(right)) {
      rightVisited.add(right);
    }

    const leftDegree = onwardDegree(context, left, leftVisited);
    const rightDegree = onwardDegree(context, right, rightVisited);
    const leftForced = leftDegree <= 1 ? 0 : 1;
    const rightForced = rightDegree <= 1 ? 0 : 1;
    if (leftForced !== rightForced) {
      return leftForced - rightForced;
    }

    const leftApple = context.apple === left ? 0 : 1;
    const rightApple = context.apple === right ? 0 : 1;
    if (leftApple !== rightApple) {
      return leftApple - rightApple;
    }

    if (leftDegree !== rightDegree) {
      return leftDegree - rightDegree;
    }

    return left.localeCompare(right);
  });
}

function searchHamiltonPath(
  context: SearchContext,
  current: NodeId,
  visitedFree: Set<NodeId>,
  path: NodeId[]
): NodeId[] | null {
  if (context.nodesExpanded >= context.maxExpansions) {
    context.budgetExhausted = true;
    return null;
  }

  context.nodesExpanded += 1;

  if (visitedFree.size === context.freeNodes.length) {
    return hasDirectedEdge(context, current, context.tail) ? [...path, context.tail] : null;
  }

  if (!remainingGraphConnected(context, current, visitedFree)) {
    context.disconnectedPrunes += 1;
    return null;
  }

  for (const next of candidateNextNodes(context, current, visitedFree)) {
    if (next === context.tail) {
      continue;
    }

    const nextVisited = new Set(visitedFree);
    nextVisited.add(next);
    const result = searchHamiltonPath(context, next, nextVisited, [...path, next]);
    if (result) {
      return result;
    }
    if (context.budgetExhausted) {
      return null;
    }
  }

  return null;
}

function buildCycleFromBodyAndFreePath(bodySegments: NodeId[], freePath: NodeId[]): HamiltonianCycle {
  return [...bodySegments].reverse().concat(freePath.slice(1, -1));
}

export class LateGameFreeSpacePathSolver {
  private readonly options: Required<LateGameFreeSpacePathSolverOptions>;

  constructor(options: LateGameFreeSpacePathSolverOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    };
  }

  solve(state: GameState): LateGameFreeSpacePathDiagnostics {
    const graph = hydrateGraph(state.map.graph);
    const body = state.snake.segments;
    const head = body[0] ?? null;
    const tail = body[body.length - 1] ?? null;
    const occupied = new Set(body);
    const freeNodes = state.map.graph.nodes
      .map((node) => node.id)
      .filter((nodeId) => !occupied.has(nodeId))
      .sort((left, right) => left.localeCompare(right));
    const freeCount = freeNodes.length;

    if (!head || !tail) {
      return makeFailure(freeCount, false, 0, false, 'missing-head-or-tail');
    }

    if (freeCount > this.options.freeCountThreshold) {
      return makeFailure(freeCount, false, 0, false, 'free-count-above-threshold');
    }

    const context: SearchContext = {
      graph,
      freeNodes,
      freeSet: new Set(freeNodes),
      head,
      tail,
      apple: state.appleNodeId,
      maxExpansions: this.options.maxExpansions,
      nodesExpanded: 0,
      budgetExhausted: false,
      disconnectedPrunes: 0
    };

    if (!remainingGraphConnected(context, head, new Set())) {
      return makeFailure(freeCount, true, 0, false, 'disconnected-free-space');
    }

    const foundPath = searchHamiltonPath(context, head, new Set(), [head]);
    if (!foundPath) {
      return makeFailure(
        freeCount,
        true,
        context.nodesExpanded,
        context.budgetExhausted,
        context.budgetExhausted ? 'budget-exhausted' : context.disconnectedPrunes > 0 ? 'disconnected-free-space' : 'no-hamilton-path'
      );
    }

    const cycle = buildCycleFromBodyAndFreePath(body, foundPath);
    const graphValid = validateHamiltonianCycle(state.map.graph, cycle);
    const lockedCertificateValid = validLockedCertificate(body, cycle);
    const appleForwardValid = state.appleNodeId ? appleForward(body, state.appleNodeId, cycle) : null;
    const resultingCycleValidity = {
      graphValid,
      lockedCertificateValid,
      appleForwardValid
    };
    const appleIndexOnFoundPath = state.appleNodeId ? foundPath.indexOf(state.appleNodeId) : null;
    const validatorsPass = graphValid && lockedCertificateValid && (state.appleNodeId === null || appleForwardValid === true);

    if (!validatorsPass) {
      return makeFailure(
        freeCount,
        true,
        context.nodesExpanded,
        false,
        graphValid && lockedCertificateValid ? 'apple-forward-failed' : 'cycle-validation-failed',
        {
          appleIndexOnFoundPath: appleIndexOnFoundPath === -1 ? null : appleIndexOnFoundPath,
          resultingCycleValidity,
          foundPath,
          cycle
        }
      );
    }

    return {
      freeCount,
      searchAttempted: true,
      nodesExpanded: context.nodesExpanded,
      budgetExhausted: false,
      success: true,
      failureReason: null,
      appleIndexOnFoundPath: appleIndexOnFoundPath === -1 ? null : appleIndexOnFoundPath,
      resultingCycleValidity,
      foundPath,
      cycle
    };
  }
}

export function solveLateGameFreeSpacePath(
  state: GameState,
  options: LateGameFreeSpacePathSolverOptions = {}
): LateGameFreeSpacePathDiagnostics {
  return new LateGameFreeSpacePathSolver(options).solve(state);
}
