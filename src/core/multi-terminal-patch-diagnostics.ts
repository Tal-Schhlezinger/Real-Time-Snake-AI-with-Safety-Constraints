import type { Direction, GameState, GraphSnapshot, HamiltonianCycle, NodeId } from './types.js';
import { validateHamiltonianCycle } from './map-validator.js';
import { analyzeCertifiedTransitionTargets, type CertifiedTransitionDiagnosticsOptions } from './certified-transition-diagnostics.js';
import { computeCycleFeatures, scoreCycleFeatures, type CycleFeatures } from './cycle-scoring.js';
import { appleForward, distanceForwardOnCycle, validLockedCertificate } from './hamiltonian-certificate.js';
import {
  enumerateRectangles,
  extractInsideCycleEdges,
  getCycleCutCrossings,
  type CycleCutCrossing,
  type InsideCycleEdge,
  type RectanglePatchDetectionOptions,
  type RectanglePatchRect
} from './two-terminal-patch-mutation.js';

export type MultiTerminalPatchExitClass = 'two' | 'four' | 'six' | 'eight' | 'other';

export type MultiTerminalPatchRejectionReason =
  | 'rectangle-not-full'
  | 'unsupported-exit-count'
  | 'two-exit-owned-by-v1'
  | 'eight-exit-count-only'
  | 'six-exit-count-only'
  | 'repeated-terminal'
  | 'terminal-count-mismatch'
  | 'invalid-cycle-degree-accounting'
  | 'invalid-terminal-internal-degree'
  | 'invalid-nonterminal-internal-degree'
  | 'component-count-not-two'
  | 'component-not-simple-path'
  | 'component-terminal-count-not-two'
  | 'internal-components-miss-vertices'
  | 'valid-four-exit-decomposition';

export type MultiTerminalPatchReasonCount = {
  reason: MultiTerminalPatchRejectionReason;
  count: number;
};

export type FourExitTerminalPair = {
  terminalA: NodeId;
  terminalB: NodeId;
  originalPath: NodeId[];
};

export type FourExitPatchDecomposition = {
  terminalPairs: FourExitTerminalPair[];
  internalEdges: InsideCycleEdge[];
  componentCount: number;
  coversAllPatchVertices: boolean;
  internalDegreeByNode: Record<NodeId, number>;
  cutDegreeByNode: Record<NodeId, number>;
};

export type MultiTerminalPatchRectDiagnostics = {
  rect: RectanglePatchRect;
  vertexCount: number;
  fullRectangle: boolean;
  crossingCount: number;
  terminals: NodeId[];
  repeatedTerminalCount: number;
  exitClass: MultiTerminalPatchExitClass;
  fourExitDecomposition: FourExitPatchDecomposition | null;
  rejectionReason: MultiTerminalPatchRejectionReason;
};

export type MultiTerminalPatchAggregateDiagnostics = {
  rectanglesScanned: number;
  fullRectangles: number;
  twoExitRectangles: number;
  fourExitRectangles: number;
  sixExitRectangles: number;
  eightExitRectangles: number;
  otherExitRectangles: number;
  repeatedTerminalRectangles: number;
  fourExitDecompositionAttempts: number;
  validFourExitDecompositions: number;
  invalidDegreeAccounting: number;
  invalidTerminalDegree: number;
  invalidNonterminalDegree: number;
  invalidComponentCount: number;
  invalidComponentPath: number;
  componentsMissingVertices: number;
  sixExitPlausibleDegreePattern: number;
  eightExitCountOnly: number;
  topRejectionReasons: MultiTerminalPatchReasonCount[];
};

export type MultiTerminalPatchScanDiagnostics = {
  aggregate: MultiTerminalPatchAggregateDiagnostics;
  patches: MultiTerminalPatchRectDiagnostics[];
};

export type SamePairingPathCover = {
  paths: [NodeId[], NodeId[]];
};

export type SamePairing4ExitPathCoverOptions = RectanglePatchDetectionOptions & {
  maxPatchArea4Exit?: number;
  maxCoversPerPatch?: number;
  maxSolverExpansionsPerPatch?: number;
};

export type SamePairing4ExitPathCoverRejectionReason =
  | 'not-valid-four-exit-decomposition'
  | 'patch-area-too-large'
  | 'budget-exhausted'
  | 'no-alternative-cover'
  | 'valid-alternative-cover';

export type SamePairing4ExitPathCoverDiagnostics = {
  rect: RectanglePatchRect;
  terminalPairs: FourExitTerminalPair[];
  attempted: boolean;
  solverExpansions: number;
  budgetExhausted: boolean;
  coversFound: number;
  noOpCoversSkipped: number;
  duplicateCoversSkipped: number;
  rejectionReason: SamePairing4ExitPathCoverRejectionReason;
  covers: SamePairingPathCover[];
};

export type SamePairing4ExitPathCoverReasonCount = {
  reason: SamePairing4ExitPathCoverRejectionReason;
  count: number;
};

export type SamePairing4ExitPathCoverAggregateDiagnostics = {
  validFourExitDecompositions: number;
  patchesAttempted: number;
  pathCoversFound: number;
  patchesWithAlternativeCovers: number;
  budgetExhaustedPatches: number;
  noOpCoversSkipped: number;
  duplicateCoversSkipped: number;
  topFailureReasons: SamePairing4ExitPathCoverReasonCount[];
};

export type SamePairing4ExitPathCoverScanDiagnostics = {
  patchScan: MultiTerminalPatchScanDiagnostics;
  aggregate: SamePairing4ExitPathCoverAggregateDiagnostics;
  patches: SamePairing4ExitPathCoverDiagnostics[];
  profile: {
    detectionMs: number;
    pathCoverSolvingMs: number;
  };
};

export type UndirectedCycleEdge = {
  a: NodeId;
  b: NodeId;
};

export type V2FourExitSpliceCandidateRejectionReason =
  | 'invalid-path-cover'
  | 'degree-invalid'
  | 'subtour'
  | 'node-set-mismatch'
  | 'duplicate-candidate'
  | 'graph-invalid'
  | 'graph-valid';

export type V2FourExitSpliceCandidateDiagnostics = {
  rect: RectanglePatchRect;
  terminalPairs: FourExitTerminalPair[];
  coverSignature: string;
  edgeSetDegreeValid: boolean;
  reconstructedSingleCycle: boolean;
  nodeSetMatchesOldCycle: boolean;
  graphValid: boolean;
  duplicateCandidate: boolean;
  rejectionReason: V2FourExitSpliceCandidateRejectionReason;
};

export type V2FourExitSpliceCandidate = {
  cycle: HamiltonianCycle;
  rect: RectanglePatchRect;
  terminalPairs: FourExitTerminalPair[];
  coverSignature: string;
};

export type V2FourExitSpliceCandidateReasonCount = {
  reason: V2FourExitSpliceCandidateRejectionReason;
  count: number;
};

export type V2FourExitSpliceAggregateDiagnostics = {
  validFourExitDecompositions: number;
  alternativeCoversConsidered: number;
  rawCandidatesGenerated: number;
  degreeInvalidCandidates: number;
  subtourCandidates: number;
  nodeSetMismatchCandidates: number;
  graphValidCandidates: number;
  graphInvalidCandidates: number;
  duplicateCandidatesSkipped: number;
  topRejectionReasons: V2FourExitSpliceCandidateReasonCount[];
};

export type V2FourExitSpliceGenerationResult = {
  pathCoverDiagnostics: SamePairing4ExitPathCoverScanDiagnostics;
  aggregate: V2FourExitSpliceAggregateDiagnostics;
  candidateDiagnostics: V2FourExitSpliceCandidateDiagnostics[];
  candidates: V2FourExitSpliceCandidate[];
  profile: {
    detectionMs: number;
    pathCoverSolvingMs: number;
    splicingValidationMs: number;
    totalMs: number;
  };
};

export type V2FourExitSnakeUsabilityMode = 'immediate-locked' | 'transition-valid' | 'unusable';

export type V2FourExitSnakeClassificationReason =
  | 'graph-invalid'
  | 'immediate-locked'
  | 'immediate-locked-apple-forward-failed'
  | 'transition-valid'
  | 'locked-invalid-transition-not-found'
  | 'no-current-apple-for-transition'
  | 'no-certified-use';

export type V2FourExitSnakeTransitionSummary = {
  targetCycleId: string;
  pathsGenerated: number;
  pathsSimulated: number;
  safePathsToApple: number;
  successfulTransitionPaths: number;
  bestSuccessfulPathLength: number | null;
  bestSuccessfulPath: Direction[] | null;
  failureReasons: {
    noPathGenerated: number;
    collisionBeforeApple: number;
    appleNotReached: number;
    postAppleLockedCertificateFailed: number;
    simulationEndedBeforeApple: number;
    budgetExceeded: number;
  };
  lockedCertificateFailures: string[];
};

export type V2TransitionPrefilterMode =
  | 'none'
  | 'cheap-score'
  | 'body-order-compatibility'
  | 'combined';

export type V2FourExitCheapTransitionFeatures = {
  source: 'v2';
  candidatePathLenIfLocked: number | null;
  pathLenImprovementEstimate: number | null;
  changedCycleEdges: number;
  rectangleArea: number;
  arcRelevance: number | null;
  bodyOrderCompatibilityScore: number;
  bodyOrderMismatchCount: number;
  nextOnCycleHeadOccupied: boolean | null;
  nearLockedCertificate: boolean;
  cheapTransitionScore: number;
};

export type V2FourExitSnakeClassification = {
  graphValid: boolean;
  lockedCertificateValid: boolean;
  appleForwardValid: boolean;
  immediateLocked: boolean;
  transitionReachable: boolean;
  transitionPathLength: number | null;
  transitionPlanSummary: V2FourExitSnakeTransitionSummary | null;
  cheapTransitionFeatures: V2FourExitCheapTransitionFeatures | null;
  transitionSearchAttempted: boolean;
  transitionSkippedByPrefilter: boolean;
  usableForSnake: boolean;
  usabilityMode: V2FourExitSnakeUsabilityMode;
  reason: V2FourExitSnakeClassificationReason;
};

export type V2FourExitSnakeCandidateClassification = V2FourExitSnakeClassification & {
  candidate: V2FourExitSpliceCandidate;
};

export type V2FourExitSnakeClassificationReasonCount = {
  reason: V2FourExitSnakeClassificationReason;
  count: number;
};

export type V2FourExitMutationFeatures = {
  candidateId: string;
  patchId: string;
  usabilityMode: Exclude<V2FourExitSnakeUsabilityMode, 'unusable'>;
  currentLockedCyclePathLen: number | null;
  candidatePathLenToApple: number | null;
  transitionPathLength: number | null;
  pathLenImprovement: number | null;
  changedCycleEdges: number;
  rectangleArea: number;
  cycleScore: number | null;
  cycleFeatures: CycleFeatures | null;
  finalV2MutationScore: number;
};

export type RankedV2FourExitSnakeCandidate = {
  candidate: V2FourExitSpliceCandidate;
  classification: V2FourExitSnakeCandidateClassification;
  features: V2FourExitMutationFeatures;
};

export type V2FourExitSnakeAggregateDiagnostics = {
  graphValidCandidates: number;
  immediateLockedCandidates: number;
  nonImmediateCandidates: number;
  transitionCandidatesAfterPrefilter: number;
  transitionCandidatesSkippedByPrefilter: number;
  transitionSearchesStarted: number;
  transitionSearchesSucceeded: number;
  transitionReachableCandidates: number;
  snakeUsableCandidates: number;
  improvingCandidates: number;
  bestImprovement: number | null;
  averageImprovement: number | null;
  bestCandidate: V2FourExitMutationFeatures | null;
  rejectedByLockedCertificate: number;
  rejectedByAppleForward: number;
  rejectedByTransitionSearch: number;
  prefilterRejectedButWouldHaveSucceeded: number | null;
  topRejectionReasons: V2FourExitSnakeClassificationReasonCount[];
};

export type V2FourExitSnakeClassificationOptions = SamePairing4ExitPathCoverOptions & {
  transitionOptions?: CertifiedTransitionDiagnosticsOptions;
  validateCycle?: (graph: GraphSnapshot, candidateCycle: HamiltonianCycle) => boolean;
  transitionPrefilterMode?: V2TransitionPrefilterMode;
  maxTransitionCandidatesPerPlanningEvent?: number;
  minCheapImprovementForTransitionSearch?: number;
  preferImmediateLockedBeforeTransitionSearch?: boolean;
  maxTransitionSearchesPerSource?: number;
  minimumPathImprovement?: number;
};

export type V2FourExitSnakeClassificationResult = {
  spliceDiagnostics: V2FourExitSpliceGenerationResult;
  aggregate: V2FourExitSnakeAggregateDiagnostics;
  classifications: V2FourExitSnakeCandidateClassification[];
  rankedCandidates: RankedV2FourExitSnakeCandidate[];
  profile: {
    certificationMs: number;
    transitionSearchMs: number;
    scoringMs: number;
    nonImmediateCandidates: number;
    transitionCandidatesAfterPrefilter: number;
    transitionCandidatesSkippedByPrefilter: number;
    transitionSearchesStarted: number;
    transitionSearchesSucceeded: number;
  };
};

export type V2FourExitSnakeClassificationFromCandidatesResult = Omit<
  V2FourExitSnakeClassificationResult,
  'spliceDiagnostics'
>;

type Component = {
  nodes: NodeId[];
  edgeCount: number;
  terminalNodes: NodeId[];
};

type ResolvedSamePairing4ExitPathCoverOptions = Required<
  Pick<SamePairing4ExitPathCoverOptions, 'maxPatchArea4Exit' | 'maxCoversPerPatch' | 'maxSolverExpansionsPerPatch'>
>;

type PathSearchContext = {
  expansions: number;
  budgetExhausted: boolean;
};

type V2FourExitSpliceDetailedResult = {
  candidateCycle: HamiltonianCycle | null;
  edgeSetDegreeValid: boolean;
  reconstructedSingleCycle: boolean;
  nodeSetMatchesOldCycle: boolean;
};

const DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS: ResolvedSamePairing4ExitPathCoverOptions = {
  maxPatchArea4Exit: 24,
  maxCoversPerPatch: 64,
  maxSolverExpansionsPerPatch: 100_000
};

export function analyzeMultiTerminalRectanglePatch(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  rect: RectanglePatchRect
): MultiTerminalPatchRectDiagnostics {
  const rectNodeSet = buildRectNodeSet(graph, rect);
  const fullRectangle = rectNodeSet.size === rect.width * rect.height;
  const base = createBasePatchDiagnostics(rect, rectNodeSet.size, fullRectangle);

  if (!fullRectangle) {
    return {
      ...base,
      rejectionReason: 'rectangle-not-full'
    };
  }

  const crossingEdges = getCycleCutCrossings(cycle, rectNodeSet);
  const terminals = crossingEdges.map((crossing) => crossing.insideNode);
  const repeatedTerminalCount = terminals.length - new Set(terminals).size;
  const exitClass = classifyExitCount(crossingEdges.length);
  const countedBase = {
    ...base,
    crossingCount: crossingEdges.length,
    terminals,
    repeatedTerminalCount,
    exitClass
  };

  if (repeatedTerminalCount > 0) {
    return {
      ...countedBase,
      rejectionReason: 'repeated-terminal'
    };
  }

  switch (exitClass) {
    case 'two':
      return {
        ...countedBase,
        rejectionReason: 'two-exit-owned-by-v1'
      };
    case 'six':
      return {
        ...countedBase,
        rejectionReason: 'six-exit-count-only'
      };
    case 'eight':
      return {
        ...countedBase,
        rejectionReason: 'eight-exit-count-only'
      };
    case 'other':
      return {
        ...countedBase,
        rejectionReason: 'unsupported-exit-count'
      };
    case 'four':
      break;
  }

  const decompositionResult = analyzeFourExitDecomposition(
    rectNodeSet,
    terminals,
    crossingEdges,
    extractInsideCycleEdges(cycle, rectNodeSet)
  );

  return {
    ...countedBase,
    fourExitDecomposition: decompositionResult.decomposition,
    rejectionReason: decompositionResult.rejectionReason
  };
}

export function analyzeFourExitDecomposition(
  rectNodeSet: ReadonlySet<NodeId>,
  terminals: readonly NodeId[],
  crossingEdges: readonly CycleCutCrossing[],
  internalEdges: readonly InsideCycleEdge[]
): {
  decomposition: FourExitPatchDecomposition | null;
  rejectionReason: MultiTerminalPatchRejectionReason;
} {
  const terminalSet = new Set(terminals);

  if (terminals.length !== 4 || terminalSet.size !== 4 || crossingEdges.length !== 4) {
    return {
      decomposition: null,
      rejectionReason: 'terminal-count-mismatch'
    };
  }

  const internalDegree = calculateInternalDegrees(rectNodeSet, internalEdges);
  const cutDegree = calculateCutDegrees(rectNodeSet, crossingEdges);

  if (!hasValidCycleDegreeAccounting(rectNodeSet, internalDegree, cutDegree)) {
    return {
      decomposition: null,
      rejectionReason: 'invalid-cycle-degree-accounting'
    };
  }

  if (!hasExpectedTerminalInternalDegrees(terminalSet, internalDegree)) {
    return {
      decomposition: null,
      rejectionReason: 'invalid-terminal-internal-degree'
    };
  }

  if (!hasExpectedNonterminalInternalDegrees(rectNodeSet, terminalSet, internalDegree)) {
    return {
      decomposition: null,
      rejectionReason: 'invalid-nonterminal-internal-degree'
    };
  }

  const adjacency = buildInternalAdjacency(rectNodeSet, internalEdges);
  const components = connectedComponents(rectNodeSet, adjacency, terminalSet);

  if (components.length !== 2) {
    return {
      decomposition: null,
      rejectionReason: 'component-count-not-two'
    };
  }

  if (!components.every((component) => isSimplePathComponent(component, adjacency))) {
    return {
      decomposition: null,
      rejectionReason: 'component-not-simple-path'
    };
  }

  if (!components.every((component) => component.terminalNodes.length === 2)) {
    return {
      decomposition: null,
      rejectionReason: 'component-terminal-count-not-two'
    };
  }

  const terminalPairs = components
    .map((component) => terminalPairFromComponent(component, adjacency))
    .filter((pair): pair is FourExitTerminalPair => pair !== null)
    .sort(compareTerminalPairs);
  const coveredNodes = new Set(terminalPairs.flatMap((pair) => pair.originalPath));
  const coversAllPatchVertices = coveredNodes.size === rectNodeSet.size &&
    [...rectNodeSet].every((nodeId) => coveredNodes.has(nodeId));

  if (terminalPairs.length !== 2 || !coversAllPatchVertices) {
    return {
      decomposition: null,
      rejectionReason: 'internal-components-miss-vertices'
    };
  }

  return {
    decomposition: {
      terminalPairs,
      internalEdges: [...internalEdges],
      componentCount: components.length,
      coversAllPatchVertices,
      internalDegreeByNode: degreeRecord(internalDegree),
      cutDegreeByNode: degreeRecord(cutDegree)
    },
    rejectionReason: 'valid-four-exit-decomposition'
  };
}

export function analyzeMultiTerminalRectanglePatches(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: RectanglePatchDetectionOptions = {}
): MultiTerminalPatchScanDiagnostics {
  const rectangles = applyRectangleScanBudget(enumerateRectangles(graph, options), options.maxPatchRectsScanned);
  return analyzeMultiTerminalRectanglePatchesForRectangles(graph, cycle, rectangles);
}

export function analyzeMultiTerminalRectanglePatchesForRectangles(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  rectangles: readonly RectanglePatchRect[]
): MultiTerminalPatchScanDiagnostics {
  const patches = rectangles.map((rect) => analyzeMultiTerminalRectanglePatch(graph, cycle, rect));
  const aggregate = createEmptyAggregateDiagnostics();
  const reasonCounts = new Map<MultiTerminalPatchRejectionReason, number>();

  for (const patch of patches) {
    aggregate.rectanglesScanned += 1;
    incrementReason(reasonCounts, patch.rejectionReason);

    if (!patch.fullRectangle) {
      continue;
    }

    aggregate.fullRectangles += 1;
    if (patch.repeatedTerminalCount > 0) {
      aggregate.repeatedTerminalRectangles += 1;
    }

    switch (patch.exitClass) {
      case 'two':
        aggregate.twoExitRectangles += 1;
        break;
      case 'four':
        aggregate.fourExitRectangles += 1;
        if (patch.repeatedTerminalCount === 0) {
          aggregate.fourExitDecompositionAttempts += 1;
        }
        break;
      case 'six':
        aggregate.sixExitRectangles += 1;
        if (patch.repeatedTerminalCount === 0 && hasPlausibleSixExitDegreePattern(graph, cycle, patch.rect)) {
          aggregate.sixExitPlausibleDegreePattern += 1;
        }
        break;
      case 'eight':
        aggregate.eightExitRectangles += 1;
        if (patch.rejectionReason === 'eight-exit-count-only') {
          aggregate.eightExitCountOnly += 1;
        }
        break;
      case 'other':
        aggregate.otherExitRectangles += 1;
        break;
    }

    switch (patch.rejectionReason) {
      case 'valid-four-exit-decomposition':
        aggregate.validFourExitDecompositions += 1;
        break;
      case 'invalid-cycle-degree-accounting':
        aggregate.invalidDegreeAccounting += 1;
        break;
      case 'invalid-terminal-internal-degree':
        aggregate.invalidTerminalDegree += 1;
        break;
      case 'invalid-nonterminal-internal-degree':
        aggregate.invalidNonterminalDegree += 1;
        break;
      case 'component-count-not-two':
        aggregate.invalidComponentCount += 1;
        break;
      case 'component-not-simple-path':
      case 'component-terminal-count-not-two':
        aggregate.invalidComponentPath += 1;
        break;
      case 'internal-components-miss-vertices':
        aggregate.componentsMissingVertices += 1;
        break;
      default:
        break;
    }
  }

  aggregate.topRejectionReasons = topReasons(reasonCounts);
  return { aggregate, patches };
}

export function generateSamePairing4ExitPathCovers(
  patch: MultiTerminalPatchRectDiagnostics,
  graph: GraphSnapshot,
  options: SamePairing4ExitPathCoverOptions = {}
): SamePairing4ExitPathCoverDiagnostics {
  const resolved = resolveSamePairingPathCoverOptions(options);
  const terminalPairs = patch.fourExitDecomposition?.terminalPairs ?? [];
  const base = createEmptyPathCoverDiagnostics(patch.rect, terminalPairs);

  if (
    patch.rejectionReason !== 'valid-four-exit-decomposition' ||
    patch.exitClass !== 'four' ||
    !patch.fourExitDecomposition
  ) {
    return base;
  }

  if (patch.vertexCount > resolved.maxPatchArea4Exit) {
    return {
      ...base,
      rejectionReason: 'patch-area-too-large'
    };
  }

  const rectNodeSet = buildRectNodeSet(graph, patch.rect);
  const adjacency = buildRectangleGridAdjacency(graph, patch.rect);
  const [firstPair, secondPair] = terminalPairs;

  if (!firstPair || !secondPair || rectNodeSet.size !== patch.vertexCount) {
    return base;
  }

  const context: PathSearchContext = {
    expansions: 0,
    budgetExhausted: false
  };
  const covers: SamePairingPathCover[] = [];
  const seenSignatures = new Set<string>();
  let noOpCoversSkipped = 0;
  let duplicateCoversSkipped = 0;
  const originalSignature = originalCoverSignature(patch);
  const blockedForFirstPath = new Set<NodeId>([secondPair.terminalA, secondPair.terminalB]);
  const firstPathState = {
    path: [firstPair.terminalA],
    visited: new Set<NodeId>([firstPair.terminalA])
  };

  const dfsFirstPath = (current: NodeId): void => {
    if (covers.length >= resolved.maxCoversPerPatch || context.budgetExhausted) {
      return;
    }

    if (!consumeExpansion(context, resolved.maxSolverExpansionsPerPatch)) {
      return;
    }

    if (current === firstPair.terminalB) {
      const remaining = new Set([...rectNodeSet].filter((nodeId) => !firstPathState.visited.has(nodeId)));
      if (!remaining.has(secondPair.terminalA) || !remaining.has(secondPair.terminalB)) {
        return;
      }

      const secondPaths = findHamiltonPathsThroughRemaining(
        secondPair.terminalA,
        secondPair.terminalB,
        remaining,
        adjacency,
        context,
        resolved.maxSolverExpansionsPerPatch,
        resolved.maxCoversPerPatch - covers.length
      );

      for (const secondPath of secondPaths) {
        const cover: SamePairingPathCover = {
          paths: [[...firstPathState.path], secondPath]
        };

        if (!validateSamePairingPathCover(patch, graph, cover)) {
          continue;
        }

        if (pathCoverSignature(cover) === originalSignature || sameAsOriginalCover(patch, cover)) {
          noOpCoversSkipped += 1;
          continue;
        }

        const signature = pathCoverSignature(cover);
        if (seenSignatures.has(signature)) {
          duplicateCoversSkipped += 1;
          continue;
        }

        seenSignatures.add(signature);
        covers.push(cover);
        if (covers.length >= resolved.maxCoversPerPatch) {
          break;
        }
      }
      return;
    }

    for (const next of orderedGridNeighbors(current, adjacency, firstPathState.visited, firstPair.terminalB)) {
      if (blockedForFirstPath.has(next)) {
        continue;
      }

      firstPathState.visited.add(next);
      firstPathState.path.push(next);

      const remaining = new Set([...rectNodeSet].filter((nodeId) => !firstPathState.visited.has(nodeId)));
      const shouldContinue = current === firstPair.terminalB ||
        remaining.size === 0 ||
        canStillConnectSecondPair(remaining, secondPair, adjacency);

      if (shouldContinue) {
        dfsFirstPath(next);
      }

      firstPathState.path.pop();
      firstPathState.visited.delete(next);

      if (covers.length >= resolved.maxCoversPerPatch || context.budgetExhausted) {
        break;
      }
    }
  };

  dfsFirstPath(firstPair.terminalA);

  return {
    rect: patch.rect,
    terminalPairs,
    attempted: true,
    solverExpansions: context.expansions,
    budgetExhausted: context.budgetExhausted,
    coversFound: covers.length,
    noOpCoversSkipped,
    duplicateCoversSkipped,
    rejectionReason: covers.length > 0
      ? 'valid-alternative-cover'
      : context.budgetExhausted
        ? 'budget-exhausted'
        : 'no-alternative-cover',
    covers
  };
}

export function validateSamePairingPathCover(
  patch: MultiTerminalPatchRectDiagnostics,
  graph: GraphSnapshot,
  cover: SamePairingPathCover
): boolean {
  const terminalPairs = patch.fourExitDecomposition?.terminalPairs;
  if (
    patch.rejectionReason !== 'valid-four-exit-decomposition' ||
    patch.exitClass !== 'four' ||
    !terminalPairs ||
    terminalPairs.length !== 2 ||
    cover.paths.length !== 2
  ) {
    return false;
  }

  const rectNodeSet = buildRectNodeSet(graph, patch.rect);
  if (rectNodeSet.size !== patch.vertexCount) {
    return false;
  }

  const adjacency = buildRectangleGridAdjacency(graph, patch.rect);
  const seen = new Set<NodeId>();

  for (let index = 0; index < terminalPairs.length; index += 1) {
    const pair = terminalPairs[index]!;
    const path = cover.paths[index]!;
    const otherPair = terminalPairs[index === 0 ? 1 : 0]!;

    if (path[0] !== pair.terminalA || path[path.length - 1] !== pair.terminalB) {
      return false;
    }

    for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
      const nodeId = path[pathIndex]!;
      if (!rectNodeSet.has(nodeId) || seen.has(nodeId)) {
        return false;
      }
      if (
        pathIndex > 0 &&
        pathIndex < path.length - 1 &&
        (nodeId === otherPair.terminalA || nodeId === otherPair.terminalB)
      ) {
        return false;
      }
      seen.add(nodeId);
    }

    for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex += 1) {
      if (!areAdjacentInGrid(path[pathIndex]!, path[pathIndex + 1]!, adjacency)) {
        return false;
      }
    }
  }

  return seen.size === rectNodeSet.size && [...rectNodeSet].every((nodeId) => seen.has(nodeId));
}

export function pathCoverSignature(cover: SamePairingPathCover): string {
  return edgeSignatureForPaths(cover.paths);
}

export function sameAsOriginalCover(
  patch: MultiTerminalPatchRectDiagnostics,
  cover: SamePairingPathCover
): boolean {
  return pathCoverSignature(cover) === originalCoverSignature(patch);
}

export function analyzeSamePairing4ExitPathCovers(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: SamePairing4ExitPathCoverOptions = {}
): SamePairing4ExitPathCoverScanDiagnostics {
  const detectionStartedAt = Date.now();
  const patchScan = analyzeMultiTerminalRectanglePatches(graph, cycle, options);
  return analyzeSamePairing4ExitPathCoversFromPatchScan(graph, patchScan, options, Date.now() - detectionStartedAt);
}

export function analyzeSamePairing4ExitPathCoversForRectangles(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  rectangles: readonly RectanglePatchRect[],
  options: SamePairing4ExitPathCoverOptions = {}
): SamePairing4ExitPathCoverScanDiagnostics {
  const detectionStartedAt = Date.now();
  const patchScan = analyzeMultiTerminalRectanglePatchesForRectangles(graph, cycle, rectangles);
  return analyzeSamePairing4ExitPathCoversFromPatchScan(graph, patchScan, options, Date.now() - detectionStartedAt);
}

function analyzeSamePairing4ExitPathCoversFromPatchScan(
  graph: GraphSnapshot,
  patchScan: MultiTerminalPatchScanDiagnostics,
  options: SamePairing4ExitPathCoverOptions,
  detectionMs: number
): SamePairing4ExitPathCoverScanDiagnostics {
  const pathCoverStartedAt = Date.now();
  const validPatches = patchScan.patches.filter((patch) => patch.rejectionReason === 'valid-four-exit-decomposition');
  const pathCoverDiagnostics = validPatches.map((patch) => generateSamePairing4ExitPathCovers(patch, graph, options));
  const pathCoverSolvingMs = Date.now() - pathCoverStartedAt;
  const aggregate = createEmptyPathCoverAggregateDiagnostics(validPatches.length);
  const reasonCounts = new Map<SamePairing4ExitPathCoverRejectionReason, number>();

  for (const diagnostic of pathCoverDiagnostics) {
    incrementPathCoverReason(reasonCounts, diagnostic.rejectionReason);
    if (diagnostic.attempted) {
      aggregate.patchesAttempted += 1;
    }
    if (diagnostic.budgetExhausted) {
      aggregate.budgetExhaustedPatches += 1;
    }
    if (diagnostic.coversFound > 0) {
      aggregate.patchesWithAlternativeCovers += 1;
    }
    aggregate.pathCoversFound += diagnostic.coversFound;
    aggregate.noOpCoversSkipped += diagnostic.noOpCoversSkipped;
    aggregate.duplicateCoversSkipped += diagnostic.duplicateCoversSkipped;
  }

  aggregate.topFailureReasons = topPathCoverReasons(reasonCounts);
  return {
    patchScan,
    aggregate,
    patches: pathCoverDiagnostics,
    profile: {
      detectionMs,
      pathCoverSolvingMs
    }
  };
}

export function spliceMultiTerminalSamePairingCoverByEdges(
  graph: GraphSnapshot,
  oldCycle: HamiltonianCycle,
  patch: MultiTerminalPatchRectDiagnostics,
  cover: SamePairingPathCover
): HamiltonianCycle | null {
  return spliceMultiTerminalSamePairingCoverByEdgesDetailed(graph, oldCycle, patch, cover).candidateCycle;
}

export function reconstructCycleFromDegreeTwoEdges(
  edgeSet: readonly UndirectedCycleEdge[],
  startNode?: NodeId
): HamiltonianCycle | null {
  if (edgeSet.length === 0) {
    return null;
  }

  const adjacency = buildUndirectedAdjacency(edgeSet);
  if ([...adjacency.values()].some((neighbors) => neighbors.size !== 2)) {
    return null;
  }

  const start = startNode && adjacency.has(startNode)
    ? startNode
    : [...adjacency.keys()].sort()[0];
  if (!start) {
    return null;
  }

  const cycle: NodeId[] = [start];
  let previous: NodeId | null = null;
  let current = start;

  for (let step = 0; step <= adjacency.size; step += 1) {
    const neighbors = [...(adjacency.get(current) ?? [])].sort();
    const next = previous === null ? neighbors[0] : neighbors.find((nodeId) => nodeId !== previous);

    if (!next) {
      return null;
    }

    if (next === start) {
      return cycle.length === adjacency.size ? cycle : null;
    }

    if (cycle.includes(next)) {
      return null;
    }

    previous = current;
    current = next;
    cycle.push(current);
  }

  return null;
}

export function generateV2FourExitSpliceCandidates(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: SamePairing4ExitPathCoverOptions = {}
): V2FourExitSpliceGenerationResult {
  const startedAt = Date.now();
  const pathCoverDiagnostics = analyzeSamePairing4ExitPathCovers(graph, cycle, options);
  return generateV2FourExitSpliceCandidatesFromPathCoverDiagnostics(graph, cycle, pathCoverDiagnostics, startedAt);
}

export function generateV2FourExitSpliceCandidatesFromRectangles(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  rectangles: readonly RectanglePatchRect[],
  options: SamePairing4ExitPathCoverOptions = {}
): V2FourExitSpliceGenerationResult {
  const startedAt = Date.now();
  const pathCoverDiagnostics = analyzeSamePairing4ExitPathCoversForRectangles(graph, cycle, rectangles, options);
  return generateV2FourExitSpliceCandidatesFromPathCoverDiagnostics(graph, cycle, pathCoverDiagnostics, startedAt);
}

function generateV2FourExitSpliceCandidatesFromPathCoverDiagnostics(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  pathCoverDiagnostics: SamePairing4ExitPathCoverScanDiagnostics,
  startedAt: number
): V2FourExitSpliceGenerationResult {
  const splicingStartedAt = Date.now();
  const patchByRectKey = new Map(
    pathCoverDiagnostics.patchScan.patches.map((patch) => [rectKey(patch.rect), patch])
  );
  const aggregate = createEmptyV2FourExitSpliceAggregateDiagnostics(
    pathCoverDiagnostics.aggregate.validFourExitDecompositions
  );
  const candidateDiagnostics: V2FourExitSpliceCandidateDiagnostics[] = [];
  const candidates: V2FourExitSpliceCandidate[] = [];
  const reasonCounts = new Map<V2FourExitSpliceCandidateRejectionReason, number>();
  const seenCandidateSignatures = new Set<string>();

  for (const pathCoverPatch of pathCoverDiagnostics.patches) {
    const patch = patchByRectKey.get(rectKey(pathCoverPatch.rect));
    if (!patch) {
      continue;
    }

    for (const cover of pathCoverPatch.covers) {
      aggregate.alternativeCoversConsidered += 1;
      const coverSignature = pathCoverSignature(cover);
      const splice = spliceMultiTerminalSamePairingCoverByEdgesDetailed(graph, cycle, patch, cover);
      const baseDiagnostic = createV2FourExitSpliceCandidateDiagnostics(
        patch,
        coverSignature,
        splice.edgeSetDegreeValid,
        splice.reconstructedSingleCycle,
        splice.nodeSetMatchesOldCycle
      );

      if (!splice.edgeSetDegreeValid) {
        aggregate.degreeInvalidCandidates += 1;
        recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
          ...baseDiagnostic,
          rejectionReason: 'degree-invalid'
        });
        continue;
      }

      if (!splice.reconstructedSingleCycle) {
        aggregate.subtourCandidates += 1;
        recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
          ...baseDiagnostic,
          rejectionReason: 'subtour'
        });
        continue;
      }

      if (!splice.nodeSetMatchesOldCycle || !splice.candidateCycle) {
        aggregate.nodeSetMismatchCandidates += 1;
        recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
          ...baseDiagnostic,
          rejectionReason: 'node-set-mismatch'
        });
        continue;
      }

      aggregate.rawCandidatesGenerated += 1;
      const candidateSignature = cycleUndirectedEdgeSignature(splice.candidateCycle);
      if (seenCandidateSignatures.has(candidateSignature)) {
        aggregate.duplicateCandidatesSkipped += 1;
        recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
          ...baseDiagnostic,
          duplicateCandidate: true,
          rejectionReason: 'duplicate-candidate'
        });
        continue;
      }
      seenCandidateSignatures.add(candidateSignature);

      const graphValid = validateHamiltonianCycle(graph, splice.candidateCycle);
      if (!graphValid) {
        aggregate.graphInvalidCandidates += 1;
        recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
          ...baseDiagnostic,
          graphValid: false,
          rejectionReason: 'graph-invalid'
        });
        continue;
      }

      aggregate.graphValidCandidates += 1;
      recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
        ...baseDiagnostic,
        graphValid: true,
        rejectionReason: 'graph-valid'
      });
      candidates.push({
        cycle: splice.candidateCycle,
        rect: patch.rect,
        terminalPairs: patch.fourExitDecomposition?.terminalPairs ?? [],
        coverSignature
      });
    }
  }

  aggregate.topRejectionReasons = topV2FourExitSpliceReasons(reasonCounts);
  const splicingValidationMs = Date.now() - splicingStartedAt;
  return {
    pathCoverDiagnostics,
    aggregate,
    candidateDiagnostics,
    candidates,
    profile: {
      detectionMs: pathCoverDiagnostics.profile.detectionMs,
      pathCoverSolvingMs: pathCoverDiagnostics.profile.pathCoverSolvingMs,
      splicingValidationMs,
      totalMs: Date.now() - startedAt
    }
  };
}

export function classifyV2FourExitSpliceCandidateForSnake(
  state: GameState,
  candidate: Pick<V2FourExitSpliceCandidate, 'cycle' | 'coverSignature'>,
  options: V2FourExitSnakeClassificationOptions = {}
): V2FourExitSnakeClassification {
  const validateCycle = options.validateCycle ?? validateHamiltonianCycle;
  const graphValid = validateCycle(state.map.graph, candidate.cycle);

  if (!graphValid) {
    return createV2SnakeClassification({
      graphValid,
      reason: 'graph-invalid'
    });
  }

  const lockedCertificateValid = validLockedCertificate(state.snake.segments, candidate.cycle);
  const appleForwardValid = !state.appleNodeId || appleForward(state.snake.segments, state.appleNodeId, candidate.cycle);

  if (lockedCertificateValid && appleForwardValid) {
    return createV2SnakeClassification({
      graphValid,
      lockedCertificateValid,
      appleForwardValid,
      immediateLocked: true,
      usableForSnake: true,
      usabilityMode: 'immediate-locked',
      reason: 'immediate-locked'
    });
  }

  if (!state.appleNodeId) {
    return createV2SnakeClassification({
      graphValid,
      lockedCertificateValid,
      appleForwardValid,
      reason: 'no-current-apple-for-transition'
    });
  }

  const transitionDiagnostics = analyzeCertifiedTransitionTargets(
    state,
    {
      mapId: state.map.id,
      status: 'ready',
      entries: [{
        id: v2CandidateIdForTransition(candidate.coverSignature),
        cycle: candidate.cycle,
        source: 'solver',
        archetypeName: 'v2-four-exit-same-pairing',
        minDistanceToAccepted: 0,
        minOrderDistanceToAccepted: 0
      }],
      diagnostics: {
        generationAttempts: 0,
        generatedCycles: 1,
        diversityDistances: [],
        minDiversityDistance: null,
        maxDiversityDistance: null,
        averageDiversityDistance: null,
        orderDiversityDistances: [],
        minOrderDiversityDistance: null,
        maxOrderDiversityDistance: null,
        averageOrderDiversityDistance: null,
        duplicateRejections: 0,
        lowDiversityRejections: 0,
        graphInvalidCandidates: 0,
        entryAttempts: []
      }
    },
    options.transitionOptions
  );
  const target = transitionDiagnostics.targets[0] ?? null;
  const transitionReachable = (target?.successfulTransitionPaths ?? 0) > 0;
  const transitionPlanSummary = target
    ? {
      targetCycleId: target.targetCycleId,
      pathsGenerated: target.pathsGenerated,
      pathsSimulated: target.pathsSimulated,
      safePathsToApple: target.safePathsToApple,
      successfulTransitionPaths: target.successfulTransitionPaths,
      bestSuccessfulPathLength: target.bestSuccessfulPathLength,
      bestSuccessfulPath: target.bestSuccessfulPath,
      failureReasons: target.failureReasons,
      lockedCertificateFailures: target.lockedCertificateFailures
    }
    : null;

  if (transitionReachable) {
    return createV2SnakeClassification({
      graphValid,
      lockedCertificateValid,
      appleForwardValid,
      transitionReachable,
      transitionPathLength: target?.bestSuccessfulPathLength ?? null,
      transitionPlanSummary,
      usableForSnake: true,
      usabilityMode: 'transition-valid',
      reason: 'transition-valid'
    });
  }

  return createV2SnakeClassification({
    graphValid,
    lockedCertificateValid,
    appleForwardValid,
    transitionPlanSummary,
    reason: lockedCertificateValid && !appleForwardValid
      ? 'immediate-locked-apple-forward-failed'
      : lockedCertificateValid
        ? 'no-certified-use'
        : 'locked-invalid-transition-not-found'
  });
}

export function classifyV2FourExitSpliceCandidatesForSnake(
  state: GameState,
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: V2FourExitSnakeClassificationOptions = {}
): V2FourExitSnakeClassificationResult {
  const spliceDiagnostics = generateV2FourExitSpliceCandidates(graph, cycle, options);
  const result = classifyGeneratedV2FourExitSpliceCandidatesForSnake(
    state,
    spliceDiagnostics.candidates,
    state.lockedHamiltonianCycle ?? cycle,
    options
  );

  return {
    spliceDiagnostics,
    ...result
  };
}

export function classifyGeneratedV2FourExitSpliceCandidatesForSnake(
  state: GameState,
  candidates: readonly V2FourExitSpliceCandidate[],
  currentCycle: HamiltonianCycle,
  options: V2FourExitSnakeClassificationOptions
): V2FourExitSnakeClassificationFromCandidatesResult {
  const validateCycle = options.validateCycle ?? validateHamiltonianCycle;
  const classifications = new Map<string, V2FourExitSnakeCandidateClassification>();
  const transitionCandidates: Array<{
    candidate: V2FourExitSpliceCandidate;
    cheapTransitionFeatures: V2FourExitCheapTransitionFeatures | null;
    lockedCertificateValid: boolean;
    appleForwardValid: boolean;
  }> = [];
  let certificationMs = 0;
  let transitionSearchMs = 0;
  let nonImmediateCandidates = 0;

  const initialCertificationStartedAt = Date.now();
  for (const candidate of candidates) {
    const graphValid = validateCycle(state.map.graph, candidate.cycle);
    if (!graphValid) {
      classifications.set(candidate.coverSignature, {
        candidate,
        ...createV2SnakeClassification({
          graphValid,
          reason: 'graph-invalid'
        })
      });
      continue;
    }

    const lockedCertificateValid = validLockedCertificate(state.snake.segments, candidate.cycle);
    const appleForwardValid = !state.appleNodeId || appleForward(state.snake.segments, state.appleNodeId, candidate.cycle);
    const cheapTransitionFeatures = buildV2CheapTransitionFeatures(state, currentCycle, candidate);

    if (lockedCertificateValid && appleForwardValid) {
      classifications.set(candidate.coverSignature, {
        candidate,
        ...createV2SnakeClassification({
          graphValid,
          lockedCertificateValid,
          appleForwardValid,
          immediateLocked: true,
          usableForSnake: true,
          usabilityMode: 'immediate-locked',
          reason: 'immediate-locked',
          cheapTransitionFeatures
        })
      });
      continue;
    }

    if (!state.appleNodeId) {
      classifications.set(candidate.coverSignature, {
        candidate,
        ...createV2SnakeClassification({
          graphValid,
          lockedCertificateValid,
          appleForwardValid,
          reason: 'no-current-apple-for-transition',
          cheapTransitionFeatures
        })
      });
      continue;
    }

    nonImmediateCandidates += 1;
    transitionCandidates.push({
      candidate,
      cheapTransitionFeatures,
      lockedCertificateValid,
      appleForwardValid
    });
  }
  certificationMs += Date.now() - initialCertificationStartedAt;

  const immediateImprovingExists =
    options.preferImmediateLockedBeforeTransitionSearch === true &&
    [...classifications.values()].some((classification) =>
      classification.reason === 'immediate-locked' &&
      (classification.cheapTransitionFeatures?.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY) >=
        (options.minimumPathImprovement ?? 1)
    );
  const selectedTransitionCandidates = selectV2TransitionCandidatesForSearch(
    transitionCandidates,
    options,
    immediateImprovingExists
  );
  const selectedTransitionSet = new Set(
    selectedTransitionCandidates.map(({ candidate }) => candidate.coverSignature)
  );

  if (selectedTransitionCandidates.length > 0) {
    const transitionSearchStartedAt = Date.now();
    const transitionDiagnostics = analyzeCertifiedTransitionTargets(
      state,
      {
        mapId: state.map.id,
        status: 'ready',
        entries: selectedTransitionCandidates.map(({ candidate }) => ({
          id: v2CandidateIdForTransition(candidate.coverSignature),
          cycle: candidate.cycle,
          source: 'solver',
          archetypeName: 'v2-four-exit-same-pairing',
          minDistanceToAccepted: 0,
          minOrderDistanceToAccepted: 0
        })),
        diagnostics: {
          generationAttempts: 0,
          generatedCycles: selectedTransitionCandidates.length,
          diversityDistances: [],
          minDiversityDistance: null,
          maxDiversityDistance: null,
          averageDiversityDistance: null,
          orderDiversityDistances: [],
          minOrderDiversityDistance: null,
          maxOrderDiversityDistance: null,
          averageOrderDiversityDistance: null,
          duplicateRejections: 0,
          lowDiversityRejections: 0,
          graphInvalidCandidates: 0,
          entryAttempts: []
        }
      },
      options.transitionOptions
    );
    transitionSearchMs += Date.now() - transitionSearchStartedAt;
    const targetById = new Map(transitionDiagnostics.targets.map((target) => [target.targetCycleId, target]));

    const postTransitionCertificationStartedAt = Date.now();
    for (const { candidate, cheapTransitionFeatures, lockedCertificateValid, appleForwardValid } of selectedTransitionCandidates) {
      const graphValid = true;
      const target = targetById.get(v2CandidateIdForTransition(candidate.coverSignature)) ?? null;
      const transitionReachable = (target?.successfulTransitionPaths ?? 0) > 0;
      const transitionPlanSummary = target
        ? {
          targetCycleId: target.targetCycleId,
          pathsGenerated: target.pathsGenerated,
          pathsSimulated: target.pathsSimulated,
          safePathsToApple: target.safePathsToApple,
          successfulTransitionPaths: target.successfulTransitionPaths,
          bestSuccessfulPathLength: target.bestSuccessfulPathLength,
          bestSuccessfulPath: target.bestSuccessfulPath,
          failureReasons: target.failureReasons,
          lockedCertificateFailures: target.lockedCertificateFailures
        }
        : null;

      classifications.set(candidate.coverSignature, {
        candidate,
        ...createV2SnakeClassification({
          graphValid,
          lockedCertificateValid,
          appleForwardValid,
          transitionReachable,
          transitionPathLength: transitionReachable ? target?.bestSuccessfulPathLength ?? null : null,
          transitionPlanSummary,
          cheapTransitionFeatures,
          transitionSearchAttempted: true,
          usableForSnake: transitionReachable,
          usabilityMode: transitionReachable ? 'transition-valid' : 'unusable',
          reason: transitionReachable
            ? 'transition-valid'
            : lockedCertificateValid && !appleForwardValid
              ? 'immediate-locked-apple-forward-failed'
              : lockedCertificateValid
                ? 'no-certified-use'
                : 'locked-invalid-transition-not-found'
        })
      });
    }
    certificationMs += Date.now() - postTransitionCertificationStartedAt;
  }

  for (const { candidate, cheapTransitionFeatures, lockedCertificateValid, appleForwardValid } of transitionCandidates) {
    if (selectedTransitionSet.has(candidate.coverSignature)) {
      continue;
    }
    classifications.set(candidate.coverSignature, {
      candidate,
      ...createV2SnakeClassification({
        graphValid: true,
        lockedCertificateValid,
        appleForwardValid,
        cheapTransitionFeatures,
        transitionSkippedByPrefilter: true,
        reason: lockedCertificateValid && !appleForwardValid
          ? 'immediate-locked-apple-forward-failed'
          : lockedCertificateValid
            ? 'no-certified-use'
            : 'locked-invalid-transition-not-found'
      })
    });
  }

  const classificationList = candidates.map((candidate) => classifications.get(candidate.coverSignature)!).filter(Boolean);
  const scoringStartedAt = Date.now();
  const rankedCandidates = classificationList
    .map((classification, index) => {
      const features = computeV2FourExitMutationFeatures(state, currentCycle, classification, index);
      return features ? { candidate: classification.candidate, classification, features } : null;
    })
    .filter((ranked): ranked is RankedV2FourExitSnakeCandidate => ranked !== null)
    .sort(compareRankedV2FourExitSnakeCandidates);
  const scoringMs = Date.now() - scoringStartedAt;

  return {
    aggregate: summarizeV2FourExitSnakeDiagnostics(classificationList, rankedCandidates, state.appleNodeId !== null),
    classifications: classificationList,
    rankedCandidates,
    profile: {
      certificationMs,
      transitionSearchMs,
      scoringMs,
      nonImmediateCandidates,
      transitionCandidatesAfterPrefilter: classificationList.filter((classification) => classification.transitionSearchAttempted).length,
      transitionCandidatesSkippedByPrefilter: classificationList.filter((classification) => classification.transitionSkippedByPrefilter).length,
      transitionSearchesStarted: classificationList.filter((classification) => classification.transitionSearchAttempted).length,
      transitionSearchesSucceeded: classificationList.filter((classification) => classification.transitionReachable).length
    }
  };
}

export function computeV2FourExitMutationFeatures(
  state: GameState,
  currentCycle: HamiltonianCycle,
  classification: V2FourExitSnakeCandidateClassification,
  candidateIndex = 0
): V2FourExitMutationFeatures | null {
  if (!classification.usableForSnake || classification.usabilityMode === 'unusable') {
    return null;
  }

  const head = state.snake.segments[0] ?? null;
  const currentLockedCyclePathLen = head && state.appleNodeId
    ? distanceForwardOnCycle(head, state.appleNodeId, currentCycle)
    : null;
  const cycleFeatures = computeCycleFeatures(state, currentCycle, classification.candidate.cycle);
  const cycleScore = scoreCycleFeatures(cycleFeatures);
  const candidatePathLenToApple = classification.usabilityMode === 'immediate-locked' ? cycleFeatures.pathLen : null;
  const transitionPathLength = classification.usabilityMode === 'transition-valid'
    ? classification.transitionPathLength
    : null;
  const candidatePathMetric = classification.usabilityMode === 'immediate-locked'
    ? candidatePathLenToApple
    : transitionPathLength;
  const pathLenImprovement = currentLockedCyclePathLen !== null && candidatePathMetric !== null
    ? currentLockedCyclePathLen - candidatePathMetric
    : null;
  const patchId = patchIdForRect(classification.candidate.rect);
  const features: Omit<V2FourExitMutationFeatures, 'finalV2MutationScore'> = {
    candidateId: `${patchId}:v2-${candidateIndex}:${shortSignature(classification.candidate.coverSignature)}`,
    patchId,
    usabilityMode: classification.usabilityMode,
    currentLockedCyclePathLen,
    candidatePathLenToApple,
    transitionPathLength,
    pathLenImprovement,
    changedCycleEdges: cycleFeatures.repairDistanceFromOldCycle,
    rectangleArea: classification.candidate.rect.width * classification.candidate.rect.height,
    cycleScore,
    cycleFeatures
  };

  return {
    ...features,
    finalV2MutationScore: scoreV2FourExitMutationCandidate(features)
  };
}

export function scoreV2FourExitMutationCandidate(
  features: Omit<V2FourExitMutationFeatures, 'finalV2MutationScore'> | V2FourExitMutationFeatures
): number {
  const improvement = features.pathLenImprovement ?? -1_000;
  const modeBonus = features.usabilityMode === 'immediate-locked' ? 10 : 0;
  const transitionPenalty = features.transitionPathLength ?? 0;
  const cycleScorePenalty = features.cycleScore === null ? 0 : features.cycleScore * 0.001;

  return (
    improvement * 1_000 +
    modeBonus -
    transitionPenalty * 5 -
    features.changedCycleEdges * 2 -
    features.rectangleArea -
    cycleScorePenalty
  );
}

export function compareV2FourExitMutationFeaturesForRanking(
  left: V2FourExitMutationFeatures,
  right: V2FourExitMutationFeatures
): number {
  const leftImprovement = left.pathLenImprovement ?? Number.NEGATIVE_INFINITY;
  const rightImprovement = right.pathLenImprovement ?? Number.NEGATIVE_INFINITY;
  const leftPositive = leftImprovement > 0;
  const rightPositive = rightImprovement > 0;

  if (leftPositive !== rightPositive) {
    return leftPositive ? -1 : 1;
  }
  if (leftImprovement !== rightImprovement) {
    return rightImprovement - leftImprovement;
  }
  if (left.usabilityMode !== right.usabilityMode) {
    return left.usabilityMode === 'immediate-locked' ? -1 : 1;
  }

  const leftTransitionLength = left.transitionPathLength ?? Number.POSITIVE_INFINITY;
  const rightTransitionLength = right.transitionPathLength ?? Number.POSITIVE_INFINITY;
  if (leftTransitionLength !== rightTransitionLength) {
    return leftTransitionLength - rightTransitionLength;
  }

  if (left.changedCycleEdges !== right.changedCycleEdges) {
    return left.changedCycleEdges - right.changedCycleEdges;
  }
  if (left.rectangleArea !== right.rectangleArea) {
    return left.rectangleArea - right.rectangleArea;
  }
  if (left.finalV2MutationScore !== right.finalV2MutationScore) {
    return right.finalV2MutationScore - left.finalV2MutationScore;
  }

  return left.candidateId.localeCompare(right.candidateId);
}

function buildV2CheapTransitionFeatures(
  state: GameState,
  currentCycle: HamiltonianCycle,
  candidate: V2FourExitSpliceCandidate
): V2FourExitCheapTransitionFeatures | null {
  const head = state.snake.segments[0] ?? null;
  const apple = state.appleNodeId;
  if (!head || !apple) {
    return null;
  }

  const currentPathLen = currentCycle.length > 0
    ? distanceForwardOnCycle(head, apple, currentCycle)
    : null;
  const candidatePathLenIfLocked = distanceForwardOnCycle(head, apple, candidate.cycle);
  const pathLenImprovementEstimate = currentPathLen !== null && candidatePathLenIfLocked !== null
    ? currentPathLen - candidatePathLenIfLocked
    : null;
  const changedCycleEdges = computeCheapV2ChangedEdges(currentCycle, candidate.cycle);
  const rectangleArea = candidate.rect.width * candidate.rect.height;
  const bodyOrderCompatibilityScore = computeV2BodyOrderCompatibilityScore(state.snake.segments, candidate.cycle);
  const bodyOrderMismatchCount = Math.max(0, state.snake.segments.length - 1 - bodyOrderCompatibilityScore);
  const nextOnCycleHeadOccupied = computeV2NextOnCycleHeadOccupied(state.snake.segments, candidate.cycle);
  const nearLockedCertificate =
    nextOnCycleHeadOccupied === false &&
    bodyOrderMismatchCount <= Math.min(2, Math.max(0, state.snake.segments.length - 1));
  const arcRelevance = computeV2RectArcRelevance(state, currentCycle, candidate.rect);
  const cheapTransitionScore =
    (pathLenImprovementEstimate ?? -1_000) * 1_000 +
    bodyOrderCompatibilityScore * 25 -
    bodyOrderMismatchCount * 40 +
    (nearLockedCertificate ? 250 : 0) +
    (nextOnCycleHeadOccupied ? -1_000 : 0) +
    (arcRelevance ?? 0) * 100 -
    changedCycleEdges * 2 -
    rectangleArea;

  return {
    source: 'v2',
    candidatePathLenIfLocked,
    pathLenImprovementEstimate,
    changedCycleEdges,
    rectangleArea,
    arcRelevance,
    bodyOrderCompatibilityScore,
    bodyOrderMismatchCount,
    nextOnCycleHeadOccupied,
    nearLockedCertificate,
    cheapTransitionScore
  };
}

function selectV2TransitionCandidatesForSearch(
  candidates: ReadonlyArray<{
    candidate: V2FourExitSpliceCandidate;
    cheapTransitionFeatures: V2FourExitCheapTransitionFeatures | null;
    lockedCertificateValid: boolean;
    appleForwardValid: boolean;
  }>,
  options: V2FourExitSnakeClassificationOptions,
  immediateImprovingExists: boolean
) {
  if (candidates.length === 0) {
    return [];
  }
  if (immediateImprovingExists) {
    return [];
  }

  const mode = options.transitionPrefilterMode ?? 'none';
  const limit = resolveV2TransitionSearchLimit(options);
  if (mode === 'none' && !Number.isFinite(limit)) {
    return [...candidates];
  }

  const minimumImprovement = options.minCheapImprovementForTransitionSearch ?? Number.NEGATIVE_INFINITY;
  const eligible = candidates.filter((candidate) =>
    (candidate.cheapTransitionFeatures?.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY) >= minimumImprovement
  );

  if (mode === 'none') {
    return eligible.slice(0, limit);
  }

  return [...eligible]
    .sort((left, right) => compareV2CheapTransitionCandidates(left, right, mode))
    .slice(0, limit);
}

function compareV2CheapTransitionCandidates(
  left: {
    candidate: V2FourExitSpliceCandidate;
    cheapTransitionFeatures: V2FourExitCheapTransitionFeatures | null;
  },
  right: {
    candidate: V2FourExitSpliceCandidate;
    cheapTransitionFeatures: V2FourExitCheapTransitionFeatures | null;
  },
  mode: V2TransitionPrefilterMode
): number {
  const leftFeatures = left.cheapTransitionFeatures;
  const rightFeatures = right.cheapTransitionFeatures;
  if (!leftFeatures || !rightFeatures) {
    return left.candidate.coverSignature.localeCompare(right.candidate.coverSignature);
  }

  if (mode === 'body-order-compatibility') {
    const compatibilityDifference = rightFeatures.bodyOrderCompatibilityScore - leftFeatures.bodyOrderCompatibilityScore;
    if (compatibilityDifference !== 0) {
      return compatibilityDifference;
    }
    if (leftFeatures.bodyOrderMismatchCount !== rightFeatures.bodyOrderMismatchCount) {
      return leftFeatures.bodyOrderMismatchCount - rightFeatures.bodyOrderMismatchCount;
    }
    if (leftFeatures.nearLockedCertificate !== rightFeatures.nearLockedCertificate) {
      return leftFeatures.nearLockedCertificate ? -1 : 1;
    }
    if (leftFeatures.nextOnCycleHeadOccupied !== rightFeatures.nextOnCycleHeadOccupied) {
      return leftFeatures.nextOnCycleHeadOccupied ? 1 : -1;
    }
  }

  if (mode === 'cheap-score' || mode === 'combined') {
    if (leftFeatures.cheapTransitionScore !== rightFeatures.cheapTransitionScore) {
      return rightFeatures.cheapTransitionScore - leftFeatures.cheapTransitionScore;
    }
  }

  const leftImprovement = leftFeatures.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY;
  const rightImprovement = rightFeatures.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY;
  if (leftImprovement !== rightImprovement) {
    return rightImprovement - leftImprovement;
  }
  if (leftFeatures.changedCycleEdges !== rightFeatures.changedCycleEdges) {
    return leftFeatures.changedCycleEdges - rightFeatures.changedCycleEdges;
  }
  if (leftFeatures.rectangleArea !== rightFeatures.rectangleArea) {
    return leftFeatures.rectangleArea - rightFeatures.rectangleArea;
  }

  return left.candidate.coverSignature.localeCompare(right.candidate.coverSignature);
}

function resolveV2TransitionSearchLimit(options: V2FourExitSnakeClassificationOptions): number {
  const limits = [
    options.maxTransitionCandidatesPerPlanningEvent,
    options.maxTransitionSearchesPerSource
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (limits.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor(Math.min(...limits)));
}

function computeCheapV2ChangedEdges(currentCycle: HamiltonianCycle, candidateCycle: HamiltonianCycle): number {
  if (currentCycle.length === 0 || candidateCycle.length === 0) {
    return 0;
  }

  const currentEdges = buildV2DirectedCycleEdgeSet(currentCycle);
  const candidateEdges = buildV2DirectedCycleEdgeSet(candidateCycle);
  let changed = 0;
  for (const edge of currentEdges) {
    if (!candidateEdges.has(edge)) {
      changed += 1;
    }
  }
  for (const edge of candidateEdges) {
    if (!currentEdges.has(edge)) {
      changed += 1;
    }
  }
  return changed;
}

function buildV2DirectedCycleEdgeSet(cycle: HamiltonianCycle): Set<string> {
  const edges = new Set<string>();
  for (let index = 0; index < cycle.length; index += 1) {
    edges.add(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
  }
  return edges;
}

function computeV2BodyOrderCompatibilityScore(bodySegments: readonly NodeId[], cycle: HamiltonianCycle): number {
  const cycleIndexByNode = new Map<NodeId, number>();
  for (let index = 0; index < cycle.length; index += 1) {
    cycleIndexByNode.set(cycle[index]!, index);
  }

  let matches = 0;
  for (let index = bodySegments.length - 1; index >= 1; index -= 1) {
    const tailwardNode = bodySegments[index]!;
    const towardHeadNode = bodySegments[index - 1]!;
    const tailwardIndex = cycleIndexByNode.get(tailwardNode);
    const towardHeadIndex = cycleIndexByNode.get(towardHeadNode);
    if (tailwardIndex === undefined || towardHeadIndex === undefined) {
      continue;
    }
    if ((tailwardIndex + 1) % cycle.length === towardHeadIndex) {
      matches += 1;
    }
  }
  return matches;
}

function computeV2NextOnCycleHeadOccupied(bodySegments: readonly NodeId[], cycle: HamiltonianCycle): boolean | null {
  const head = bodySegments[0] ?? null;
  if (!head || cycle.length === 0) {
    return null;
  }

  const headIndex = cycle.indexOf(head);
  if (headIndex === -1) {
    return null;
  }

  const nextNode = cycle[(headIndex + 1) % cycle.length] ?? null;
  return nextNode ? bodySegments.includes(nextNode) : null;
}

function computeV2RectArcRelevance(
  state: GameState,
  currentCycle: HamiltonianCycle,
  rect: RectanglePatchRect
): number | null {
  const head = state.snake.segments[0] ?? null;
  const apple = state.appleNodeId;
  if (!head || !apple || currentCycle.length === 0) {
    return null;
  }

  const arcNodeIds = collectV2ForwardArcNodeIds(head, apple, currentCycle);
  if (arcNodeIds.length === 0) {
    return null;
  }

  let insideCount = 0;
  for (const nodeId of arcNodeIds) {
    const node = state.map.graph.nodes.find((graphNode) => graphNode.id === nodeId);
    if (
      node &&
      node.x >= rect.x &&
      node.x < rect.x + rect.width &&
      node.y >= rect.y &&
      node.y < rect.y + rect.height
    ) {
      insideCount += 1;
    }
  }
  return insideCount / arcNodeIds.length;
}

function collectV2ForwardArcNodeIds(head: NodeId, apple: NodeId, cycle: HamiltonianCycle): NodeId[] {
  const headIndex = cycle.indexOf(head);
  const appleIndex = cycle.indexOf(apple);
  if (headIndex === -1 || appleIndex === -1) {
    return [];
  }

  const nodeIds: NodeId[] = [];
  let index = headIndex;
  for (let steps = 0; steps < cycle.length; steps += 1) {
    const nodeId = cycle[index]!;
    nodeIds.push(nodeId);
    if (nodeId === apple) {
      break;
    }
    index = (index + 1) % cycle.length;
  }

  return nodeIds;
}

function resolveSamePairingPathCoverOptions(
  options: SamePairing4ExitPathCoverOptions
): ResolvedSamePairing4ExitPathCoverOptions {
  return {
    ...DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS,
    maxPatchArea4Exit: options.maxPatchArea4Exit ?? DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS.maxPatchArea4Exit,
    maxCoversPerPatch: options.maxCoversPerPatch ?? DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS.maxCoversPerPatch,
    maxSolverExpansionsPerPatch:
      options.maxSolverExpansionsPerPatch ?? DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS.maxSolverExpansionsPerPatch
  };
}

function createEmptyPathCoverDiagnostics(
  rect: RectanglePatchRect,
  terminalPairs: FourExitTerminalPair[]
): SamePairing4ExitPathCoverDiagnostics {
  return {
    rect,
    terminalPairs,
    attempted: false,
    solverExpansions: 0,
    budgetExhausted: false,
    coversFound: 0,
    noOpCoversSkipped: 0,
    duplicateCoversSkipped: 0,
    rejectionReason: 'not-valid-four-exit-decomposition',
    covers: []
  };
}

function createEmptyPathCoverAggregateDiagnostics(
  validFourExitDecompositions: number
): SamePairing4ExitPathCoverAggregateDiagnostics {
  return {
    validFourExitDecompositions,
    patchesAttempted: 0,
    pathCoversFound: 0,
    patchesWithAlternativeCovers: 0,
    budgetExhaustedPatches: 0,
    noOpCoversSkipped: 0,
    duplicateCoversSkipped: 0,
    topFailureReasons: []
  };
}

function createEmptyV2FourExitSpliceAggregateDiagnostics(
  validFourExitDecompositions: number
): V2FourExitSpliceAggregateDiagnostics {
  return {
    validFourExitDecompositions,
    alternativeCoversConsidered: 0,
    rawCandidatesGenerated: 0,
    degreeInvalidCandidates: 0,
    subtourCandidates: 0,
    nodeSetMismatchCandidates: 0,
    graphValidCandidates: 0,
    graphInvalidCandidates: 0,
    duplicateCandidatesSkipped: 0,
    topRejectionReasons: []
  };
}

function createV2FourExitSpliceCandidateDiagnostics(
  patch: MultiTerminalPatchRectDiagnostics,
  coverSignature: string,
  edgeSetDegreeValid: boolean,
  reconstructedSingleCycle: boolean,
  nodeSetMatchesOldCycle: boolean
): V2FourExitSpliceCandidateDiagnostics {
  return {
    rect: patch.rect,
    terminalPairs: patch.fourExitDecomposition?.terminalPairs ?? [],
    coverSignature,
    edgeSetDegreeValid,
    reconstructedSingleCycle,
    nodeSetMatchesOldCycle,
    graphValid: false,
    duplicateCandidate: false,
    rejectionReason: 'graph-invalid'
  };
}

function spliceMultiTerminalSamePairingCoverByEdgesDetailed(
  graph: GraphSnapshot,
  oldCycle: HamiltonianCycle,
  patch: MultiTerminalPatchRectDiagnostics,
  cover: SamePairingPathCover
): V2FourExitSpliceDetailedResult {
  if (!validateSamePairingPathCover(patch, graph, cover)) {
    return {
      candidateCycle: null,
      edgeSetDegreeValid: false,
      reconstructedSingleCycle: false,
      nodeSetMatchesOldCycle: false
    };
  }

  const rectNodeSet = buildRectNodeSet(graph, patch.rect);
  const oldEdges = cycleUndirectedEdges(oldCycle);
  const edgeByKey = new Map(oldEdges.map((edge) => [undirectedEdgeKey(edge.a, edge.b), edge]));

  for (const internalEdge of extractInsideCycleEdges(oldCycle, rectNodeSet)) {
    edgeByKey.delete(undirectedEdgeKey(internalEdge.from, internalEdge.to));
  }

  for (const replacementEdge of pathCoverUndirectedEdges(cover)) {
    edgeByKey.set(undirectedEdgeKey(replacementEdge.a, replacementEdge.b), replacementEdge);
  }

  const replacementEdges = [...edgeByKey.values()];
  const expectedNodes = new Set(oldCycle);
  const edgeSetDegreeValid = hasDegreeTwoForExactlyNodes(replacementEdges, expectedNodes);
  if (!edgeSetDegreeValid) {
    return {
      candidateCycle: null,
      edgeSetDegreeValid,
      reconstructedSingleCycle: false,
      nodeSetMatchesOldCycle: false
    };
  }

  const candidateCycle = reconstructCycleFromDegreeTwoEdges(replacementEdges, oldCycle[0]);
  const reconstructedSingleCycle = candidateCycle !== null;
  const nodeSetMatchesOldCycle = candidateCycle !== null && sameNodeSet(candidateCycle, oldCycle);

  return {
    candidateCycle: nodeSetMatchesOldCycle ? candidateCycle : null,
    edgeSetDegreeValid,
    reconstructedSingleCycle,
    nodeSetMatchesOldCycle
  };
}

function cycleUndirectedEdges(cycle: readonly NodeId[]): UndirectedCycleEdge[] {
  const edges: UndirectedCycleEdge[] = [];

  for (let index = 0; index < cycle.length; index += 1) {
    edges.push(normalizeUndirectedEdge(cycle[index]!, cycle[(index + 1) % cycle.length]!));
  }

  return edges;
}

function pathCoverUndirectedEdges(cover: SamePairingPathCover): UndirectedCycleEdge[] {
  const edges: UndirectedCycleEdge[] = [];

  for (const path of cover.paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      edges.push(normalizeUndirectedEdge(path[index]!, path[index + 1]!));
    }
  }

  return edges;
}

function normalizeUndirectedEdge(a: NodeId, b: NodeId): UndirectedCycleEdge {
  return a <= b ? { a, b } : { a: b, b: a };
}

function undirectedEdgeKey(a: NodeId, b: NodeId): string {
  const edge = normalizeUndirectedEdge(a, b);
  return `${edge.a}--${edge.b}`;
}

function buildUndirectedAdjacency(
  edges: readonly UndirectedCycleEdge[]
): Map<NodeId, Set<NodeId>> {
  const adjacency = new Map<NodeId, Set<NodeId>>();

  for (const edge of edges) {
    if (edge.a === edge.b) {
      adjacency.set(edge.a, adjacency.get(edge.a) ?? new Set<NodeId>());
      continue;
    }

    if (!adjacency.has(edge.a)) {
      adjacency.set(edge.a, new Set<NodeId>());
    }
    if (!adjacency.has(edge.b)) {
      adjacency.set(edge.b, new Set<NodeId>());
    }
    adjacency.get(edge.a)?.add(edge.b);
    adjacency.get(edge.b)?.add(edge.a);
  }

  return adjacency;
}

function hasDegreeTwoForExactlyNodes(
  edges: readonly UndirectedCycleEdge[],
  expectedNodes: ReadonlySet<NodeId>
): boolean {
  const adjacency = buildUndirectedAdjacency(edges);

  if (adjacency.size !== expectedNodes.size) {
    return false;
  }

  for (const nodeId of expectedNodes) {
    if ((adjacency.get(nodeId)?.size ?? 0) !== 2) {
      return false;
    }
  }

  return [...adjacency.keys()].every((nodeId) => expectedNodes.has(nodeId));
}

function cycleUndirectedEdgeSignature(cycle: readonly NodeId[]): string {
  return cycleUndirectedEdges(cycle)
    .map((edge) => undirectedEdgeKey(edge.a, edge.b))
    .sort()
    .join('|');
}

function sameNodeSet(left: readonly NodeId[], right: readonly NodeId[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length || leftSet.size !== rightSet.size) {
    return false;
  }

  return [...leftSet].every((nodeId) => rightSet.has(nodeId));
}

function rectKey(rect: RectanglePatchRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function recordV2FourExitSpliceDiagnostic(
  diagnostics: V2FourExitSpliceCandidateDiagnostics[],
  reasonCounts: Map<V2FourExitSpliceCandidateRejectionReason, number>,
  diagnostic: V2FourExitSpliceCandidateDiagnostics
): void {
  diagnostics.push(diagnostic);
  reasonCounts.set(diagnostic.rejectionReason, (reasonCounts.get(diagnostic.rejectionReason) ?? 0) + 1);
}

function createV2SnakeClassification(
  overrides: Partial<V2FourExitSnakeClassification> & { reason: V2FourExitSnakeClassificationReason }
): V2FourExitSnakeClassification {
  return {
    graphValid: false,
    lockedCertificateValid: false,
    appleForwardValid: false,
    immediateLocked: false,
    transitionReachable: false,
    transitionPathLength: null,
    transitionPlanSummary: null,
    cheapTransitionFeatures: null,
    transitionSearchAttempted: false,
    transitionSkippedByPrefilter: false,
    usableForSnake: false,
    usabilityMode: 'unusable',
    ...overrides
  };
}

function summarizeV2FourExitSnakeDiagnostics(
  classifications: readonly V2FourExitSnakeCandidateClassification[],
  rankedCandidates: readonly RankedV2FourExitSnakeCandidate[],
  hasApple: boolean
): V2FourExitSnakeAggregateDiagnostics {
  const aggregate = createEmptyV2FourExitSnakeAggregateDiagnostics();
  const reasonCounts = new Map<V2FourExitSnakeClassificationReason, number>();
  const improvingValues: number[] = [];

  for (const classification of classifications) {
    incrementV2SnakeReason(reasonCounts, classification.reason);
    if (classification.graphValid) {
      aggregate.graphValidCandidates += 1;
    }
    if (classification.immediateLocked) {
      aggregate.immediateLockedCandidates += 1;
    }
    if (classification.graphValid && !(classification.immediateLocked && classification.appleForwardValid) && hasApple) {
      aggregate.nonImmediateCandidates += 1;
    }
    if (classification.transitionSearchAttempted) {
      aggregate.transitionCandidatesAfterPrefilter += 1;
      aggregate.transitionSearchesStarted += 1;
    }
    if (classification.transitionSkippedByPrefilter) {
      aggregate.transitionCandidatesSkippedByPrefilter += 1;
    }
    if (classification.transitionReachable) {
      aggregate.transitionReachableCandidates += 1;
      aggregate.transitionSearchesSucceeded += 1;
    }
    if (classification.usableForSnake) {
      aggregate.snakeUsableCandidates += 1;
    }
    if (classification.graphValid && !classification.lockedCertificateValid) {
      aggregate.rejectedByLockedCertificate += 1;
    }
    if (classification.graphValid && classification.lockedCertificateValid && !classification.appleForwardValid && hasApple) {
      aggregate.rejectedByAppleForward += 1;
    }
    if (
      classification.graphValid &&
      !classification.usableForSnake &&
      hasApple &&
      classification.reason !== 'immediate-locked-apple-forward-failed'
    ) {
      aggregate.rejectedByTransitionSearch += 1;
    }
  }

  for (const ranked of rankedCandidates) {
    const improvement = ranked.features.pathLenImprovement;
    if (improvement !== null && improvement > 0) {
      aggregate.improvingCandidates += 1;
      improvingValues.push(improvement);
    }
  }

  aggregate.bestCandidate = rankedCandidates[0]?.features ?? null;
  aggregate.bestImprovement = improvingValues.length > 0 ? Math.max(...improvingValues) : null;
  aggregate.averageImprovement = improvingValues.length > 0
    ? improvingValues.reduce((total, value) => total + value, 0) / improvingValues.length
    : null;
  aggregate.topRejectionReasons = topV2SnakeReasons(reasonCounts);

  return aggregate;
}

function createEmptyV2FourExitSnakeAggregateDiagnostics(): V2FourExitSnakeAggregateDiagnostics {
  return {
    graphValidCandidates: 0,
    immediateLockedCandidates: 0,
    nonImmediateCandidates: 0,
    transitionCandidatesAfterPrefilter: 0,
    transitionCandidatesSkippedByPrefilter: 0,
    transitionSearchesStarted: 0,
    transitionSearchesSucceeded: 0,
    transitionReachableCandidates: 0,
    snakeUsableCandidates: 0,
    improvingCandidates: 0,
    bestImprovement: null,
    averageImprovement: null,
    bestCandidate: null,
    rejectedByLockedCertificate: 0,
    rejectedByAppleForward: 0,
    rejectedByTransitionSearch: 0,
    prefilterRejectedButWouldHaveSucceeded: null,
    topRejectionReasons: []
  };
}

function compareRankedV2FourExitSnakeCandidates(
  left: RankedV2FourExitSnakeCandidate,
  right: RankedV2FourExitSnakeCandidate
): number {
  return compareV2FourExitMutationFeaturesForRanking(left.features, right.features);
}

function v2CandidateIdForTransition(coverSignature: string): string {
  return `v2-four-exit-${shortSignature(coverSignature)}`;
}

function patchIdForRect(rect: RectanglePatchRect): string {
  return `rect-${rect.x}-${rect.y}-${rect.width}x${rect.height}`;
}

function shortSignature(signature: string): string {
  let hash = 0;
  for (let index = 0; index < signature.length; index += 1) {
    hash = ((hash * 31) + signature.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function buildRectangleGridAdjacency(
  graph: GraphSnapshot,
  rect: RectanglePatchRect
): Map<NodeId, Set<NodeId>> {
  const nodeByCoord = new Map(graph.nodes.map((node) => [`${node.x},${node.y}`, node]));
  const adjacency = new Map<NodeId, Set<NodeId>>();

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const node = nodeByCoord.get(`${x},${y}`);
      if (!node) {
        continue;
      }

      const neighbors = new Set<NodeId>();
      const neighborCoords: Array<[number, number]> = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (const [nx, ny] of neighborCoords) {
        const neighbor = nodeByCoord.get(`${nx},${ny}`);
        if (
          neighbor &&
          nx >= rect.x &&
          nx < rect.x + rect.width &&
          ny >= rect.y &&
          ny < rect.y + rect.height
        ) {
          neighbors.add(neighbor.id);
        }
      }
      adjacency.set(node.id, neighbors);
    }
  }

  return adjacency;
}

function orderedGridNeighbors(
  current: NodeId,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>,
  visited: ReadonlySet<NodeId>,
  end: NodeId,
  requiredFinalSize?: number
): NodeId[] {
  return [...(adjacency.get(current) ?? [])]
    .filter((nodeId) => !visited.has(nodeId))
    .filter((nodeId) => requiredFinalSize === undefined || nodeId !== end || visited.size + 1 === requiredFinalSize)
    .sort((left, right) => {
      const leftDegree = onwardDegree(left, adjacency, visited);
      const rightDegree = onwardDegree(right, adjacency, visited);
      return leftDegree - rightDegree || left.localeCompare(right);
    });
}

function onwardDegree(
  nodeId: NodeId,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>,
  visited: ReadonlySet<NodeId>
): number {
  return [...(adjacency.get(nodeId) ?? [])].filter((neighbor) => !visited.has(neighbor)).length;
}

function findHamiltonPathsThroughRemaining(
  start: NodeId,
  end: NodeId,
  remaining: ReadonlySet<NodeId>,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>,
  context: PathSearchContext,
  maxExpansions: number,
  maxPaths: number
): NodeId[][] {
  if (
    maxPaths <= 0 ||
    !remaining.has(start) ||
    !remaining.has(end) ||
    !isConnectedWithinAllowed(start, end, remaining, adjacency)
  ) {
    return [];
  }

  const paths: NodeId[][] = [];
  const visited = new Set<NodeId>([start]);
  const path = [start];

  const dfs = (current: NodeId): void => {
    if (paths.length >= maxPaths || context.budgetExhausted) {
      return;
    }

    if (!consumeExpansion(context, maxExpansions)) {
      return;
    }

    if (current === end) {
      if (visited.size === remaining.size) {
        paths.push([...path]);
      }
      return;
    }

    for (const next of orderedGridNeighbors(current, adjacency, visited, end, remaining.size)) {
      if (!remaining.has(next)) {
        continue;
      }

      visited.add(next);
      path.push(next);

      const unvisited = new Set([...remaining].filter((nodeId) => !visited.has(nodeId)));
      const shouldContinue = next === end ||
        unvisited.size === 0 ||
        canStillReachEndFrom(next, end, unvisited, adjacency);

      if (shouldContinue) {
        dfs(next);
      }

      path.pop();
      visited.delete(next);

      if (paths.length >= maxPaths || context.budgetExhausted) {
        break;
      }
    }
  };

  dfs(start);
  return paths;
}

function canStillConnectSecondPair(
  remaining: ReadonlySet<NodeId>,
  pair: FourExitTerminalPair,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): boolean {
  return remaining.has(pair.terminalA) &&
    remaining.has(pair.terminalB) &&
    isConnectedWithinAllowed(pair.terminalA, pair.terminalB, remaining, adjacency);
}

function canStillReachEndFrom(
  current: NodeId,
  end: NodeId,
  unvisited: ReadonlySet<NodeId>,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): boolean {
  const allowed = new Set(unvisited);
  allowed.add(current);
  return allowed.has(end) && isConnectedWithinAllowed(current, end, allowed, adjacency);
}

function isConnectedWithinAllowed(
  start: NodeId,
  end: NodeId,
  allowed: ReadonlySet<NodeId>,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): boolean {
  if (!allowed.has(start) || !allowed.has(end)) {
    return false;
  }

  const stack = [start];
  const seen = new Set<NodeId>();

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (seen.has(nodeId)) {
      continue;
    }

    seen.add(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (allowed.has(neighbor) && !seen.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return [...allowed].every((nodeId) => seen.has(nodeId));
}

function consumeExpansion(context: PathSearchContext, maxExpansions: number): boolean {
  if (context.expansions >= maxExpansions) {
    context.budgetExhausted = true;
    return false;
  }

  context.expansions += 1;
  return true;
}

function areAdjacentInGrid(
  from: NodeId,
  to: NodeId,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): boolean {
  return adjacency.get(from)?.has(to) ?? false;
}

function originalCoverSignature(patch: MultiTerminalPatchRectDiagnostics): string {
  const paths = patch.fourExitDecomposition?.terminalPairs.map((pair) => pair.originalPath) ?? [];
  return edgeSignatureForPaths(paths);
}

function edgeSignatureForPaths(paths: readonly (readonly NodeId[])[]): string {
  const edges: string[] = [];

  for (const path of paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      edges.push([path[index]!, path[index + 1]!].sort().join('--'));
    }
  }

  return edges.sort().join('|');
}

function createBasePatchDiagnostics(
  rect: RectanglePatchRect,
  vertexCount: number,
  fullRectangle: boolean
): Omit<MultiTerminalPatchRectDiagnostics, 'rejectionReason'> {
  return {
    rect,
    vertexCount,
    fullRectangle,
    crossingCount: 0,
    terminals: [],
    repeatedTerminalCount: 0,
    exitClass: 'other',
    fourExitDecomposition: null
  };
}

function classifyExitCount(crossingCount: number): MultiTerminalPatchExitClass {
  switch (crossingCount) {
    case 2:
      return 'two';
    case 4:
      return 'four';
    case 6:
      return 'six';
    case 8:
      return 'eight';
    default:
      return 'other';
  }
}

function buildRectNodeSet(graph: GraphSnapshot, rect: RectanglePatchRect): Set<NodeId> {
  const nodeByCoord = new Map(graph.nodes.map((node) => [`${node.x},${node.y}`, node.id]));
  const nodeSet = new Set<NodeId>();

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const nodeId = nodeByCoord.get(`${x},${y}`);
      if (nodeId) {
        nodeSet.add(nodeId);
      }
    }
  }

  return nodeSet;
}

function calculateInternalDegrees(
  rectNodeSet: ReadonlySet<NodeId>,
  internalEdges: readonly InsideCycleEdge[]
): Map<NodeId, number> {
  const degrees = zeroDegreeMap(rectNodeSet);

  for (const edge of internalEdges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }

  return degrees;
}

function calculateCutDegrees(
  rectNodeSet: ReadonlySet<NodeId>,
  crossingEdges: readonly CycleCutCrossing[]
): Map<NodeId, number> {
  const degrees = zeroDegreeMap(rectNodeSet);

  for (const crossing of crossingEdges) {
    degrees.set(crossing.insideNode, (degrees.get(crossing.insideNode) ?? 0) + 1);
  }

  return degrees;
}

function zeroDegreeMap(rectNodeSet: ReadonlySet<NodeId>): Map<NodeId, number> {
  return new Map([...rectNodeSet].sort().map((nodeId) => [nodeId, 0]));
}

function hasValidCycleDegreeAccounting(
  rectNodeSet: ReadonlySet<NodeId>,
  internalDegree: ReadonlyMap<NodeId, number>,
  cutDegree: ReadonlyMap<NodeId, number>
): boolean {
  return [...rectNodeSet].every((nodeId) =>
    (internalDegree.get(nodeId) ?? 0) + (cutDegree.get(nodeId) ?? 0) === 2
  );
}

function hasExpectedTerminalInternalDegrees(
  terminalSet: ReadonlySet<NodeId>,
  internalDegree: ReadonlyMap<NodeId, number>
): boolean {
  return [...terminalSet].every((nodeId) => (internalDegree.get(nodeId) ?? 0) === 1);
}

function hasExpectedNonterminalInternalDegrees(
  rectNodeSet: ReadonlySet<NodeId>,
  terminalSet: ReadonlySet<NodeId>,
  internalDegree: ReadonlyMap<NodeId, number>
): boolean {
  return [...rectNodeSet]
    .filter((nodeId) => !terminalSet.has(nodeId))
    .every((nodeId) => (internalDegree.get(nodeId) ?? 0) === 2);
}

function buildInternalAdjacency(
  rectNodeSet: ReadonlySet<NodeId>,
  internalEdges: readonly InsideCycleEdge[]
): Map<NodeId, Set<NodeId>> {
  const adjacency = new Map([...rectNodeSet].sort().map((nodeId) => [nodeId, new Set<NodeId>()]));

  for (const edge of internalEdges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  return adjacency;
}

function connectedComponents(
  rectNodeSet: ReadonlySet<NodeId>,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>,
  terminalSet: ReadonlySet<NodeId>
): Component[] {
  const seen = new Set<NodeId>();
  const components: Component[] = [];

  for (const start of [...rectNodeSet].sort()) {
    if (seen.has(start)) {
      continue;
    }

    const stack = [start];
    const nodes: NodeId[] = [];
    let degreeSum = 0;
    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (seen.has(nodeId)) {
        continue;
      }

      seen.add(nodeId);
      nodes.push(nodeId);
      const neighbors = [...(adjacency.get(nodeId) ?? [])].sort();
      degreeSum += neighbors.length;
      for (const neighbor of neighbors) {
        if (!seen.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    nodes.sort();
    components.push({
      nodes,
      edgeCount: degreeSum / 2,
      terminalNodes: nodes.filter((nodeId) => terminalSet.has(nodeId)).sort()
    });
  }

  return components.sort((left, right) => left.nodes[0]!.localeCompare(right.nodes[0]!));
}

function isSimplePathComponent(
  component: Component,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): boolean {
  if (component.nodes.length < 2 || component.edgeCount !== component.nodes.length - 1) {
    return false;
  }

  const endpointCount = component.nodes.filter((nodeId) => (adjacency.get(nodeId)?.size ?? 0) === 1).length;
  const hasOnlyPathDegrees = component.nodes.every((nodeId) => {
    const degree = adjacency.get(nodeId)?.size ?? 0;
    return degree === 1 || degree === 2;
  });

  return endpointCount === 2 && hasOnlyPathDegrees;
}

function terminalPairFromComponent(
  component: Component,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): FourExitTerminalPair | null {
  const [terminalA, terminalB] = component.terminalNodes;
  if (!terminalA || !terminalB) {
    return null;
  }

  const orderedTerminals = [terminalA, terminalB].sort();
  const originalPath = walkPath(orderedTerminals[0]!, orderedTerminals[1]!, adjacency);
  if (!originalPath) {
    return null;
  }

  return {
    terminalA: orderedTerminals[0]!,
    terminalB: orderedTerminals[1]!,
    originalPath
  };
}

function walkPath(
  start: NodeId,
  end: NodeId,
  adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): NodeId[] | null {
  const path = [start];
  const seen = new Set<NodeId>([start]);
  let previous: NodeId | null = null;
  let current = start;

  while (current !== end) {
    const nextCandidates = [...(adjacency.get(current) ?? [])]
      .filter((nodeId) => nodeId !== previous)
      .sort();
    const next = nextCandidates.find((nodeId) => !seen.has(nodeId) || nodeId === end);

    if (!next) {
      return null;
    }

    previous = current;
    current = next;
    if (seen.has(current) && current !== end) {
      return null;
    }
    seen.add(current);
    path.push(current);
  }

  return path;
}

function compareTerminalPairs(left: FourExitTerminalPair, right: FourExitTerminalPair): number {
  return left.terminalA.localeCompare(right.terminalA) || left.terminalB.localeCompare(right.terminalB);
}

function degreeRecord(degrees: ReadonlyMap<NodeId, number>): Record<NodeId, number> {
  return Object.fromEntries([...degrees.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function hasPlausibleSixExitDegreePattern(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  rect: RectanglePatchRect
): boolean {
  const rectNodeSet = buildRectNodeSet(graph, rect);
  const crossings = getCycleCutCrossings(cycle, rectNodeSet);
  const internalDegree = calculateInternalDegrees(rectNodeSet, extractInsideCycleEdges(cycle, rectNodeSet));
  const cutDegree = calculateCutDegrees(rectNodeSet, crossings);
  const terminals = new Set(crossings.map((crossing) => crossing.insideNode));

  return crossings.length === 6 &&
    terminals.size === 6 &&
    hasValidCycleDegreeAccounting(rectNodeSet, internalDegree, cutDegree) &&
    hasExpectedTerminalInternalDegrees(terminals, internalDegree);
}

function applyRectangleScanBudget(rectangles: RectanglePatchRect[], maxPatchRectsScanned?: number): RectanglePatchRect[] {
  if (maxPatchRectsScanned === undefined || maxPatchRectsScanned >= rectangles.length) {
    return rectangles;
  }

  return rectangles.slice(0, Math.max(0, maxPatchRectsScanned));
}

function createEmptyAggregateDiagnostics(): MultiTerminalPatchAggregateDiagnostics {
  return {
    rectanglesScanned: 0,
    fullRectangles: 0,
    twoExitRectangles: 0,
    fourExitRectangles: 0,
    sixExitRectangles: 0,
    eightExitRectangles: 0,
    otherExitRectangles: 0,
    repeatedTerminalRectangles: 0,
    fourExitDecompositionAttempts: 0,
    validFourExitDecompositions: 0,
    invalidDegreeAccounting: 0,
    invalidTerminalDegree: 0,
    invalidNonterminalDegree: 0,
    invalidComponentCount: 0,
    invalidComponentPath: 0,
    componentsMissingVertices: 0,
    sixExitPlausibleDegreePattern: 0,
    eightExitCountOnly: 0,
    topRejectionReasons: []
  };
}

function incrementReason(
  counts: Map<MultiTerminalPatchRejectionReason, number>,
  reason: MultiTerminalPatchRejectionReason
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function topReasons(
  counts: ReadonlyMap<MultiTerminalPatchRejectionReason, number>
): MultiTerminalPatchReasonCount[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 8);
}

function incrementPathCoverReason(
  counts: Map<SamePairing4ExitPathCoverRejectionReason, number>,
  reason: SamePairing4ExitPathCoverRejectionReason
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function incrementV2SnakeReason(
  counts: Map<V2FourExitSnakeClassificationReason, number>,
  reason: V2FourExitSnakeClassificationReason
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function topPathCoverReasons(
  counts: ReadonlyMap<SamePairing4ExitPathCoverRejectionReason, number>
): SamePairing4ExitPathCoverReasonCount[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 8);
}

function topV2FourExitSpliceReasons(
  counts: ReadonlyMap<V2FourExitSpliceCandidateRejectionReason, number>
): V2FourExitSpliceCandidateReasonCount[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 8);
}

function topV2SnakeReasons(
  counts: ReadonlyMap<V2FourExitSnakeClassificationReason, number>
): V2FourExitSnakeClassificationReasonCount[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 8);
}
