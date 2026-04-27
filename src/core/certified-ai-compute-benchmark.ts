import { decideAiMove } from './ai-controller.js';
import type { RandomSource } from './apple-spawner.js';
import {
  applyCertifiedPostAppleTransition,
  createCertifiedRuntimeSwitchingDiagnostics,
  type CertifiedCycleSelectionOptions,
  type CertifiedRuntimeSwitchingDiagnostics,
  type CertifiedSelectedCandidateSource
} from './certified-cycle-controller.js';
import { generateDiverseHamiltonianCycles } from './cycle-library.js';
import { advanceGame } from './game-engine.js';
import { createInitialGameState } from './game-state.js';
import { PatchMutationCandidateCache } from './patch-mutation-candidate-cache.js';
import type { Direction, GameState, SavedMap } from './types.js';

export type CertifiedAiComputeBenchmarkVariant = 'library-only' | 'v1' | 'v1-v2';
export type CertifiedAiComputeBenchmarkCacheMode = 'off' | 'on';

export interface CertifiedAiComputeBenchmarkOptions {
  variant?: CertifiedAiComputeBenchmarkVariant;
  cacheMode?: CertifiedAiComputeBenchmarkCacheMode;
  maxSteps?: number;
  seed?: number;
  initialAppleSeed?: number;
  cycleLibraryOptions?: Parameters<typeof generateDiverseHamiltonianCycles>[1];
  patchOptions?: CertifiedCycleSelectionOptions;
  includeTrace?: boolean;
}

export interface CertifiedAiComputeBenchmarkMethodology {
  headless: true;
  synchronous: true;
  intentionalDelayMs: 0;
  rendering: false;
  timers: false;
  hotLoopLogging: false;
  timer: 'performance.now';
}

export interface CertifiedAiComputeQualityMetrics {
  totalSteps: number;
  applesEaten: number;
  averageStepsPerApple: number | null;
  maxStepsBetweenApples: number | null;
  deaths: number;
  invariantFailures: number;
  invariantFailureMessage: string | null;
  outcome: GameState['outcome'];
  stoppedReason: 'max-steps' | 'game-over' | 'invariant-failure';
}

export interface CertifiedAiComputeTimingMetrics {
  evaluationRuntimeMs: number;
  setupMs: number;
  totalAiDecisionMs: number;
  totalLockedMoveDecisionMs: number;
  totalTransitionMoveDecisionMs: number;
  totalPostApplePlanningMs: number;
  totalNonApplePostStepMs: number;
  totalGameStepMs: number;
  avgAiDecisionMsPerTick: number;
  avgPostApplePlanningMsPerAppleEvent: number | null;
  maxSingleDecisionMs: number;
  maxSinglePlanningMs: number;
  p95DecisionMs: number;
  p95PlanningMs: number | null;
  v1GenerationMs: number;
  v2GenerationMs: number;
  transitionSearchMs: number;
  certificationMs: number;
  scoringMs: number;
  v1CertificationMs: number;
  v1TransitionSearchMs: number;
  v1ScoringMs: number;
  v2CertificationMs: number;
  v2TransitionSearchMs: number;
  v2ScoringMs: number;
}

export interface CertifiedAiComputeCandidateMetrics {
  successfulLibrarySwitches: number;
  successfulTransitionPlans: number;
  patchMutationAttempts: number;
  patchGraphValidCandidates: number;
  patchSnakeUsableCandidates: number;
  patchSelectedCandidates: number;
  v2PatchAttempts: number;
  v2GraphValidCandidates: number;
  v2SnakeUsableCandidates: number;
  v2SelectedCandidates: number;
  v1CandidateCacheHits: number;
  v1CandidateCacheMisses: number;
  v2CandidateCacheHits: number;
  v2CandidateCacheMisses: number;
  cachedV1GraphCandidates: number;
  cachedV2GraphCandidates: number;
  selectedCandidateSourceCounts: Record<CertifiedSelectedCandidateSource, number>;
}

export interface CertifiedAiComputeBenchmarkTrace {
  directions: Direction[];
  selectedSources: CertifiedSelectedCandidateSource[];
}

export interface CertifiedAiComputeBenchmarkResult {
  mapId: string;
  mapName: string;
  boardSize: string;
  variant: CertifiedAiComputeBenchmarkVariant;
  cacheMode: CertifiedAiComputeBenchmarkCacheMode;
  methodology: CertifiedAiComputeBenchmarkMethodology;
  quality: CertifiedAiComputeQualityMetrics;
  timing: CertifiedAiComputeTimingMetrics;
  candidates: CertifiedAiComputeCandidateMetrics;
  diagnostics: CertifiedRuntimeSwitchingDiagnostics;
  trace?: CertifiedAiComputeBenchmarkTrace;
}

const DEFAULT_MAX_STEPS = 1_000;

const DEFAULT_CYCLE_LIBRARY_OPTIONS = {
  maxCycles: 10,
  maxAttempts: 64,
  minDiversity: 0.2
};

const DEFAULT_V1_PATCH_OPTIONS: CertifiedCycleSelectionOptions = {
  enablePatchMutation: true,
  maxPatchWidth: 6,
  maxPatchHeight: 6,
  maxPatchArea: 20,
  maxTransitionPathsPerCandidate: 64,
  maxTransitionSlack: 6,
  enableV2PatchMutation: false
};

const DEFAULT_V2_PATCH_OPTIONS: CertifiedCycleSelectionOptions = {
  enableV2PatchMutation: true,
  maxV2FillRatio: 0.15,
  maxV2RectsScanned: 500,
  maxV2Candidates: 300,
  maxV2PatchArea: 24,
  maxV2TransitionPathsPerCandidate: 8,
  maxV2TransitionSlack: 2,
  maxV2TransitionPathLength: 16,
  maxV2TransitionSearchStates: 10_000,
  maxV2SolverExpansions: 100_000,
  maxV2PathCoversPerPatch: 64
};

export function runCertifiedAiComputeBenchmark(
  map: SavedMap,
  options: CertifiedAiComputeBenchmarkOptions = {}
): CertifiedAiComputeBenchmarkResult {
  const benchmarkStartedAt = nowMs();
  const setupStartedAt = nowMs();
  const workingMap = clone(map);
  const variant = options.variant ?? 'library-only';
  const cacheMode = options.cacheMode ?? 'off';
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
  const random = createSeededRandom(options.seed ?? 1);
  let state = createInitialGameState(
    workingMap,
    'ai',
    'certified-hamiltonian',
    { next: () => normalizeRandom(options.initialAppleSeed ?? random.next()) }
  );
  const cycleLibrary = generateDiverseHamiltonianCycles(
    workingMap,
    options.cycleLibraryOptions ?? DEFAULT_CYCLE_LIBRARY_OPTIONS
  );
  const selectionOptions = buildSelectionOptions(variant, cacheMode, options.patchOptions);
  const setupMs = nowMs() - setupStartedAt;

  const decisionDurations: number[] = [];
  const planningDurations: number[] = [];
  const directions: Direction[] = [];
  const stepsBetweenApples: number[] = [];
  let totalLockedMoveDecisionMs = 0;
  let totalTransitionMoveDecisionMs = 0;
  let totalPostApplePlanningMs = 0;
  let totalNonApplePostStepMs = 0;
  let totalGameStepMs = 0;
  let stepsSinceApple = 0;
  let successfulTransitionPlans = 0;
  let invariantFailureMessage: string | null = null;
  let stoppedReason: CertifiedAiComputeQualityMetrics['stoppedReason'] = 'max-steps';

  for (let step = 0; step < maxSteps && !state.isOver; step += 1) {
    const previousState = state;
    try {
      const decisionStartedAt = nowMs();
      const decision = decideAiMove(previousState, 'certified-hamiltonian');
      const decisionMs = nowMs() - decisionStartedAt;
      decisionDurations.push(decisionMs);
      if (previousState.certifiedMode === 'transition') {
        totalTransitionMoveDecisionMs += decisionMs;
      } else {
        totalLockedMoveDecisionMs += decisionMs;
      }

      if (!decision) {
        stoppedReason = 'invariant-failure';
        invariantFailureMessage = 'Certified Hamiltonian AI returned no decision.';
        break;
      }

      directions.push(decision.direction);
      const gameStepStartedAt = nowMs();
      const advancedState = advanceGame(previousState, decision.direction, 0, random);
      totalGameStepMs += nowMs() - gameStepStartedAt;
      stepsSinceApple += 1;

      const appleWasEaten = advancedState.applesEaten > previousState.applesEaten;
      const postStepStartedAt = nowMs();
      state = applyCertifiedPostAppleTransition({
        previousState,
        nextState: advancedState,
        cycleLibrary,
        options: selectionOptions,
        diagnostics
      });
      const postStepMs = nowMs() - postStepStartedAt;
      if (appleWasEaten) {
        totalPostApplePlanningMs += postStepMs;
        planningDurations.push(postStepMs);
        stepsBetweenApples.push(stepsSinceApple);
        stepsSinceApple = 0;
        if (previousState.certifiedMode === 'transition') {
          successfulTransitionPlans += 1;
        }
      } else {
        totalNonApplePostStepMs += postStepMs;
      }
    } catch (error) {
      stoppedReason = 'invariant-failure';
      invariantFailureMessage = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  if (state.isOver) {
    stoppedReason = 'game-over';
  }

  const sourceCounts = countSelectedCandidateSources(diagnostics);
  const evaluationRuntimeMs = nowMs() - benchmarkStartedAt;
  const totalAiDecisionMs = decisionDurations.reduce((sum, value) => sum + value, 0);

  return {
    mapId: map.id,
    mapName: map.name,
    boardSize: `${map.width}x${map.height}`,
    variant,
    cacheMode,
    methodology: {
      headless: true,
      synchronous: true,
      intentionalDelayMs: 0,
      rendering: false,
      timers: false,
      hotLoopLogging: false,
      timer: 'performance.now'
    },
    quality: {
      totalSteps: stepsBetweenApples.reduce((sum, value) => sum + value, 0) + stepsSinceApple,
      applesEaten: state.applesEaten,
      averageStepsPerApple: stepsBetweenApples.length > 0 ? average(stepsBetweenApples) : null,
      maxStepsBetweenApples: stepsBetweenApples.length > 0 ? Math.max(...stepsBetweenApples) : null,
      deaths: state.isOver && state.outcome === 'lose' ? 1 : 0,
      invariantFailures: stoppedReason === 'invariant-failure' ? 1 : 0,
      invariantFailureMessage,
      outcome: state.outcome,
      stoppedReason
    },
    timing: {
      evaluationRuntimeMs,
      setupMs,
      totalAiDecisionMs,
      totalLockedMoveDecisionMs,
      totalTransitionMoveDecisionMs,
      totalPostApplePlanningMs,
      totalNonApplePostStepMs,
      totalGameStepMs,
      avgAiDecisionMsPerTick: decisionDurations.length > 0 ? totalAiDecisionMs / decisionDurations.length : 0,
      avgPostApplePlanningMsPerAppleEvent: planningDurations.length > 0
        ? totalPostApplePlanningMs / planningDurations.length
        : null,
      maxSingleDecisionMs: decisionDurations.length > 0 ? Math.max(...decisionDurations) : 0,
      maxSinglePlanningMs: planningDurations.length > 0 ? Math.max(...planningDurations) : 0,
      p95DecisionMs: percentile(decisionDurations, 0.95) ?? 0,
      p95PlanningMs: percentile(planningDurations, 0.95),
      v1GenerationMs: diagnostics.v1GenerationMs,
      v2GenerationMs: diagnostics.v2GenerationMs,
      transitionSearchMs: diagnostics.v1TransitionSearchMs + diagnostics.v2TransitionSearchMs,
      certificationMs: diagnostics.v1CertificationMs + diagnostics.v2CertificationMs,
      scoringMs: diagnostics.v1ScoringMs + diagnostics.v2ScoringMs,
      v1CertificationMs: diagnostics.v1CertificationMs,
      v1TransitionSearchMs: diagnostics.v1TransitionSearchMs,
      v1ScoringMs: diagnostics.v1ScoringMs,
      v2CertificationMs: diagnostics.v2CertificationMs,
      v2TransitionSearchMs: diagnostics.v2TransitionSearchMs,
      v2ScoringMs: diagnostics.v2ScoringMs
    },
    candidates: {
      successfulLibrarySwitches: sourceCounts.library,
      successfulTransitionPlans,
      patchMutationAttempts: diagnostics.patchMutationAttempted,
      patchGraphValidCandidates: diagnostics.patchGraphValidCandidates,
      patchSnakeUsableCandidates: diagnostics.patchSnakeUsableCandidates,
      patchSelectedCandidates: diagnostics.patchSelectedCandidates,
      v2PatchAttempts: diagnostics.v2PatchAttempted,
      v2GraphValidCandidates: diagnostics.v2GraphValidCandidates,
      v2SnakeUsableCandidates: diagnostics.v2SnakeUsableCandidates,
      v2SelectedCandidates: diagnostics.v2SelectedCandidates,
      v1CandidateCacheHits: diagnostics.v1CandidateCacheHits,
      v1CandidateCacheMisses: diagnostics.v1CandidateCacheMisses,
      v2CandidateCacheHits: diagnostics.v2CandidateCacheHits,
      v2CandidateCacheMisses: diagnostics.v2CandidateCacheMisses,
      cachedV1GraphCandidates: diagnostics.cachedV1GraphCandidates,
      cachedV2GraphCandidates: diagnostics.cachedV2GraphCandidates,
      selectedCandidateSourceCounts: sourceCounts
    },
    diagnostics,
    trace: options.includeTrace
      ? {
        directions,
        selectedSources: diagnostics.switchAttemptSummaries.map((summary) => summary.selectedCandidateSource)
      }
      : undefined
  };
}

function buildSelectionOptions(
  variant: CertifiedAiComputeBenchmarkVariant,
  cacheMode: CertifiedAiComputeBenchmarkCacheMode,
  patchOptions: CertifiedCycleSelectionOptions = {}
): CertifiedCycleSelectionOptions {
  const patchMutationCandidateCache = patchOptions.patchMutationCandidateCache ?? new PatchMutationCandidateCache();
  if (variant === 'library-only') {
    return {
      ...patchOptions,
      enablePatchMutation: false,
      enableV2PatchMutation: false,
      enablePatchMutationCandidateCache: cacheMode === 'on',
      patchMutationCandidateCache
    };
  }

  if (variant === 'v1') {
    return {
      ...DEFAULT_V1_PATCH_OPTIONS,
      ...patchOptions,
      enablePatchMutation: patchOptions.enablePatchMutation ?? true,
      enableV2PatchMutation: false,
      enablePatchMutationCandidateCache: cacheMode === 'on',
      patchMutationCandidateCache
    };
  }

  return {
    ...DEFAULT_V1_PATCH_OPTIONS,
    ...DEFAULT_V2_PATCH_OPTIONS,
    ...patchOptions,
    enablePatchMutation: patchOptions.enablePatchMutation ?? true,
    enableV2PatchMutation: patchOptions.enableV2PatchMutation ?? true,
    enablePatchMutationCandidateCache: cacheMode === 'on',
    patchMutationCandidateCache
  };
}

function countSelectedCandidateSources(
  diagnostics: CertifiedRuntimeSwitchingDiagnostics
): Record<CertifiedSelectedCandidateSource, number> {
  const counts: Record<CertifiedSelectedCandidateSource, number> = {
    'current-cycle': 0,
    library: 0,
    transition: 0,
    'v1-patch': 0,
    'v2-patch': 0
  };

  for (const summary of diagnostics.switchAttemptSummaries) {
    counts[summary.selectedCandidateSource] += 1;
  }

  return counts;
}

function createSeededRandom(seed: number): RandomSource {
  let state = Math.max(1, Math.floor(seed)) % 2_147_483_647;
  return {
    next(): number {
      state = (state * 48_271) % 2_147_483_647;
      return state / 2_147_483_647;
    }
  };
}

function normalizeRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(0.999999, Math.max(0, value));
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

function nowMs(): number {
  return performance.now();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
