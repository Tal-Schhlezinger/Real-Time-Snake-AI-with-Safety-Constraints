import { distanceForwardOnCycle } from './hamiltonian-certificate.js';
import {
  classifyV2FourExitSpliceCandidatesForSnake,
  classifyGeneratedV2FourExitSpliceCandidatesForSnake,
  generateV2FourExitSpliceCandidates,
  type RankedV2FourExitSnakeCandidate,
  type V2FourExitSnakeClassificationFromCandidatesResult,
  type V2FourExitSnakeClassificationOptions,
  type V2FourExitSnakeClassificationResult,
  type V2FourExitSpliceGenerationResult
} from './multi-terminal-patch-diagnostics.js';
import {
  createPatchMutationScenarioStates,
  type PatchMutationScenarioKind,
  type PatchMutationScenarioState
} from './patch-mutation-scenarios.js';
import type { GameState, HamiltonianCycle, NodeId, SavedMap } from './types.js';

export type V2PatchMutationScenarioOptions = V2FourExitSnakeClassificationOptions & {
  seedValues?: number[];
  midGameFillRatios?: number[];
  topCandidateCount?: number;
  maxSimulationSteps?: number;
};

export type V2PatchMutationScenarioTopCandidate = {
  candidateId: string;
  patchId: string;
  usabilityMode: string;
  currentLockedCyclePathLen: number | null;
  candidatePathLenToApple: number | null;
  transitionPathLength: number | null;
  pathLenImprovement: number | null;
  finalV2MutationScore: number;
  changedCycleEdges: number;
  rectangleArea: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  reason: string;
};

export type V2PatchMutationScenarioSummary = {
  scenarioId: string;
  kind: PatchMutationScenarioKind;
  description: string;
  seedValue: number | null;
  targetFillRatio: number | null;
  boardSize: string;
  snakeLength: number;
  fillRatio: number;
  head: NodeId | null;
  tail: NodeId | null;
  apple: NodeId | null;
  applesEaten: number;
  simulationSteps: number;
  currentLockedCyclePathLen: number | null;
  v2GraphValidCandidates: number;
  v2SnakeUsableCandidates: number;
  immediateLockedCandidates: number;
  transitionReachableCandidates: number;
  improvingCandidates: number;
  bestImprovement: number | null;
  bestCandidateMode: string | null;
  bestMutationRectangle: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  changedCycleEdges: number | null;
  topCandidates: V2PatchMutationScenarioTopCandidate[];
};

export type V2PatchMutationScenarioDiagnostics = {
  mapId: string;
  mapName: string;
  boardSize: string;
  options: {
    seedValues: number[];
    midGameFillRatios: number[];
    topCandidateCount: number;
  };
  scenarios: V2PatchMutationScenarioSummary[];
};

const DEFAULT_SEED_VALUES = [0, 0.23, 0.47, 0.71];
const DEFAULT_MID_GAME_FILL_RATIOS = [0.1, 0.25, 0.4];
const DEFAULT_TOP_CANDIDATE_COUNT = 5;

export function analyzeV2PatchMutationScenarios(
  map: SavedMap,
  options: V2PatchMutationScenarioOptions = {}
): V2PatchMutationScenarioDiagnostics {
  const seedValues = options.seedValues ?? DEFAULT_SEED_VALUES;
  const midGameFillRatios = options.midGameFillRatios ?? DEFAULT_MID_GAME_FILL_RATIOS;
  const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;

  const scenarios = createPatchMutationScenarioStates(map, {
    ...options,
    seedValues,
    midGameFillRatios,
    topCandidateCount
  });
  const spliceDiagnostics = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, options);

  return {
    mapId: map.id,
    mapName: map.name,
    boardSize: `${map.width}x${map.height}`,
    options: {
      seedValues,
      midGameFillRatios,
      topCandidateCount
    },
    scenarios: scenarios.map((scenario) => analyzeV2PatchMutationScenarioWithGeneratedCandidates(
      scenario,
      spliceDiagnostics,
      {
        ...options,
        topCandidateCount
      }
    ))
  };
}

export function analyzeV2PatchMutationScenario(
  scenario: PatchMutationScenarioState,
  options: V2PatchMutationScenarioOptions = {}
): V2PatchMutationScenarioSummary {
  const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;
  const state = scenario.state;
  const lockedCycle = getLockedCycle(state);
  const diagnostics = classifyV2FourExitSpliceCandidatesForSnake(state, state.map.graph, lockedCycle, options);
  return summarizeScenario(scenario, diagnostics, topCandidateCount);
}

export function analyzeV2PatchMutationScenarioWithGeneratedCandidates(
  scenario: PatchMutationScenarioState,
  spliceDiagnostics: V2FourExitSpliceGenerationResult,
  options: V2PatchMutationScenarioOptions = {}
): V2PatchMutationScenarioSummary {
  const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;
  const state = scenario.state;
  const lockedCycle = getLockedCycle(state);
  const diagnostics = classifyGeneratedV2FourExitSpliceCandidatesForSnake(
    state,
    spliceDiagnostics.candidates,
    lockedCycle,
    options
  );
  return summarizeScenario(scenario, diagnostics, topCandidateCount);
}

function summarizeScenario(
  scenario: PatchMutationScenarioState,
  diagnostics: V2FourExitSnakeClassificationResult | V2FourExitSnakeClassificationFromCandidatesResult,
  topCandidateCount: number
): V2PatchMutationScenarioSummary {
  const state = scenario.state;
  const lockedCycle = getLockedCycle(state);
  const bestRanked = diagnostics.rankedCandidates[0] ?? null;

  return {
    scenarioId: scenario.scenarioId,
    kind: scenario.kind,
    description: scenario.description,
    seedValue: scenario.seedValue,
    targetFillRatio: scenario.targetFillRatio,
    boardSize: `${state.map.width}x${state.map.height}`,
    snakeLength: state.snake.segments.length,
    fillRatio: state.snake.segments.length / state.map.graph.nodes.length,
    head: state.snake.segments[0] ?? null,
    tail: state.snake.segments[state.snake.segments.length - 1] ?? null,
    apple: state.appleNodeId,
    applesEaten: state.applesEaten,
    simulationSteps: scenario.simulationSteps,
    currentLockedCyclePathLen: currentLockedCyclePathLen(state, lockedCycle),
    v2GraphValidCandidates: diagnostics.aggregate.graphValidCandidates,
    v2SnakeUsableCandidates: diagnostics.aggregate.snakeUsableCandidates,
    immediateLockedCandidates: diagnostics.aggregate.immediateLockedCandidates,
    transitionReachableCandidates: diagnostics.aggregate.transitionReachableCandidates,
    improvingCandidates: diagnostics.aggregate.improvingCandidates,
    bestImprovement: diagnostics.aggregate.bestImprovement,
    bestCandidateMode: bestRanked?.features.usabilityMode ?? null,
    bestMutationRectangle: bestRanked?.candidate.rect ?? null,
    changedCycleEdges: bestRanked?.features.changedCycleEdges ?? null,
    topCandidates: summarizeTopCandidates(diagnostics, topCandidateCount)
  };
}

function summarizeTopCandidates(
  diagnostics: V2FourExitSnakeClassificationResult | V2FourExitSnakeClassificationFromCandidatesResult,
  topCandidateCount: number
): V2PatchMutationScenarioTopCandidate[] {
  return diagnostics.rankedCandidates.slice(0, topCandidateCount).map(summarizeRankedCandidate);
}

function summarizeRankedCandidate(
  rankedCandidate: RankedV2FourExitSnakeCandidate
): V2PatchMutationScenarioTopCandidate {
  return {
    candidateId: rankedCandidate.features.candidateId,
    patchId: rankedCandidate.features.patchId,
    usabilityMode: rankedCandidate.features.usabilityMode,
    currentLockedCyclePathLen: rankedCandidate.features.currentLockedCyclePathLen,
    candidatePathLenToApple: rankedCandidate.features.candidatePathLenToApple,
    transitionPathLength: rankedCandidate.features.transitionPathLength,
    pathLenImprovement: rankedCandidate.features.pathLenImprovement,
    finalV2MutationScore: rankedCandidate.features.finalV2MutationScore,
    changedCycleEdges: rankedCandidate.features.changedCycleEdges,
    rectangleArea: rankedCandidate.features.rectangleArea,
    rect: rankedCandidate.candidate.rect,
    reason: rankedCandidate.classification.reason
  };
}

function currentLockedCyclePathLen(state: GameState, cycle: HamiltonianCycle): number | null {
  const head = state.snake.segments[0] ?? null;
  if (!head || !state.appleNodeId) {
    return null;
  }

  return distanceForwardOnCycle(head, state.appleNodeId, cycle);
}

function getLockedCycle(state: GameState): HamiltonianCycle {
  return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}
