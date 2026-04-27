import { distanceForwardOnCycle } from './hamiltonian-certificate.js';
import { hydrateGraph } from './graph.js';
import type { GameState, HamiltonianCycle, NodeId } from './types.js';

const MISSING_FEATURE_PENALTY = 1_000_000;

export interface CycleScoreWeights {
  pathLen: number;
  repairDistanceFromOldCycle: number;
  maxDistToBody: number;
  sumDistToBody: number;
  meanDistToBody: number;
  bodyAdjacency: number;
  freeComponentCount: number;
  holeArea: number;
  cutRisk: number;
  futureMobilityMargin: number;
}

export interface CycleFeatures {
  pathLen: number | null;
  repairDistanceFromOldCycle: number;
  maxDistToBody: number | null;
  sumDistToBody: number;
  meanDistToBody: number | null;
  bodyAdjacency: number;
  freeComponentCount: number | null;
  holeArea: number | null;
  cutRisk: number | null;
  futureMobilityMargin: number | null;
  arcNodeIds: NodeId[];
}

export const defaultCycleScoreWeights: CycleScoreWeights = {
  pathLen: 8,
  repairDistanceFromOldCycle: 1,
  maxDistToBody: 2,
  sumDistToBody: 0.5,
  meanDistToBody: 3,
  bodyAdjacency: 1.5,
  freeComponentCount: 0,
  holeArea: 0,
  cutRisk: 0,
  futureMobilityMargin: 0
};

function buildCycleEdgeSet(cycle: HamiltonianCycle): Set<string> {
  const edges = new Set<string>();
  for (let index = 0; index < cycle.length; index += 1) {
    const from = cycle[index]!;
    const to = cycle[(index + 1) % cycle.length]!;
    edges.add(`${from}->${to}`);
  }
  return edges;
}

function computeRepairDistanceFromOldCycle(oldCycle: HamiltonianCycle, candidateCycle: HamiltonianCycle): number {
  const oldEdges = buildCycleEdgeSet(oldCycle);
  const candidateEdges = buildCycleEdgeSet(candidateCycle);
  let symmetricDifferenceSize = 0;

  for (const edge of oldEdges) {
    if (!candidateEdges.has(edge)) {
      symmetricDifferenceSize += 1;
    }
  }

  for (const edge of candidateEdges) {
    if (!oldEdges.has(edge)) {
      symmetricDifferenceSize += 1;
    }
  }

  return symmetricDifferenceSize;
}

function buildCycleIndexMap(cycle: HamiltonianCycle): Map<NodeId, number> {
  const indexByNode = new Map<NodeId, number>();
  cycle.forEach((nodeId, index) => indexByNode.set(nodeId, index));
  return indexByNode;
}

function collectForwardArcNodes(head: NodeId | undefined, apple: NodeId | null, cycle: HamiltonianCycle): NodeId[] {
  if (!head || !apple) {
    return [];
  }

  const pathLen = distanceForwardOnCycle(head, apple, cycle);
  if (pathLen === null || pathLen === 0) {
    return [];
  }

  const indexByNode = buildCycleIndexMap(cycle);
  const headIndex = indexByNode.get(head);
  if (headIndex === undefined) {
    return [];
  }

  const arcNodeIds: NodeId[] = [];
  for (let step = 1; step <= pathLen; step += 1) {
    arcNodeIds.push(cycle[(headIndex + step) % cycle.length]!);
  }
  return arcNodeIds;
}

function computeBodyDistances(state: GameState): Map<NodeId, number> {
  const graph = hydrateGraph(state.map.graph);
  const bodySegments = [...state.snake.segments];
  const distances = new Map<NodeId, number>();
  const queue = [...bodySegments];

  for (const nodeId of bodySegments) {
    distances.set(nodeId, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distances.get(current)!;
    for (const neighbor of graph.undirectedNeighbors.get(current) ?? []) {
      if (distances.has(neighbor)) {
        continue;
      }
      distances.set(neighbor, currentDistance + 1);
      queue.push(neighbor);
    }
  }

  return distances;
}

function optionalMetricValue(value: number | null): number {
  return value ?? MISSING_FEATURE_PENALTY;
}

export function computeCycleFeatures(
  state: GameState,
  oldCycle: HamiltonianCycle,
  candidateCycle: HamiltonianCycle
): CycleFeatures {
  const graph = hydrateGraph(state.map.graph);
  const head = state.snake.segments[0];
  const arcNodeIds = collectForwardArcNodes(head, state.appleNodeId, candidateCycle);
  const bodyDistances = computeBodyDistances(state);
  const bodySet = new Set(state.snake.segments);

  const arcDistanceValues = arcNodeIds
    .map((nodeId) => bodyDistances.get(nodeId))
    .filter((value): value is number => value !== undefined);

  let bodyAdjacency = 0;
  for (const nodeId of arcNodeIds) {
    for (const neighbor of graph.undirectedNeighbors.get(nodeId) ?? []) {
      if (bodySet.has(neighbor)) {
        bodyAdjacency += 1;
      }
    }
  }

  const sumDistToBody = arcDistanceValues.reduce((total, value) => total + value, 0);
  const maxDistToBody = arcDistanceValues.length > 0 ? Math.max(...arcDistanceValues) : null;
  const meanDistToBody = arcDistanceValues.length > 0 ? sumDistToBody / arcDistanceValues.length : null;

  return {
    pathLen: head && state.appleNodeId ? distanceForwardOnCycle(head, state.appleNodeId, candidateCycle) : null,
    repairDistanceFromOldCycle: computeRepairDistanceFromOldCycle(oldCycle, candidateCycle),
    maxDistToBody,
    sumDistToBody,
    meanDistToBody,
    bodyAdjacency,
    freeComponentCount: null,
    holeArea: null,
    cutRisk: null,
    futureMobilityMargin: null,
    arcNodeIds
  };
}

export function scoreCycleFeatures(
  features: CycleFeatures,
  weights: CycleScoreWeights = defaultCycleScoreWeights
): number {
  return (
    weights.pathLen * optionalMetricValue(features.pathLen) +
    weights.repairDistanceFromOldCycle * features.repairDistanceFromOldCycle +
    weights.maxDistToBody * optionalMetricValue(features.maxDistToBody) +
    weights.sumDistToBody * features.sumDistToBody +
    weights.meanDistToBody * optionalMetricValue(features.meanDistToBody) -
    weights.bodyAdjacency * features.bodyAdjacency +
    weights.freeComponentCount * optionalMetricValue(features.freeComponentCount) +
    weights.holeArea * optionalMetricValue(features.holeArea) +
    weights.cutRisk * optionalMetricValue(features.cutRisk) -
    weights.futureMobilityMargin * optionalMetricValue(features.futureMobilityMargin)
  );
}

export function compareCandidateCycles(
  left: CycleFeatures,
  right: CycleFeatures,
  weights: CycleScoreWeights = defaultCycleScoreWeights
): number {
  const scoreDifference = scoreCycleFeatures(left, weights) - scoreCycleFeatures(right, weights);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const tieBreakers = [
    optionalMetricValue(left.pathLen) - optionalMetricValue(right.pathLen),
    left.repairDistanceFromOldCycle - right.repairDistanceFromOldCycle,
    optionalMetricValue(left.maxDistToBody) - optionalMetricValue(right.maxDistToBody),
    left.sumDistToBody - right.sumDistToBody,
    optionalMetricValue(left.meanDistToBody) - optionalMetricValue(right.meanDistToBody),
    right.bodyAdjacency - left.bodyAdjacency,
    left.arcNodeIds.join('|').localeCompare(right.arcNodeIds.join('|'))
  ];

  return tieBreakers.find((value) => value !== 0) ?? 0;
}
