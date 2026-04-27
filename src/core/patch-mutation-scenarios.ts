import { decideAiMove } from './ai-controller.js';
import type { RandomSource } from './apple-spawner.js';
import { advanceGame } from './game-engine.js';
import { createInitialGameState } from './game-state.js';
import { distanceForwardOnCycle } from './hamiltonian-certificate.js';
import {
  rankPatchMutationCandidates,
  type PatchMutationRankingResult,
  type RankedPatchMutationCandidate,
  type SnakePatchMutationClassificationOptions
} from './two-terminal-patch-mutation.js';
import type { GameState, HamiltonianCycle, NodeId, SavedMap } from './types.js';

export type PatchMutationScenarioKind =
  | 'initial-near'
  | 'initial-far'
  | 'deterministic-seed'
  | 'mid-game'
  | 'manual-far';

export type PatchMutationScenarioOptions = SnakePatchMutationClassificationOptions & {
  seedValues?: number[];
  midGameFillRatios?: number[];
  topCandidateCount?: number;
  maxSimulationSteps?: number;
};

export type PatchMutationScenarioSummary = {
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
  graphValidPatchCandidates: number;
  snakeUsableCandidates: number;
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
  topCandidates: PatchMutationScenarioTopCandidate[];
};

export type PatchMutationScenarioTopCandidate = {
  candidateId: string;
  patchId: string;
  usabilityMode: string;
  pathLenToCurrentApple: number | null;
  transitionPathLength: number | null;
  currentLockedCyclePathLen: number | null;
  pathLenImprovement: number | null;
  patchMutationScore: number;
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

export type PatchMutationScenarioDiagnostics = {
  mapId: string;
  mapName: string;
  boardSize: string;
  options: {
    seedValues: number[];
    midGameFillRatios: number[];
    topCandidateCount: number;
  };
  scenarios: PatchMutationScenarioSummary[];
};

export type PatchMutationScenarioState = {
  state: GameState;
  scenarioId: string;
  kind: PatchMutationScenarioKind;
  description: string;
  seedValue: number | null;
  targetFillRatio: number | null;
  simulationSteps: number;
};

const DEFAULT_SEED_VALUES = [0, 0.23, 0.47, 0.71];
const DEFAULT_MID_GAME_FILL_RATIOS = [0.1, 0.25, 0.4];
const DEFAULT_TOP_CANDIDATE_COUNT = 5;

export function analyzePatchMutationScenarios(
  map: SavedMap,
  options: PatchMutationScenarioOptions = {}
): PatchMutationScenarioDiagnostics {
  const seedValues = options.seedValues ?? DEFAULT_SEED_VALUES;
  const midGameFillRatios = options.midGameFillRatios ?? DEFAULT_MID_GAME_FILL_RATIOS;
  const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;

  const scenarios = createPatchMutationScenarioStates(map, {
    ...options,
    seedValues,
    midGameFillRatios,
    topCandidateCount
  }).map((scenario) => analyzePatchMutationScenario(scenario, {
    ...options,
    topCandidateCount
  }));

  return {
    mapId: map.id,
    mapName: map.name,
    boardSize: `${map.width}x${map.height}`,
    options: {
      seedValues,
      midGameFillRatios,
      topCandidateCount
    },
    scenarios
  };
}

export function createPatchMutationScenarioStates(
  map: SavedMap,
  options: PatchMutationScenarioOptions = {}
): PatchMutationScenarioState[] {
  const seedValues = options.seedValues ?? DEFAULT_SEED_VALUES;
  const midGameFillRatios = options.midGameFillRatios ?? DEFAULT_MID_GAME_FILL_RATIOS;
  const scenarios: PatchMutationScenarioState[] = [];
  const initialNear = createCertifiedInitialState(map, 0);

  scenarios.push({
    state: initialNear,
    scenarioId: `${map.id}:initial-near`,
    kind: 'initial-near',
    description: 'Initial certified state with the deterministic default apple.',
    seedValue: 0,
    targetFillRatio: null,
    simulationSteps: 0
  });

  scenarios.push({
    state: withFarForwardApple(initialNear),
    scenarioId: `${map.id}:initial-far`,
    kind: 'initial-far',
    description: 'Initial certified state with the apple moved far forward on the locked cycle.',
    seedValue: null,
    targetFillRatio: null,
    simulationSteps: 0
  });

  for (const seedValue of seedValues) {
    scenarios.push({
      state: createCertifiedInitialState(map, seedValue),
      scenarioId: `${map.id}:seed-${formatSeed(seedValue)}`,
      kind: 'deterministic-seed',
      description: `Initial certified state with deterministic apple seed ${seedValue}.`,
      seedValue,
      targetFillRatio: null,
      simulationSteps: 0
    });
  }

  for (const targetFillRatio of midGameFillRatios) {
    const midGame = advanceCertifiedLockedGameToFillRatio(
      createCertifiedInitialState(map, targetFillRatio),
      targetFillRatio,
      options.maxSimulationSteps
    );
    scenarios.push({
      state: midGame.state,
      scenarioId: `${map.id}:mid-${Math.round(targetFillRatio * 100)}`,
      kind: 'mid-game',
      description: `Certified locked-cycle snapshot near ${Math.round(targetFillRatio * 100)}% fill.`,
      seedValue: targetFillRatio,
      targetFillRatio,
      simulationSteps: midGame.steps
    });
  }

  const manualBase = advanceCertifiedLockedGameToFillRatio(
    createCertifiedInitialState(map, 0.37),
    Math.min(0.25, Math.max(1 / map.graph.nodes.length, 0.12)),
    options.maxSimulationSteps
  );
  scenarios.push({
    state: withFarForwardApple(manualBase.state),
    scenarioId: `${map.id}:manual-far`,
    kind: 'manual-far',
    description: 'Manually constructed snapshot with the apple placed far forward from the current head.',
    seedValue: 0.37,
    targetFillRatio: null,
    simulationSteps: manualBase.steps
  });

  return scenarios;
}

export function analyzePatchMutationScenario(
  scenario: PatchMutationScenarioState,
  options: PatchMutationScenarioOptions = {}
): PatchMutationScenarioSummary {
  const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;
  const state = scenario.state;
  const lockedCycle = getLockedCycle(state);
  const ranking = rankPatchMutationCandidates(state, state.map.graph, lockedCycle, options);
  const bestRanked = ranking.rankedCandidates[0] ?? null;

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
    graphValidPatchCandidates: ranking.classificationDiagnostics.mutationDiagnostics.aggregate.graphValidCandidates,
    snakeUsableCandidates: ranking.classificationDiagnostics.aggregate.usableCandidates,
    improvingCandidates: ranking.aggregate.improvingCandidates,
    bestImprovement: ranking.aggregate.bestImprovement,
    bestCandidateMode: bestRanked?.features.usabilityMode ?? null,
    bestMutationRectangle: bestRanked?.candidate.rect ?? null,
    changedCycleEdges: bestRanked?.features.mutationSize.changedCycleEdges ?? null,
    topCandidates: summarizeTopCandidates(ranking, topCandidateCount)
  };
}

function summarizeTopCandidates(
  ranking: PatchMutationRankingResult,
  topCandidateCount: number
): PatchMutationScenarioTopCandidate[] {
  return ranking.rankedCandidates.slice(0, topCandidateCount).map(summarizeRankedCandidate);
}

function summarizeRankedCandidate(rankedCandidate: RankedPatchMutationCandidate): PatchMutationScenarioTopCandidate {
  return {
    candidateId: rankedCandidate.features.candidateId,
    patchId: rankedCandidate.features.patchId,
    usabilityMode: rankedCandidate.features.usabilityMode,
    pathLenToCurrentApple: rankedCandidate.features.pathLenToCurrentApple,
    transitionPathLength: rankedCandidate.features.transitionPathLength,
    currentLockedCyclePathLen: rankedCandidate.features.currentLockedCyclePathLen,
    pathLenImprovement: rankedCandidate.features.pathLenImprovement,
    patchMutationScore: rankedCandidate.features.patchMutationScore,
    changedCycleEdges: rankedCandidate.features.mutationSize.changedCycleEdges,
    rectangleArea: rankedCandidate.features.mutationSize.rectangleArea,
    rect: rankedCandidate.candidate.rect,
    reason: rankedCandidate.classification.reason
  };
}

function createCertifiedInitialState(map: SavedMap, seedValue: number): GameState {
  return createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => normalizeSeed(seedValue) });
}

function advanceCertifiedLockedGameToFillRatio(
  initialState: GameState,
  targetFillRatio: number,
  maxSimulationSteps?: number
): { state: GameState; steps: number } {
  const targetLength = Math.max(1, Math.ceil(initialState.map.graph.nodes.length * targetFillRatio));
  const maxSteps = maxSimulationSteps ?? initialState.map.graph.nodes.length * Math.max(8, targetLength * 2);
  const random = createDeterministicSequenceRandom([0.13, 0.37, 0.61, 0.83, 0.19, 0.43]);
  let current = initialState;

  for (let steps = 0; steps < maxSteps && !current.isOver; steps += 1) {
    if (current.snake.segments.length >= targetLength) {
      return { state: current, steps };
    }

    const decision = decideAiMove(current, 'certified-hamiltonian');
    if (!decision) {
      return { state: current, steps };
    }

    current = advanceGame(current, decision.direction, 0, random);
  }

  return { state: current, steps: maxSteps };
}

function createDeterministicSequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const value = values[index % values.length] ?? 0;
      index += 1;
      return normalizeSeed(value);
    }
  };
}

function withFarForwardApple(state: GameState): GameState {
  const lockedCycle = getLockedCycle(state);
  const farApple = findFarForwardFreeNode(state, lockedCycle);

  return {
    ...state,
    lockedHamiltonianCycle: state.lockedHamiltonianCycle ? [...state.lockedHamiltonianCycle] : null,
    snake: {
      ...state.snake,
      segments: [...state.snake.segments]
    },
    appleNodeId: farApple ?? state.appleNodeId
  };
}

function findFarForwardFreeNode(state: GameState, cycle: HamiltonianCycle): NodeId | null {
  const head = state.snake.segments[0];
  if (!head || cycle.length === 0) {
    return null;
  }

  const headIndex = cycle.indexOf(head);
  if (headIndex === -1) {
    return null;
  }

  const occupied = new Set(state.snake.segments);
  const preferredOffset = Math.floor(cycle.length / 2);
  const offsets = [
    ...Array.from({ length: cycle.length - preferredOffset }, (_, index) => preferredOffset + index),
    ...Array.from({ length: Math.max(0, preferredOffset - 1) }, (_, index) => preferredOffset - index - 1)
  ];

  for (const offset of offsets) {
    if (offset <= 0) {
      continue;
    }
    const candidate = cycle[(headIndex + offset) % cycle.length];
    if (candidate && !occupied.has(candidate)) {
      return candidate;
    }
  }

  return null;
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

function normalizeSeed(seedValue: number): number {
  if (!Number.isFinite(seedValue)) {
    return 0;
  }
  return Math.min(0.999999, Math.max(0, seedValue));
}

function formatSeed(seedValue: number): string {
  return String(seedValue).replace('.', '_');
}
