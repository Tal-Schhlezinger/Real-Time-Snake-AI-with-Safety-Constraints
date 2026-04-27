import { decideAiMove } from './ai-controller.js';
import type { RandomSource } from './apple-spawner.js';
import { CertifiedHamiltonianInvariantError } from './certified-hamiltonian-error.js';
import {
  applyCertifiedPostAppleTransition,
  createCertifiedRuntimeSwitchingDiagnostics,
  type CertifiedCycleSelectionOptions,
  type CertifiedRuntimeSwitchingDiagnostics,
  type CertifiedSelectedCandidateSource
} from './certified-cycle-controller.js';
import { generateDiverseHamiltonianCycles, type CycleLibrary } from './cycle-library.js';
import { advanceGame } from './game-engine.js';
import { createInitialGameState } from './game-state.js';
import { PatchMutationCandidateCache } from './patch-mutation-candidate-cache.js';
import type { GameState, SavedMap } from './types.js';

export type CertifiedEvaluationVariantName =
  | 'certified-baseline'
  | 'certified-cycle-library'
  | 'certified-library-patch-mutation'
  | 'certified-library-v1-v2-patch-mutation';

export interface CertifiedPatchMutationEvaluationOptions {
  maxSteps?: number;
  seed?: number;
  initialAppleSeed?: number;
  cycleLibraryOptions?: Parameters<typeof generateDiverseHamiltonianCycles>[1];
  patchOptions?: CertifiedCycleSelectionOptions;
}

export interface CertifiedVariantEvaluationResult {
  variant: CertifiedEvaluationVariantName;
  applesEaten: number;
  totalSteps: number;
  averageStepsPerApple: number | null;
  maxStepsBetweenApples: number | null;
  deaths: number;
  invariantFailures: number;
  invariantFailureMessage: string | null;
  outcome: GameState['outcome'];
  stoppedReason: 'max-steps' | 'game-over' | 'invariant-failure';
  successfulLibrarySwitches: number;
  successfulTransitionPlans: number;
  patchMutationAttempts: number;
  patchGraphValidCandidates: number;
  patchSnakeUsableCandidates: number;
  patchImmediateLockedCandidates: number;
  patchTransitionReachableCandidates: number;
  patchRejectedByLockedCertificate: number;
  patchSelectedCandidates: number;
  immediateLockedPatchSelections: number;
  transitionBackedPatchSelections: number;
  averageBestPatchImprovement: number | null;
  v2PatchAttempts: number;
  v2GraphValidCandidates: number;
  v2SnakeUsableCandidates: number;
  v2ImmediateLockedCandidates: number;
  v2TransitionReachableCandidates: number;
  v2RejectedByLockedCertificate: number;
  v2SelectedCandidates: number;
  v2ImmediateLockedSelections: number;
  v2TransitionSelections: number;
  averageBestV2Improvement: number | null;
  profile: {
    v1GenerationMs: number;
    v1CertificationMs: number;
    v1TransitionSearchMs: number;
    v1ScoringMs: number;
    v2DetectionMs: number;
    v2PathCoverSolvingMs: number;
    v2SplicingValidationMs: number;
    v2GenerationMs: number;
    v2CertificationMs: number;
    v2TransitionSearchMs: number;
    v2ScoringMs: number;
  };
  selectedCandidateSourceCounts: Record<CertifiedSelectedCandidateSource, number>;
  diagnostics: CertifiedRuntimeSwitchingDiagnostics;
}

export interface CertifiedMapEvaluationReport {
  mapId: string;
  mapName: string;
  boardSize: string;
  note: string | null;
  variants: CertifiedVariantEvaluationResult[];
}

const DEFAULT_MAX_STEPS = 1_000;
const DEFAULT_PATCH_OPTIONS: CertifiedCycleSelectionOptions = {
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
  maxV2SolverExpansions: 100_000
};

export function evaluateCertifiedPatchMutationOnMaps(
  maps: SavedMap[],
  options: CertifiedPatchMutationEvaluationOptions = {}
): CertifiedMapEvaluationReport[] {
  return maps.map((map) => evaluateCertifiedPatchMutationOnMap(map, options));
}

export function evaluateCertifiedPatchMutationOnMap(
  map: SavedMap,
  options: CertifiedPatchMutationEvaluationOptions = {}
): CertifiedMapEvaluationReport {
  const variants: CertifiedEvaluationVariantName[] = [
    'certified-cycle-library',
    'certified-library-patch-mutation',
    'certified-library-v1-v2-patch-mutation'
  ];

  return {
    mapId: map.id,
    mapName: map.name,
    boardSize: `${map.width}x${map.height}`,
    note: map.width === 12 && map.height === 8
      ? 'Rectangle patch mutation V1 is expected to have low/no candidates on the default 12x8 map under current limits.'
      : null,
    variants: variants.map((variant) => evaluateCertifiedVariant(map, variant, options))
  };
}

export function evaluateCertifiedVariant(
  map: SavedMap,
  variant: CertifiedEvaluationVariantName,
  options: CertifiedPatchMutationEvaluationOptions = {}
): CertifiedVariantEvaluationResult {
  const workingMap = clone(map);
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
  const random = createSeededRandom(options.seed ?? 1);
  let state = createInitialGameState(
    workingMap,
    'ai',
    'certified-hamiltonian',
    { next: () => normalizeRandom(options.initialAppleSeed ?? random.next()) }
  );
  const cycleLibrary = variant === 'certified-baseline'
    ? null
    : generateDiverseHamiltonianCycles(workingMap, options.cycleLibraryOptions);
  const patchMutationCandidateCache = options.patchOptions?.patchMutationCandidateCache ?? new PatchMutationCandidateCache();
  const selectionOptions: CertifiedCycleSelectionOptions = variant === 'certified-library-patch-mutation'
    ? {
        ...DEFAULT_PATCH_OPTIONS,
        ...options.patchOptions,
        enablePatchMutation: options.patchOptions?.enablePatchMutation ?? true,
        enableV2PatchMutation: false,
        patchMutationCandidateCache
      }
    : variant === 'certified-library-v1-v2-patch-mutation'
      ? {
        ...DEFAULT_PATCH_OPTIONS,
        ...DEFAULT_V2_PATCH_OPTIONS,
        ...options.patchOptions,
        enablePatchMutation: options.patchOptions?.enablePatchMutation ?? true,
        enableV2PatchMutation: options.patchOptions?.enableV2PatchMutation ?? true,
        patchMutationCandidateCache
      }
    : { enablePatchMutation: false, patchMutationCandidateCache };
  const stepsBetweenApples: number[] = [];
  let stepsSinceApple = 0;
  let invariantFailureMessage: string | null = null;
  let stoppedReason: CertifiedVariantEvaluationResult['stoppedReason'] = 'max-steps';
  let successfulTransitionPlans = 0;

  for (let step = 0; step < maxSteps && !state.isOver; step += 1) {
    const previousState = state;
    try {
      const decision = decideAiMove(previousState, 'certified-hamiltonian');
      if (!decision) {
        stoppedReason = 'invariant-failure';
        invariantFailureMessage = 'Certified Hamiltonian AI returned no decision.';
        break;
      }

      const advancedState = advanceGame(previousState, decision.direction, 0, random);
      stepsSinceApple += 1;
      state = applyCertifiedPostAppleTransition({
        previousState,
        nextState: advancedState,
        cycleLibrary,
        options: selectionOptions,
        diagnostics
      });

      if (state.applesEaten > previousState.applesEaten) {
        stepsBetweenApples.push(stepsSinceApple);
        stepsSinceApple = 0;
        if (previousState.certifiedMode === 'transition') {
          successfulTransitionPlans += 1;
        }
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
  const averageBestPatchImprovement = average(
    diagnostics.switchAttemptSummaries
      .map((summary) => summary.bestPatchImprovement)
      .filter((value): value is number => value !== null)
  );
  const averageBestV2Improvement = average(
    diagnostics.switchAttemptSummaries
      .map((summary) => summary.bestV2Improvement)
      .filter((value): value is number => value !== null)
  );
  const immediatePatchSelections = countPatchSelectionsByTransitionUsage(diagnostics, false);
  const transitionBackedPatchSelections = countPatchSelectionsByTransitionUsage(diagnostics, true);

  return {
    variant,
    applesEaten: state.applesEaten,
    totalSteps: stepsBetweenApples.reduce((sum, value) => sum + value, 0) + stepsSinceApple,
    averageStepsPerApple: stepsBetweenApples.length > 0 ? average(stepsBetweenApples) : null,
    maxStepsBetweenApples: stepsBetweenApples.length > 0 ? Math.max(...stepsBetweenApples) : null,
    deaths: state.isOver && state.outcome === 'lose' ? 1 : 0,
    invariantFailures: stoppedReason === 'invariant-failure' ? 1 : 0,
    invariantFailureMessage,
    outcome: state.outcome,
    stoppedReason,
    successfulLibrarySwitches: sourceCounts.library,
    successfulTransitionPlans,
    patchMutationAttempts: diagnostics.patchMutationAttempted,
    patchGraphValidCandidates: diagnostics.patchGraphValidCandidates,
    patchSnakeUsableCandidates: diagnostics.patchSnakeUsableCandidates,
    patchImmediateLockedCandidates: diagnostics.patchImmediateLockedCandidates,
    patchTransitionReachableCandidates: diagnostics.patchTransitionReachableCandidates,
    patchRejectedByLockedCertificate: diagnostics.patchRejectedByLockedCertificate,
    patchSelectedCandidates: diagnostics.patchSelectedCandidates,
    immediateLockedPatchSelections: immediatePatchSelections,
    transitionBackedPatchSelections,
    averageBestPatchImprovement,
    v2PatchAttempts: diagnostics.v2PatchAttempted,
    v2GraphValidCandidates: diagnostics.v2GraphValidCandidates,
    v2SnakeUsableCandidates: diagnostics.v2SnakeUsableCandidates,
    v2ImmediateLockedCandidates: diagnostics.v2ImmediateLockedCandidates,
    v2TransitionReachableCandidates: diagnostics.v2TransitionReachableCandidates,
    v2RejectedByLockedCertificate: diagnostics.v2RejectedByLockedCertificate,
    v2SelectedCandidates: diagnostics.v2SelectedCandidates,
    v2ImmediateLockedSelections: diagnostics.v2ImmediateLockedSelections,
    v2TransitionSelections: diagnostics.v2TransitionSelections,
    averageBestV2Improvement,
    profile: {
      v1GenerationMs: diagnostics.v1GenerationMs,
      v1CertificationMs: diagnostics.v1CertificationMs,
      v1TransitionSearchMs: diagnostics.v1TransitionSearchMs,
      v1ScoringMs: diagnostics.v1ScoringMs,
      v2DetectionMs: diagnostics.v2DetectionMs,
      v2PathCoverSolvingMs: diagnostics.v2PathCoverSolvingMs,
      v2SplicingValidationMs: diagnostics.v2SplicingValidationMs,
      v2GenerationMs: diagnostics.v2GenerationMs,
      v2CertificationMs: diagnostics.v2CertificationMs,
      v2TransitionSearchMs: diagnostics.v2TransitionSearchMs,
      v2ScoringMs: diagnostics.v2ScoringMs
    },
    selectedCandidateSourceCounts: sourceCounts,
    diagnostics
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

function countPatchSelectionsByTransitionUsage(
  diagnostics: CertifiedRuntimeSwitchingDiagnostics,
  usesTransitionPlan: boolean
): number {
  return diagnostics.switchAttemptSummaries.filter((summary) =>
    (summary.selectedCandidateSource === 'v1-patch' || summary.selectedCandidateSource === 'v2-patch') &&
    summary.selectedCandidateUsedTransitionPlan === usesTransitionPlan
  ).length;
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
