import type { Direction, HamiltonianCycle, NodeId } from './types.js';
import {
  buildRectanglePathCache,
  localCoord,
  localIndex,
  type RectanglePathCache,
  type RectanglePathCacheOptions
} from './rectangle-path-cache.js';
import type { GraphSnapshot } from './types.js';
import { validateHamiltonianCycle } from './map-validator.js';
import { analyzeCertifiedTransitionTargets, type CertifiedTransitionDiagnosticsOptions } from './certified-transition-diagnostics.js';
import { appleForward, distanceForwardOnCycle, validLockedCertificate } from './hamiltonian-certificate.js';
import type { GameState } from './types.js';
import { computeCycleFeatures, scoreCycleFeatures, type CycleFeatures } from './cycle-scoring.js';

export type SpliceTwoTerminalPatchPathInput = {
  oldCycle: HamiltonianCycle;
  patchNodeSet: ReadonlySet<NodeId>;
  terminalA: NodeId;
  terminalB: NodeId;
  oldInternalPath: NodeId[];
  replacementInternalPath: NodeId[];
};

export type RectanglePatchRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RectanglePatchRejectionReason =
  | 'rectangle-not-full'
  | 'crossing-count-not-two'
  | 'missing-terminals'
  | 'invalid-internal-degree-pattern'
  | 'internal-path-not-connected'
  | 'internal-path-misses-vertices'
  | 'cache-miss'
  | 'no-alternative-path'
  | 'valid-patch';

export type CycleCutCrossing = {
  from: NodeId;
  to: NodeId;
  insideNode: NodeId;
  outsideNode: NodeId;
  cycleIndex: number;
};

export type InsideCycleEdge = {
  from: NodeId;
  to: NodeId;
  cycleIndex: number;
};

export type RectanglePatchTerminals = {
  terminalA: NodeId;
  terminalB: NodeId;
};

export type RectanglePatchDiagnostics = {
  rect: RectanglePatchRect;
  vertexCount: number;
  fullRectangle: boolean;
  crossingCount: number;
  crossingEdges: CycleCutCrossing[];
  terminals: RectanglePatchTerminals | null;
  internalDegreePatternValid: boolean;
  internalPathConnected: boolean;
  internalPathVisitsAllVertices: boolean;
  originalInsidePath: NodeId[] | null;
  cacheKey: string | null;
  alternativePathCount: number | null;
  rejectionReason: RectanglePatchRejectionReason;
};

export type RectanglePatchAggregateDiagnostics = {
  rectanglesScanned: number;
  fullRectangles: number;
  crossingCountNotTwo: number;
  exactlyTwoCrossingRectangles: number;
  invalidInternalDegreePattern: number;
  internalPathNotConnected: number;
  internalPathMissesVertices: number;
  cacheMisses: number;
  noAlternativePath: number;
  validPatches: number;
};

export type RectanglePatchScanDiagnostics = {
  aggregate: RectanglePatchAggregateDiagnostics;
  patches: RectanglePatchDiagnostics[];
};

export type RectanglePatchDetectionOptions = {
  maxWidth?: number;
  maxHeight?: number;
  maxArea?: number;
  maxPatchRectsScanned?: number;
  focusNodeIds?: NodeId[];
  focusPadding?: number;
  pathCacheOptions?: RectanglePathCacheOptions;
};

export type RectanglePatchMutationCandidateRejectionReason =
  | 'no-op-alternative'
  | 'splice-failed'
  | 'duplicate-candidate'
  | 'graph-invalid'
  | 'graph-valid';

export type RectanglePatchMutationCandidateDiagnostics = {
  rect: RectanglePatchRect;
  terminals: RectanglePatchTerminals;
  originalInsidePath: NodeId[];
  replacementInsidePath: NodeId[];
  rawCandidateGenerated: boolean;
  duplicateCandidate: boolean;
  graphValid: boolean;
  rejectionReason: RectanglePatchMutationCandidateRejectionReason;
};

export type RectanglePatchMutationCandidate = {
  cycle: HamiltonianCycle;
  rect: RectanglePatchRect;
  terminals: RectanglePatchTerminals;
  originalInsidePath: NodeId[];
  replacementInsidePath: NodeId[];
};

export type RectanglePatchMutationAggregateDiagnostics = {
  patchesScanned: number;
  validTwoTerminalPatches: number;
  alternativesConsidered: number;
  noOpAlternatives: number;
  rawCandidatesGenerated: number;
  duplicateCandidates: number;
  graphValidCandidates: number;
  graphInvalidCandidates: number;
  budgetExhausted: boolean;
};

export type RectanglePatchMutationGenerationResult = {
  aggregate: RectanglePatchMutationAggregateDiagnostics;
  patchDiagnostics: RectanglePatchDiagnostics[];
  candidateDiagnostics: RectanglePatchMutationCandidateDiagnostics[];
  candidates: RectanglePatchMutationCandidate[];
  profile: {
    generationMs: number;
  };
};

export type RectanglePatchMutationGenerationOptions = RectanglePatchDetectionOptions & {
  validateCycle?: (graph: GraphSnapshot, candidateCycle: HamiltonianCycle) => boolean;
  maxPatchCandidates?: number;
};

export type SnakePatchMutationClassificationReason =
  | 'graph-invalid'
  | 'immediate-locked-valid'
  | 'immediate-locked-valid-but-apple-forward-failed'
  | 'transition-valid'
  | 'locked-invalid-transition-not-found'
  | 'no-current-apple-for-transition'
  | 'no-certified-use';

export type SnakePatchMutationTransitionSummary = {
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

export type PatchMutationTransitionPrefilterMode =
  | 'none'
  | 'cheap-score'
  | 'body-order-compatibility'
  | 'combined';

export type PatchMutationCheapTransitionFeatures = {
  source: 'v1';
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

export type SnakePatchMutationClassification = {
  graphValid: boolean;
  immediateLockedCertificate: boolean;
  immediateAppleForward: boolean;
  transitionPlanExists: boolean;
  transitionPathLength: number | null;
  transitionPlanSummary: SnakePatchMutationTransitionSummary | null;
  cheapTransitionFeatures: PatchMutationCheapTransitionFeatures | null;
  transitionSearchAttempted: boolean;
  transitionSkippedByPrefilter: boolean;
  usableForSnake: boolean;
  reason: SnakePatchMutationClassificationReason;
};

export type SnakePatchMutationCandidateClassification = SnakePatchMutationClassification & {
  candidate: RectanglePatchMutationCandidate;
};

export type SnakePatchMutationClassificationAggregate = {
  graphValidCandidates: number;
  immediateLockedCandidates: number;
  immediateAppleForwardCandidates: number;
  nonImmediateCandidates: number;
  transitionCandidatesAfterPrefilter: number;
  transitionCandidatesSkippedByPrefilter: number;
  transitionSearchesStarted: number;
  transitionSearchesSucceeded: number;
  transitionReachableCandidates: number;
  usableCandidates: number;
  unusableCandidates: number;
  rejectedByLockedCertificate: number;
  rejectedByAppleForward: number;
  rejectedByTransitionSearch: number;
  noCurrentAppleForTransition: number;
  prefilterRejectedButWouldHaveSucceeded: number | null;
};

export type SnakePatchMutationClassificationResult = {
  mutationDiagnostics: RectanglePatchMutationGenerationResult;
  aggregate: SnakePatchMutationClassificationAggregate;
  classifications: SnakePatchMutationCandidateClassification[];
  profile: {
    certificationMs: number;
    transitionSearchMs: number;
    nonImmediateCandidates: number;
    transitionCandidatesAfterPrefilter: number;
    transitionCandidatesSkippedByPrefilter: number;
    transitionSearchesStarted: number;
    transitionSearchesSucceeded: number;
  };
};

export type SnakePatchMutationClassificationOptions = RectanglePatchMutationGenerationOptions & {
  transitionOptions?: CertifiedTransitionDiagnosticsOptions;
  transitionPrefilterMode?: PatchMutationTransitionPrefilterMode;
  maxTransitionCandidatesPerPlanningEvent?: number;
  minCheapImprovementForTransitionSearch?: number;
  preferImmediateLockedBeforeTransitionSearch?: boolean;
  maxTransitionSearchesPerSource?: number;
  minimumPathImprovement?: number;
};

export type PatchMutationUsabilityMode = 'immediate-locked' | 'transition-valid';

export type PatchMutationFeatures = {
  candidateId: string;
  patchId: string;
  usabilityMode: PatchMutationUsabilityMode;
  pathLenToCurrentApple: number | null;
  transitionPathLength: number | null;
  currentLockedCyclePathLen: number | null;
  pathLenImprovement: number | null;
  mutationSize: {
    changedCycleEdges: number;
    rectangleArea: number;
  };
  cycleScore: number | null;
  cycleFeatures: CycleFeatures | null;
  patchMutationScore: number;
};

export type RankedPatchMutationCandidate = {
  candidate: RectanglePatchMutationCandidate;
  classification: SnakePatchMutationCandidateClassification;
  features: PatchMutationFeatures;
};

export type PatchMutationRankingAggregateDiagnostics = {
  usableCandidates: number;
  improvingCandidates: number;
  bestImprovement: number | null;
  averageImprovement: number | null;
  bestCandidate: PatchMutationFeatures | null;
  immediateLockedImprovingCandidates: number;
  transitionImprovingCandidates: number;
  averageMutationSize: number | null;
  bestCandidateReason: string | null;
};

export type PatchMutationRankingResult = {
  classificationDiagnostics: SnakePatchMutationClassificationResult;
  aggregate: PatchMutationRankingAggregateDiagnostics;
  rankedCandidates: RankedPatchMutationCandidate[];
  profile: {
    certificationMs: number;
    transitionSearchMs: number;
    scoringMs: number;
  };
};

const DEFAULT_RECTANGLE_PATCH_DETECTION_OPTIONS: Required<Omit<RectanglePatchDetectionOptions, 'pathCacheOptions'>> = {
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 20,
  maxPatchRectsScanned: Number.POSITIVE_INFINITY,
  focusNodeIds: [],
  focusPadding: 0
};

export function sameNodeSet(pathA: readonly NodeId[], pathB: readonly NodeId[]): boolean {
  const setA = new Set(pathA);
  const setB = new Set(pathB);

  if (pathA.length !== pathB.length || setA.size !== pathA.length || setB.size !== pathB.length) {
    return false;
  }

  if (setA.size !== setB.size) {
    return false;
  }

  for (const nodeId of setA) {
    if (!setB.has(nodeId)) {
      return false;
    }
  }

  return true;
}

export function pathUsesExactlyPatch(path: readonly NodeId[], patchNodeSet: ReadonlySet<NodeId>): boolean {
  if (path.length !== patchNodeSet.size || path.length === 0) {
    return false;
  }

  const seen = new Set<NodeId>();

  for (const nodeId of path) {
    if (!patchNodeSet.has(nodeId) || seen.has(nodeId)) {
      return false;
    }
    seen.add(nodeId);
  }

  return seen.size === patchNodeSet.size;
}

export function extractCycleSegment(
  oldCycle: HamiltonianCycle,
  terminalA: NodeId,
  terminalB: NodeId,
  patchNodeSet: ReadonlySet<NodeId>
): NodeId[] | null {
  const indexA = oldCycle.indexOf(terminalA);
  const indexB = oldCycle.indexOf(terminalB);

  if (
    indexA < 0 ||
    indexB < 0 ||
    indexA === indexB ||
    !patchNodeSet.has(terminalA) ||
    !patchNodeSet.has(terminalB) ||
    new Set(oldCycle).size !== oldCycle.length
  ) {
    return null;
  }

  const candidates = [
    cycleSegmentInclusive(oldCycle, indexA, indexB),
    cycleSegmentInclusive(oldCycle, indexB, indexA)
  ].filter((segment) => pathUsesExactlyPatch(segment, patchNodeSet));

  return candidates.length === 1 ? candidates[0]! : null;
}

export function cycleSignature(cycle: readonly NodeId[]): string {
  return cycle.join('>');
}

export function enumerateRectangles(
  graph: GraphSnapshot,
  options: RectanglePatchDetectionOptions = {}
): RectanglePatchRect[] {
  const resolved = {
    ...DEFAULT_RECTANGLE_PATCH_DETECTION_OPTIONS,
    ...options
  };
  const bounds = graphBounds(graph);

  if (!bounds) {
    return [];
  }

  const rectangles: RectanglePatchRect[] = [];
  const focusedCoords = new Set(resolved.focusNodeIds.map((nodeId) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    return node ? `${node.x},${node.y}` : null;
  }).filter((value): value is string => value !== null));

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const maxWidthAtX = Math.min(resolved.maxWidth, bounds.maxX - x + 1);
      const maxHeightAtY = Math.min(resolved.maxHeight, bounds.maxY - y + 1);

      for (let height = 1; height <= maxHeightAtY; height += 1) {
        for (let width = 1; width <= maxWidthAtX; width += 1) {
          if (width * height > resolved.maxArea) {
            continue;
          }

          const rect = { x, y, width, height };
          if (focusedCoords.size > 0 && !rectangleTouchesFocus(rect, focusedCoords, resolved.focusPadding)) {
            continue;
          }

          rectangles.push(rect);
        }
      }
    }
  }

  return rectangles;
}

function rectangleTouchesFocus(rect: RectanglePatchRect, focusedCoords: ReadonlySet<string>, padding: number): boolean {
  const minX = rect.x - padding;
  const maxX = rect.x + rect.width - 1 + padding;
  const minY = rect.y - padding;
  const maxY = rect.y + rect.height - 1 + padding;

  for (const coordKey of focusedCoords) {
    const [xRaw, yRaw] = coordKey.split(',');
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return true;
    }
  }

  return false;
}

export function isFullRectangleInBoard(graph: GraphSnapshot, rect: RectanglePatchRect): boolean {
  return buildRectNodeSet(graph, rect).size === rect.width * rect.height;
}

export function getCycleCutCrossings(cycle: HamiltonianCycle, rectNodeSet: ReadonlySet<NodeId>): CycleCutCrossing[] {
  const crossings: CycleCutCrossing[] = [];

  for (let index = 0; index < cycle.length; index += 1) {
    const from = cycle[index]!;
    const to = cycle[(index + 1) % cycle.length]!;
    const fromInside = rectNodeSet.has(from);
    const toInside = rectNodeSet.has(to);

    if (fromInside === toInside) {
      continue;
    }

    crossings.push({
      from,
      to,
      insideNode: fromInside ? from : to,
      outsideNode: fromInside ? to : from,
      cycleIndex: index
    });
  }

  return crossings;
}

export function extractInsideCycleEdges(cycle: HamiltonianCycle, rectNodeSet: ReadonlySet<NodeId>): InsideCycleEdge[] {
  const edges: InsideCycleEdge[] = [];

  for (let index = 0; index < cycle.length; index += 1) {
    const from = cycle[index]!;
    const to = cycle[(index + 1) % cycle.length]!;

    if (rectNodeSet.has(from) && rectNodeSet.has(to)) {
      edges.push({ from, to, cycleIndex: index });
    }
  }

  return edges;
}

export function extractInsideCyclePath(
  cycle: HamiltonianCycle,
  rectNodeSet: ReadonlySet<NodeId>,
  terminalA: NodeId,
  terminalB: NodeId
): NodeId[] | null {
  return extractCycleSegment(cycle, terminalA, terminalB, rectNodeSet);
}

export function analyzeRectanglePatch(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  rect: RectanglePatchRect,
  rectanglePathCache: RectanglePathCache = buildRectanglePathCache()
): RectanglePatchDiagnostics {
  const rectNodeSet = buildRectNodeSet(graph, rect);
  const fullRectangle = rectNodeSet.size === rect.width * rect.height;
  const base: Omit<
    RectanglePatchDiagnostics,
    | 'crossingCount'
    | 'crossingEdges'
    | 'terminals'
    | 'internalDegreePatternValid'
    | 'internalPathConnected'
    | 'internalPathVisitsAllVertices'
    | 'originalInsidePath'
    | 'cacheKey'
    | 'alternativePathCount'
    | 'rejectionReason'
  > = {
    rect,
    vertexCount: rectNodeSet.size,
    fullRectangle
  };

  if (!fullRectangle) {
    return {
      ...base,
      crossingCount: 0,
      crossingEdges: [],
      terminals: null,
      internalDegreePatternValid: false,
      internalPathConnected: false,
      internalPathVisitsAllVertices: false,
      originalInsidePath: null,
      cacheKey: null,
      alternativePathCount: null,
      rejectionReason: 'rectangle-not-full'
    };
  }

  const crossingEdges = getCycleCutCrossings(cycle, rectNodeSet);
  if (crossingEdges.length !== 2) {
    return {
      ...base,
      crossingCount: crossingEdges.length,
      crossingEdges,
      terminals: null,
      internalDegreePatternValid: false,
      internalPathConnected: false,
      internalPathVisitsAllVertices: false,
      originalInsidePath: null,
      cacheKey: null,
      alternativePathCount: null,
      rejectionReason: 'crossing-count-not-two'
    };
  }

  const terminalSet = new Set(crossingEdges.map((edge) => edge.insideNode));
  if (terminalSet.size !== 2) {
    return {
      ...base,
      crossingCount: crossingEdges.length,
      crossingEdges,
      terminals: null,
      internalDegreePatternValid: false,
      internalPathConnected: false,
      internalPathVisitsAllVertices: false,
      originalInsidePath: null,
      cacheKey: null,
      alternativePathCount: null,
      rejectionReason: 'missing-terminals'
    };
  }

  const terminals = {
    terminalA: crossingEdges[0]!.insideNode,
    terminalB: crossingEdges[1]!.insideNode
  };
  const insideEdges = extractInsideCycleEdges(cycle, rectNodeSet);
  const internalDegreePatternValid = hasValidInternalDegreePattern(rectNodeSet, insideEdges, terminals);
  const internalPathConnected = insideEdgesConnectPatch(rectNodeSet, insideEdges, terminals.terminalA);
  const originalInsidePath = extractInsideCyclePath(cycle, rectNodeSet, terminals.terminalA, terminals.terminalB);
  const internalPathVisitsAllVertices = originalInsidePath !== null && pathUsesExactlyPatch(originalInsidePath, rectNodeSet);

  if (!internalDegreePatternValid) {
    return {
      ...base,
      crossingCount: crossingEdges.length,
      crossingEdges,
      terminals,
      internalDegreePatternValid,
      internalPathConnected,
      internalPathVisitsAllVertices,
      originalInsidePath,
      cacheKey: null,
      alternativePathCount: null,
      rejectionReason: 'invalid-internal-degree-pattern'
    };
  }

  if (!internalPathConnected) {
    return {
      ...base,
      crossingCount: crossingEdges.length,
      crossingEdges,
      terminals,
      internalDegreePatternValid,
      internalPathConnected,
      internalPathVisitsAllVertices,
      originalInsidePath,
      cacheKey: null,
      alternativePathCount: null,
      rejectionReason: 'internal-path-not-connected'
    };
  }

  if (!internalPathVisitsAllVertices || !originalInsidePath) {
    return {
      ...base,
      crossingCount: crossingEdges.length,
      crossingEdges,
      terminals,
      internalDegreePatternValid,
      internalPathConnected,
      internalPathVisitsAllVertices,
      originalInsidePath,
      cacheKey: null,
      alternativePathCount: null,
      rejectionReason: 'internal-path-misses-vertices'
    };
  }

  const startLocalIndex = localIndexForRectNode(graph, rect, originalInsidePath[0]!);
  const endLocalIndex = localIndexForRectNode(graph, rect, originalInsidePath[originalInsidePath.length - 1]!);
  const originalLocalPath = originalInsidePath.map((nodeId) => localIndexForRectNode(graph, rect, nodeId));
  const cacheKey = `${rect.width}x${rect.height}:${startLocalIndex}->${endLocalIndex}`;
  const cachedPaths = rectanglePathCache.getPaths(rect.width, rect.height, startLocalIndex, endLocalIndex);
  const cacheDiagnostics = rectanglePathCache.getLastDiagnostics();

  if (cacheDiagnostics?.unsupported) {
    return {
      ...base,
      crossingCount: crossingEdges.length,
      crossingEdges,
      terminals,
      internalDegreePatternValid,
      internalPathConnected,
      internalPathVisitsAllVertices,
      originalInsidePath,
      cacheKey,
      alternativePathCount: null,
      rejectionReason: 'cache-miss'
    };
  }

  const alternativePathCount = cachedPaths.filter((path) => !numberArraysEqual(path, originalLocalPath)).length;

  return {
    ...base,
    crossingCount: crossingEdges.length,
    crossingEdges,
    terminals,
    internalDegreePatternValid,
    internalPathConnected,
    internalPathVisitsAllVertices,
    originalInsidePath,
    cacheKey,
    alternativePathCount,
    rejectionReason: alternativePathCount > 0 ? 'valid-patch' : 'no-alternative-path'
  };
}

export function analyzeRectanglePatches(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: RectanglePatchDetectionOptions = {}
): RectanglePatchScanDiagnostics {
  const rectangles = applyRectangleScanBudget(enumerateRectangles(graph, options), options.maxPatchRectsScanned);
  const pathCache = buildRectanglePathCache(options.pathCacheOptions);
  const patches = rectangles.map((rect) => analyzeRectanglePatch(graph, cycle, rect, pathCache));
  const aggregate = createEmptyRectanglePatchAggregate();

  for (const patch of patches) {
    aggregate.rectanglesScanned += 1;

    if (patch.fullRectangle) {
      aggregate.fullRectangles += 1;
    }

    if (patch.crossingCount !== 2) {
      aggregate.crossingCountNotTwo += 1;
    } else {
      aggregate.exactlyTwoCrossingRectangles += 1;
    }

    switch (patch.rejectionReason) {
      case 'invalid-internal-degree-pattern':
        aggregate.invalidInternalDegreePattern += 1;
        break;
      case 'internal-path-not-connected':
        aggregate.internalPathNotConnected += 1;
        break;
      case 'internal-path-misses-vertices':
        aggregate.internalPathMissesVertices += 1;
        break;
      case 'cache-miss':
        aggregate.cacheMisses += 1;
        break;
      case 'no-alternative-path':
        aggregate.noAlternativePath += 1;
        break;
      case 'valid-patch':
        aggregate.validPatches += 1;
        break;
      case 'rectangle-not-full':
      case 'crossing-count-not-two':
      case 'missing-terminals':
        break;
    }
  }

  return {
    aggregate,
    patches
  };
}

export function generateRectanglePatchMutationCandidates(
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: RectanglePatchMutationGenerationOptions = {}
): RectanglePatchMutationGenerationResult {
  const startedAt = Date.now();
  const pathCache = buildRectanglePathCache(options.pathCacheOptions);
  const rectangles = enumerateRectangles(graph, options);
  const patchDiagnostics = applyRectangleScanBudget(rectangles, options.maxPatchRectsScanned)
    .map((rect) => analyzeRectanglePatch(graph, cycle, rect, pathCache));
  const aggregate = createEmptyRectanglePatchMutationAggregate();
  const candidateDiagnostics: RectanglePatchMutationCandidateDiagnostics[] = [];
  const candidates: RectanglePatchMutationCandidate[] = [];
  const seenCandidateSignatures = new Set<string>();
  const validateCycle = options.validateCycle ?? validateHamiltonianCycle;
  const maxPatchCandidates = options.maxPatchCandidates ?? Number.POSITIVE_INFINITY;

  aggregate.patchesScanned = patchDiagnostics.length;
  aggregate.budgetExhausted = rectangles.length > patchDiagnostics.length;

  patchLoop:
  for (const patch of patchDiagnostics) {
    if (
      patch.rejectionReason !== 'valid-patch' ||
      !patch.terminals ||
      !patch.originalInsidePath ||
      patch.alternativePathCount === null
    ) {
      continue;
    }

    aggregate.validTwoTerminalPatches += 1;
    const patchNodeSet = buildRectNodeSet(graph, patch.rect);
    const originalLocalPath = patch.originalInsidePath.map((nodeId) => localIndexForRectNode(graph, patch.rect, nodeId));
    const startLocalIndex = originalLocalPath[0]!;
    const endLocalIndex = originalLocalPath[originalLocalPath.length - 1]!;
    const cachedPaths = pathCache.getPaths(patch.rect.width, patch.rect.height, startLocalIndex, endLocalIndex);

    for (const localReplacementPath of cachedPaths) {
      if (candidates.length >= maxPatchCandidates) {
        aggregate.budgetExhausted = true;
        break patchLoop;
      }

      aggregate.alternativesConsidered += 1;
      const replacementInsidePath = globalPathFromLocalPath(graph, patch.rect, localReplacementPath);

      if (
        !replacementInsidePath ||
        numberArraysEqual(localReplacementPath, originalLocalPath) ||
        numberArraysEqual([...localReplacementPath].reverse(), originalLocalPath)
      ) {
        aggregate.noOpAlternatives += 1;
        candidateDiagnostics.push({
          rect: patch.rect,
          terminals: patch.terminals,
          originalInsidePath: patch.originalInsidePath,
          replacementInsidePath: replacementInsidePath ?? [],
          rawCandidateGenerated: false,
          duplicateCandidate: false,
          graphValid: false,
          rejectionReason: 'no-op-alternative'
        });
        continue;
      }

      const candidateCycle = spliceTwoTerminalPatchPath({
        oldCycle: cycle,
        patchNodeSet,
        terminalA: patch.terminals.terminalA,
        terminalB: patch.terminals.terminalB,
        oldInternalPath: patch.originalInsidePath,
        replacementInternalPath: replacementInsidePath
      });

      if (!candidateCycle) {
        candidateDiagnostics.push({
          rect: patch.rect,
          terminals: patch.terminals,
          originalInsidePath: patch.originalInsidePath,
          replacementInsidePath,
          rawCandidateGenerated: false,
          duplicateCandidate: false,
          graphValid: false,
          rejectionReason: 'splice-failed'
        });
        continue;
      }

      aggregate.rawCandidatesGenerated += 1;
      const graphValid = validateCycle(graph, candidateCycle);
      const candidateSignature = directedCycleEdgeSignature(candidateCycle);
      const duplicateCandidate = graphValid && seenCandidateSignatures.has(candidateSignature);

      if (!graphValid) {
        aggregate.graphInvalidCandidates += 1;
      } else if (duplicateCandidate) {
        aggregate.duplicateCandidates += 1;
      } else {
        aggregate.graphValidCandidates += 1;
        seenCandidateSignatures.add(candidateSignature);
        candidates.push({
          cycle: candidateCycle,
          rect: patch.rect,
          terminals: patch.terminals,
          originalInsidePath: patch.originalInsidePath,
          replacementInsidePath
        });
        if (candidates.length >= maxPatchCandidates) {
          aggregate.budgetExhausted = true;
        }
      }

      candidateDiagnostics.push({
        rect: patch.rect,
        terminals: patch.terminals,
        originalInsidePath: patch.originalInsidePath,
        replacementInsidePath,
        rawCandidateGenerated: true,
        duplicateCandidate,
        graphValid,
        rejectionReason: graphValid ? (duplicateCandidate ? 'duplicate-candidate' : 'graph-valid') : 'graph-invalid'
      });

      if (candidates.length >= maxPatchCandidates) {
        break patchLoop;
      }
    }
  }

  return {
    aggregate,
    patchDiagnostics,
    candidateDiagnostics,
    candidates,
    profile: {
      generationMs: Date.now() - startedAt
    }
  };
}

type TimedSnakePatchMutationClassification = SnakePatchMutationClassification & {
  transitionSearchMs: number;
};

type PendingPatchTransitionCandidate = {
  index: number;
  candidate: RectanglePatchMutationCandidate;
  immediateLockedCertificate: boolean;
  immediateAppleForward: boolean;
  cheapTransitionFeatures: PatchMutationCheapTransitionFeatures | null;
};

function classifyPatchMutationCandidateForSnakeWithTiming(
  state: GameState,
  candidate: Pick<RectanglePatchMutationCandidate, 'cycle'>,
  options: SnakePatchMutationClassificationOptions = {}
): TimedSnakePatchMutationClassification {
  const validateCycle = options.validateCycle ?? validateHamiltonianCycle;
  const graphValid = validateCycle(state.map.graph, candidate.cycle);

  if (!graphValid) {
    return {
      graphValid,
      immediateLockedCertificate: false,
      immediateAppleForward: false,
      transitionPlanExists: false,
      transitionPathLength: null,
      transitionPlanSummary: null,
      cheapTransitionFeatures: null,
      transitionSearchAttempted: false,
      transitionSkippedByPrefilter: false,
      usableForSnake: false,
      reason: 'graph-invalid',
      transitionSearchMs: 0
    };
  }

  const immediateLockedCertificate = validLockedCertificate(state.snake.segments, candidate.cycle);
  const immediateAppleForward = !state.appleNodeId || appleForward(state.snake.segments, state.appleNodeId, candidate.cycle);

  if (immediateLockedCertificate && immediateAppleForward) {
    return {
      graphValid,
      immediateLockedCertificate,
      immediateAppleForward,
      transitionPlanExists: false,
      transitionPathLength: null,
      transitionPlanSummary: null,
      cheapTransitionFeatures: null,
      transitionSearchAttempted: false,
      transitionSkippedByPrefilter: false,
      usableForSnake: true,
      reason: 'immediate-locked-valid',
      transitionSearchMs: 0
    };
  }

  if (!state.appleNodeId) {
    return {
      graphValid,
      immediateLockedCertificate,
      immediateAppleForward,
      transitionPlanExists: false,
      transitionPathLength: null,
      transitionPlanSummary: null,
      cheapTransitionFeatures: null,
      transitionSearchAttempted: false,
      transitionSkippedByPrefilter: false,
      usableForSnake: false,
      reason: 'no-current-apple-for-transition',
      transitionSearchMs: 0
    };
  }

  const targetCycleId = 'patch-mutation-candidate';
  const transitionSearchStartedAt = Date.now();
  const transitionDiagnostics = analyzeCertifiedTransitionTargets(
    state,
    {
      mapId: state.map.id,
      status: 'ready',
      entries: [{
        id: targetCycleId,
        cycle: candidate.cycle,
        source: 'solver',
        archetypeName: 'rectangle-patch-mutation',
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
  const transitionSearchMs = Date.now() - transitionSearchStartedAt;
  const target = transitionDiagnostics.targets[0] ?? null;
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
  const transitionPlanExists = (target?.successfulTransitionPaths ?? 0) > 0;

  if (transitionPlanExists) {
    return {
      graphValid,
      immediateLockedCertificate,
      immediateAppleForward,
      transitionPlanExists,
      transitionPathLength: target?.bestSuccessfulPathLength ?? null,
      transitionPlanSummary,
      cheapTransitionFeatures: null,
      transitionSearchAttempted: true,
      transitionSkippedByPrefilter: false,
      usableForSnake: true,
      reason: 'transition-valid',
      transitionSearchMs
    };
  }

  return {
    graphValid,
    immediateLockedCertificate,
    immediateAppleForward,
    transitionPlanExists,
    transitionPathLength: null,
    transitionPlanSummary,
    cheapTransitionFeatures: null,
    transitionSearchAttempted: true,
    transitionSkippedByPrefilter: false,
    usableForSnake: false,
    reason: immediateLockedCertificate && !immediateAppleForward
      ? 'immediate-locked-valid-but-apple-forward-failed'
      : immediateLockedCertificate
        ? 'no-certified-use'
        : 'locked-invalid-transition-not-found',
    transitionSearchMs
  };
}

export function classifyPatchMutationCandidateForSnake(
  state: GameState,
  candidate: Pick<RectanglePatchMutationCandidate, 'cycle'>,
  options: SnakePatchMutationClassificationOptions = {}
): SnakePatchMutationClassification {
  const { transitionSearchMs: _transitionSearchMs, ...classification } =
    classifyPatchMutationCandidateForSnakeWithTiming(state, candidate, options);
  return classification;
}

export function classifyPatchMutationCandidatesForSnake(
  state: GameState,
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: SnakePatchMutationClassificationOptions = {}
): SnakePatchMutationClassificationResult {
  const mutationDiagnostics = generateRectanglePatchMutationCandidates(graph, cycle, options);
  return classifyGeneratedPatchMutationCandidatesForSnake(state, mutationDiagnostics, mutationDiagnostics.candidates, options);
}

export function classifyGeneratedPatchMutationCandidatesForSnake(
  state: GameState,
  mutationDiagnostics: RectanglePatchMutationGenerationResult,
  candidates: readonly RectanglePatchMutationCandidate[],
  options: SnakePatchMutationClassificationOptions = {}
): SnakePatchMutationClassificationResult {
  const validateCycle = options.validateCycle ?? validateHamiltonianCycle;
  const lockedCycle = state.lockedHamiltonianCycle ?? [];
  const classificationByIndex = new Array<SnakePatchMutationCandidateClassification>(candidates.length);
  const pendingTransitionCandidates: PendingPatchTransitionCandidate[] = [];
  const certificationStartedAt = Date.now();
  let transitionSearchMs = 0;
  let nonImmediateCandidates = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const graphValid = validateCycle(state.map.graph, candidate.cycle);
    if (!graphValid) {
      classificationByIndex[index] = {
        candidate,
        graphValid,
        immediateLockedCertificate: false,
        immediateAppleForward: false,
        transitionPlanExists: false,
        transitionPathLength: null,
        transitionPlanSummary: null,
        cheapTransitionFeatures: null,
        transitionSearchAttempted: false,
        transitionSkippedByPrefilter: false,
        usableForSnake: false,
        reason: 'graph-invalid'
      };
      continue;
    }

    const immediateLockedCertificate = validLockedCertificate(state.snake.segments, candidate.cycle);
    const immediateAppleForward = !state.appleNodeId || appleForward(state.snake.segments, state.appleNodeId, candidate.cycle);
    const cheapTransitionFeatures = buildPatchMutationCheapTransitionFeatures(
      state,
      lockedCycle,
      candidate
    );

    if (immediateLockedCertificate && immediateAppleForward) {
      classificationByIndex[index] = {
        candidate,
        graphValid,
        immediateLockedCertificate,
        immediateAppleForward,
        transitionPlanExists: false,
        transitionPathLength: null,
        transitionPlanSummary: null,
        cheapTransitionFeatures,
        transitionSearchAttempted: false,
        transitionSkippedByPrefilter: false,
        usableForSnake: true,
        reason: 'immediate-locked-valid'
      };
      continue;
    }

    if (!state.appleNodeId) {
      classificationByIndex[index] = {
        candidate,
        graphValid,
        immediateLockedCertificate,
        immediateAppleForward,
        transitionPlanExists: false,
        transitionPathLength: null,
        transitionPlanSummary: null,
        cheapTransitionFeatures,
        transitionSearchAttempted: false,
        transitionSkippedByPrefilter: false,
        usableForSnake: false,
        reason: 'no-current-apple-for-transition'
      };
      continue;
    }

    nonImmediateCandidates += 1;
    pendingTransitionCandidates.push({
      index,
      candidate,
      immediateLockedCertificate,
      immediateAppleForward,
      cheapTransitionFeatures
    });
  }

  const certificationMsBeforeTransition = Date.now() - certificationStartedAt;
  const immediateImprovingExists =
    options.preferImmediateLockedBeforeTransitionSearch === true &&
    classificationByIndex.some((classification) =>
      classification &&
      classification.reason === 'immediate-locked-valid' &&
      (classification.cheapTransitionFeatures?.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY) >=
        (options.minimumPathImprovement ?? 1)
    );
  const transitionCandidates = selectPatchTransitionCandidatesForSearch(
    pendingTransitionCandidates,
    options,
    immediateImprovingExists
  );
  const transitionCandidateIndexSet = new Set(transitionCandidates.map((candidate) => candidate.index));

  if (transitionCandidates.length > 0) {
    const transitionSearchStartedAt = Date.now();
    const transitionDiagnostics = analyzeCertifiedTransitionTargets(
      state,
      {
        mapId: state.map.id,
        status: 'ready',
        entries: transitionCandidates.map((transitionCandidate) => ({
          id: patchTransitionCandidateId(transitionCandidate),
          cycle: transitionCandidate.candidate.cycle,
          source: 'solver',
          archetypeName: 'rectangle-patch-mutation',
          minDistanceToAccepted: 0,
          minOrderDistanceToAccepted: 0
        })),
        diagnostics: {
          generationAttempts: 0,
          generatedCycles: transitionCandidates.length,
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
    const targetById = new Map(
      transitionDiagnostics.targets.map((target) => [target.targetCycleId, target])
    );

    for (const transitionCandidate of transitionCandidates) {
      const target = targetById.get(patchTransitionCandidateId(transitionCandidate)) ?? null;
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
      const transitionPlanExists = (target?.successfulTransitionPaths ?? 0) > 0;

      classificationByIndex[transitionCandidate.index] = {
        candidate: transitionCandidate.candidate,
        graphValid: true,
        immediateLockedCertificate: transitionCandidate.immediateLockedCertificate,
        immediateAppleForward: transitionCandidate.immediateAppleForward,
        transitionPlanExists,
        transitionPathLength: transitionPlanExists ? target?.bestSuccessfulPathLength ?? null : null,
        transitionPlanSummary,
        cheapTransitionFeatures: transitionCandidate.cheapTransitionFeatures,
        transitionSearchAttempted: true,
        transitionSkippedByPrefilter: false,
        usableForSnake: transitionPlanExists,
        reason: transitionPlanExists
          ? 'transition-valid'
          : transitionCandidate.immediateLockedCertificate && !transitionCandidate.immediateAppleForward
            ? 'immediate-locked-valid-but-apple-forward-failed'
            : transitionCandidate.immediateLockedCertificate
              ? 'no-certified-use'
              : 'locked-invalid-transition-not-found'
      };
    }
  }

  for (const pendingCandidate of pendingTransitionCandidates) {
    if (transitionCandidateIndexSet.has(pendingCandidate.index)) {
      continue;
    }

    classificationByIndex[pendingCandidate.index] = {
      candidate: pendingCandidate.candidate,
      graphValid: true,
      immediateLockedCertificate: pendingCandidate.immediateLockedCertificate,
      immediateAppleForward: pendingCandidate.immediateAppleForward,
      transitionPlanExists: false,
      transitionPathLength: null,
      transitionPlanSummary: null,
      cheapTransitionFeatures: pendingCandidate.cheapTransitionFeatures,
      transitionSearchAttempted: false,
      transitionSkippedByPrefilter: true,
      usableForSnake: false,
      reason: pendingCandidate.immediateLockedCertificate && !pendingCandidate.immediateAppleForward
        ? 'immediate-locked-valid-but-apple-forward-failed'
        : pendingCandidate.immediateLockedCertificate
          ? 'no-certified-use'
          : 'locked-invalid-transition-not-found'
    };
  }

  const classifications = classificationByIndex.filter(Boolean);
  const certificationMs = Math.max(0, certificationMsBeforeTransition);
  const aggregate = createEmptySnakePatchMutationClassificationAggregate();

  for (const classification of classifications) {
    if (classification.graphValid) {
      aggregate.graphValidCandidates += 1;
    }
    if (classification.immediateLockedCertificate) {
      aggregate.immediateLockedCandidates += 1;
    } else if (classification.graphValid) {
      aggregate.rejectedByLockedCertificate += 1;
    }
    if (classification.immediateLockedCertificate && classification.immediateAppleForward) {
      aggregate.immediateAppleForwardCandidates += 1;
    }
    if (classification.graphValid && state.appleNodeId && !(classification.immediateLockedCertificate && classification.immediateAppleForward)) {
      aggregate.nonImmediateCandidates += 1;
    }
    if (classification.immediateLockedCertificate && !classification.immediateAppleForward && state.appleNodeId) {
      aggregate.rejectedByAppleForward += 1;
    }
    if (classification.transitionSearchAttempted) {
      aggregate.transitionCandidatesAfterPrefilter += 1;
      aggregate.transitionSearchesStarted += 1;
    }
    if (classification.transitionSkippedByPrefilter) {
      aggregate.transitionCandidatesSkippedByPrefilter += 1;
    }
    if (classification.transitionPlanExists) {
      aggregate.transitionReachableCandidates += 1;
      aggregate.transitionSearchesSucceeded += 1;
    }
    if (classification.usableForSnake) {
      aggregate.usableCandidates += 1;
    } else {
      aggregate.unusableCandidates += 1;
    }
    if (
      classification.graphValid &&
      !classification.usableForSnake &&
      state.appleNodeId &&
      classification.reason !== 'immediate-locked-valid-but-apple-forward-failed'
    ) {
      aggregate.rejectedByTransitionSearch += 1;
    }
    if (classification.reason === 'no-current-apple-for-transition') {
      aggregate.noCurrentAppleForTransition += 1;
    }
  }

  return {
    mutationDiagnostics,
    aggregate,
    classifications,
    profile: {
      certificationMs,
      transitionSearchMs,
      nonImmediateCandidates,
      transitionCandidatesAfterPrefilter: aggregate.transitionCandidatesAfterPrefilter,
      transitionCandidatesSkippedByPrefilter: aggregate.transitionCandidatesSkippedByPrefilter,
      transitionSearchesStarted: aggregate.transitionSearchesStarted,
      transitionSearchesSucceeded: aggregate.transitionSearchesSucceeded
    }
  };
}

export function computePatchMutationFeatures(
  state: GameState,
  currentCycle: HamiltonianCycle,
  classification: SnakePatchMutationCandidateClassification,
  candidateIndex = 0
): PatchMutationFeatures | null {
  if (!classification.usableForSnake) {
    return null;
  }

  const head = state.snake.segments[0] ?? null;
  const currentLockedCyclePathLen = head && state.appleNodeId
    ? distanceForwardOnCycle(head, state.appleNodeId, currentCycle)
    : null;
  const usabilityMode: PatchMutationUsabilityMode = classification.reason === 'transition-valid'
    ? 'transition-valid'
    : 'immediate-locked';
  const cycleFeatures = computeCycleFeatures(state, currentCycle, classification.candidate.cycle);
  const cycleScore = scoreCycleFeatures(cycleFeatures);
  const pathLenToCurrentApple = usabilityMode === 'immediate-locked' ? cycleFeatures.pathLen : null;
  const transitionPathLength = usabilityMode === 'transition-valid' ? classification.transitionPathLength : null;
  const candidatePathMetric = usabilityMode === 'immediate-locked' ? pathLenToCurrentApple : transitionPathLength;
  const pathLenImprovement = currentLockedCyclePathLen !== null && candidatePathMetric !== null
    ? currentLockedCyclePathLen - candidatePathMetric
    : null;
  const patchId = patchIdForRect(classification.candidate.rect);
  const mutationSize = {
    changedCycleEdges: cycleFeatures.repairDistanceFromOldCycle,
    rectangleArea: classification.candidate.rect.width * classification.candidate.rect.height
  };

  const features: Omit<PatchMutationFeatures, 'patchMutationScore'> = {
    candidateId: `${patchId}:candidate-${candidateIndex}`,
    patchId,
    usabilityMode,
    pathLenToCurrentApple,
    transitionPathLength,
    currentLockedCyclePathLen,
    pathLenImprovement,
    mutationSize,
    cycleScore,
    cycleFeatures
  };

  return {
    ...features,
    patchMutationScore: scorePatchMutationCandidate(features)
  };
}

export function scorePatchMutationCandidate(features: Omit<PatchMutationFeatures, 'patchMutationScore'> | PatchMutationFeatures): number {
  const improvement = features.pathLenImprovement ?? -1_000;
  const modeBonus = features.usabilityMode === 'immediate-locked' ? 10 : 0;
  const transitionPenalty = features.transitionPathLength ?? 0;
  const cycleScorePenalty = features.cycleScore === null ? 0 : features.cycleScore * 0.001;

  return (
    improvement * 1_000 +
    modeBonus -
    transitionPenalty * 5 -
    features.mutationSize.changedCycleEdges * 2 -
    features.mutationSize.rectangleArea -
    cycleScorePenalty
  );
}

export function comparePatchMutationFeaturesForRanking(left: PatchMutationFeatures, right: PatchMutationFeatures): number {
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

  if (left.mutationSize.changedCycleEdges !== right.mutationSize.changedCycleEdges) {
    return left.mutationSize.changedCycleEdges - right.mutationSize.changedCycleEdges;
  }
  if (left.mutationSize.rectangleArea !== right.mutationSize.rectangleArea) {
    return left.mutationSize.rectangleArea - right.mutationSize.rectangleArea;
  }

  const leftCycleScore = left.cycleScore ?? Number.POSITIVE_INFINITY;
  const rightCycleScore = right.cycleScore ?? Number.POSITIVE_INFINITY;
  if (leftCycleScore !== rightCycleScore) {
    return leftCycleScore - rightCycleScore;
  }

  return left.candidateId.localeCompare(right.candidateId);
}

export function rankPatchMutationCandidates(
  state: GameState,
  graph: GraphSnapshot,
  cycle: HamiltonianCycle,
  options: SnakePatchMutationClassificationOptions = {}
): PatchMutationRankingResult {
  const classificationDiagnostics = classifyPatchMutationCandidatesForSnake(state, graph, cycle, options);
  return rankGeneratedPatchMutationCandidates(state, cycle, classificationDiagnostics);
}

export function rankGeneratedPatchMutationCandidates(
  state: GameState,
  cycle: HamiltonianCycle,
  classificationDiagnostics: SnakePatchMutationClassificationResult
): PatchMutationRankingResult {
  const currentCycle = state.lockedHamiltonianCycle ?? cycle;
  const scoringStartedAt = Date.now();
  const rankedCandidates = classificationDiagnostics.classifications
    .map((classification, index) => {
      const features = computePatchMutationFeatures(state, currentCycle, classification, index);
      return features ? { candidate: classification.candidate, classification, features } : null;
    })
    .filter((candidate): candidate is RankedPatchMutationCandidate => candidate !== null)
    .sort(compareRankedPatchMutationCandidates);
  const scoringMs = Date.now() - scoringStartedAt;

  return {
    classificationDiagnostics,
    rankedCandidates,
    aggregate: summarizePatchMutationRanking(rankedCandidates),
    profile: {
      certificationMs: classificationDiagnostics.profile.certificationMs,
      transitionSearchMs: classificationDiagnostics.profile.transitionSearchMs,
      scoringMs
    }
  };
}

function buildPatchMutationCheapTransitionFeatures(
  state: GameState,
  currentCycle: HamiltonianCycle,
  candidate: RectanglePatchMutationCandidate
): PatchMutationCheapTransitionFeatures | null {
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
  const changedCycleEdges = computeCheapChangedCycleEdges(currentCycle, candidate.cycle);
  const rectangleArea = candidate.rect.width * candidate.rect.height;
  const bodyOrderCompatibilityScore = computeBodyOrderCompatibilityScore(state.snake.segments, candidate.cycle);
  const bodyOrderMismatchCount = Math.max(0, state.snake.segments.length - 1 - bodyOrderCompatibilityScore);
  const nextOnCycleHeadOccupied = computeNextOnCycleHeadOccupied(state.snake.segments, candidate.cycle);
  const nearLockedCertificate =
    nextOnCycleHeadOccupied === false &&
    bodyOrderMismatchCount <= Math.min(2, Math.max(0, state.snake.segments.length - 1));
  const arcRelevance = computeRectArcRelevance(state, currentCycle, candidate.rect);
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
    source: 'v1',
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

function selectPatchTransitionCandidatesForSearch(
  candidates: readonly PendingPatchTransitionCandidate[],
  options: SnakePatchMutationClassificationOptions,
  immediateImprovingExists: boolean
): PendingPatchTransitionCandidate[] {
  if (candidates.length === 0) {
    return [];
  }
  if (immediateImprovingExists) {
    return [];
  }

  const mode = options.transitionPrefilterMode ?? 'none';
  const limit = resolvePatchTransitionSearchLimit(options);
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
    .sort((left, right) => comparePatchCheapTransitionCandidates(left, right, mode))
    .slice(0, limit);
}

function comparePatchCheapTransitionCandidates(
  left: PendingPatchTransitionCandidate,
  right: PendingPatchTransitionCandidate,
  mode: PatchMutationTransitionPrefilterMode
): number {
  const leftFeatures = left.cheapTransitionFeatures;
  const rightFeatures = right.cheapTransitionFeatures;

  if (!leftFeatures || !rightFeatures) {
    return left.index - right.index;
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

  return left.index - right.index;
}

function resolvePatchTransitionSearchLimit(options: SnakePatchMutationClassificationOptions): number {
  const limits = [
    options.maxTransitionCandidatesPerPlanningEvent,
    options.maxTransitionSearchesPerSource
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (limits.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor(Math.min(...limits)));
}

function patchTransitionCandidateId(candidate: PendingPatchTransitionCandidate): string {
  return `patch-mutation-candidate-${candidate.index}`;
}

function computeCheapChangedCycleEdges(currentCycle: HamiltonianCycle, candidateCycle: HamiltonianCycle): number {
  if (currentCycle.length === 0 || candidateCycle.length === 0) {
    return 0;
  }

  const currentEdges = buildDirectedCycleEdgeSet(currentCycle);
  const candidateEdges = buildDirectedCycleEdgeSet(candidateCycle);
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

function buildDirectedCycleEdgeSet(cycle: HamiltonianCycle): Set<string> {
  const edges = new Set<string>();
  for (let index = 0; index < cycle.length; index += 1) {
    edges.add(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
  }
  return edges;
}

function computeBodyOrderCompatibilityScore(
  bodySegments: readonly NodeId[],
  cycle: HamiltonianCycle
): number {
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

function computeNextOnCycleHeadOccupied(
  bodySegments: readonly NodeId[],
  cycle: HamiltonianCycle
): boolean | null {
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

function computeRectArcRelevance(
  state: GameState,
  currentCycle: HamiltonianCycle,
  rect: RectanglePatchRect
): number | null {
  const head = state.snake.segments[0] ?? null;
  const apple = state.appleNodeId;
  if (!head || !apple || currentCycle.length === 0) {
    return null;
  }

  const arcNodeIds = collectForwardArcNodeIds(head, apple, currentCycle);
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

function collectForwardArcNodeIds(head: NodeId, apple: NodeId, cycle: HamiltonianCycle): NodeId[] {
  const headIndex = cycle.indexOf(head);
  const appleIndex = cycle.indexOf(apple);
  if (headIndex === -1 || appleIndex === -1) {
    return [];
  }

  const nodes: NodeId[] = [];
  let index = headIndex;
  for (let steps = 0; steps < cycle.length; steps += 1) {
    const nodeId = cycle[index]!;
    nodes.push(nodeId);
    if (nodeId === apple) {
      break;
    }
    index = (index + 1) % cycle.length;
  }

  return nodes;
}

export function spliceTwoTerminalPatchPath(input: SpliceTwoTerminalPatchPathInput): HamiltonianCycle | null {
  const {
    oldCycle,
    patchNodeSet,
    terminalA,
    terminalB,
    oldInternalPath,
    replacementInternalPath
  } = input;

  if (
    oldCycle.length === 0 ||
    patchNodeSet.size === 0 ||
    !patchNodeSet.has(terminalA) ||
    !patchNodeSet.has(terminalB) ||
    terminalA === terminalB ||
    new Set(oldCycle).size !== oldCycle.length
  ) {
    return null;
  }

  if (!pathUsesExactlyPatch(oldInternalPath, patchNodeSet) || !pathUsesExactlyPatch(replacementInternalPath, patchNodeSet)) {
    return null;
  }

  if (!hasTerminalPair(oldInternalPath, terminalA, terminalB) || !hasTerminalPair(replacementInternalPath, terminalA, terminalB)) {
    return null;
  }

  const segmentStart = findExactCyclePathStart(oldCycle, oldInternalPath);
  if (segmentStart === null) {
    return null;
  }

  const replacement = orientReplacementToOldPath(oldInternalPath, replacementInternalPath);
  if (!replacement || arraysEqual(oldInternalPath, replacement)) {
    return null;
  }

  const rotatedOldCycle = rotateCycle(oldCycle, segmentStart);
  const outsideSegment = rotatedOldCycle.slice(oldInternalPath.length);
  const candidateCycle = [...replacement, ...outsideSegment];

  if (!sameNodeSet(oldCycle, candidateCycle)) {
    return null;
  }

  const candidatePatchSegment = candidateCycle.slice(0, replacement.length);
  if (!arraysEqual(candidatePatchSegment, replacement)) {
    return null;
  }

  return candidateCycle;
}

function orientReplacementToOldPath(oldInternalPath: readonly NodeId[], replacementInternalPath: readonly NodeId[]): NodeId[] | null {
  const oldStart = oldInternalPath[0];
  const oldEnd = oldInternalPath[oldInternalPath.length - 1];
  const replacementStart = replacementInternalPath[0];
  const replacementEnd = replacementInternalPath[replacementInternalPath.length - 1];

  if (!oldStart || !oldEnd || !replacementStart || !replacementEnd) {
    return null;
  }

  if (replacementStart === oldStart && replacementEnd === oldEnd) {
    return [...replacementInternalPath];
  }

  if (replacementStart === oldEnd && replacementEnd === oldStart) {
    return [...replacementInternalPath].reverse();
  }

  return null;
}

function hasTerminalPair(path: readonly NodeId[], terminalA: NodeId, terminalB: NodeId): boolean {
  const start = path[0];
  const end = path[path.length - 1];
  return (start === terminalA && end === terminalB) || (start === terminalB && end === terminalA);
}

function findExactCyclePathStart(cycle: readonly NodeId[], path: readonly NodeId[]): number | null {
  if (path.length > cycle.length || path.length === 0) {
    return null;
  }

  let matchStart: number | null = null;

  for (let start = 0; start < cycle.length; start += 1) {
    let matches = true;

    for (let offset = 0; offset < path.length; offset += 1) {
      if (cycle[(start + offset) % cycle.length] !== path[offset]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      if (matchStart !== null) {
        return null;
      }
      matchStart = start;
    }
  }

  return matchStart;
}

function cycleSegmentInclusive(cycle: readonly NodeId[], startIndex: number, endIndex: number): NodeId[] {
  const segment: NodeId[] = [];
  let index = startIndex;

  while (true) {
    segment.push(cycle[index]!);
    if (index === endIndex) {
      break;
    }
    index = (index + 1) % cycle.length;
  }

  return segment;
}

function rotateCycle(cycle: readonly NodeId[], startIndex: number): NodeId[] {
  return [...cycle.slice(startIndex), ...cycle.slice(0, startIndex)];
}

function arraysEqual(a: readonly NodeId[], b: readonly NodeId[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function numberArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function directedCycleEdgeSignature(cycle: readonly NodeId[]): string {
  const edges: string[] = [];

  for (let index = 0; index < cycle.length; index += 1) {
    edges.push(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
  }

  edges.sort();
  return edges.join('|');
}

function compareRankedPatchMutationCandidates(left: RankedPatchMutationCandidate, right: RankedPatchMutationCandidate): number {
  return comparePatchMutationFeaturesForRanking(left.features, right.features);
}

function applyRectangleScanBudget(rectangles: RectanglePatchRect[], maxPatchRectsScanned?: number): RectanglePatchRect[] {
  if (maxPatchRectsScanned === undefined || maxPatchRectsScanned >= rectangles.length) {
    return rectangles;
  }

  return rectangles.slice(0, Math.max(0, maxPatchRectsScanned));
}

function summarizePatchMutationRanking(
  rankedCandidates: readonly RankedPatchMutationCandidate[]
): PatchMutationRankingAggregateDiagnostics {
  const improvements = rankedCandidates
    .map((candidate) => candidate.features.pathLenImprovement)
    .filter((value): value is number => value !== null);
  const improvingCandidates = rankedCandidates.filter((candidate) => (candidate.features.pathLenImprovement ?? 0) > 0);
  const mutationSizes = rankedCandidates.map((candidate) => candidate.features.mutationSize.changedCycleEdges);
  const bestCandidate = rankedCandidates[0] ?? null;

  return {
    usableCandidates: rankedCandidates.length,
    improvingCandidates: improvingCandidates.length,
    bestImprovement: improvements.length > 0 ? Math.max(...improvements) : null,
    averageImprovement: improvements.length > 0
      ? improvements.reduce((sum, value) => sum + value, 0) / improvements.length
      : null,
    bestCandidate: bestCandidate?.features ?? null,
    immediateLockedImprovingCandidates: improvingCandidates.filter((candidate) => candidate.features.usabilityMode === 'immediate-locked').length,
    transitionImprovingCandidates: improvingCandidates.filter((candidate) => candidate.features.usabilityMode === 'transition-valid').length,
    averageMutationSize: mutationSizes.length > 0
      ? mutationSizes.reduce((sum, value) => sum + value, 0) / mutationSizes.length
      : null,
    bestCandidateReason: bestCandidate ? bestCandidate.classification.reason : null
  };
}

function patchIdForRect(rect: RectanglePatchRect): string {
  return `rect-${rect.x}-${rect.y}-${rect.width}x${rect.height}`;
}

function graphBounds(graph: GraphSnapshot): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (graph.nodes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of graph.nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  return { minX, maxX, minY, maxY };
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

function localIndexForRectNode(graph: GraphSnapshot, rect: RectanglePatchRect, nodeId: NodeId): number {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return -1;
  }
  return localIndex(node.x - rect.x, node.y - rect.y, rect.width);
}

function globalPathFromLocalPath(graph: GraphSnapshot, rect: RectanglePatchRect, localPath: readonly number[]): NodeId[] | null {
  const nodeByCoord = new Map(graph.nodes.map((node) => [`${node.x},${node.y}`, node.id]));
  const globalPath: NodeId[] = [];

  for (const localNodeIndex of localPath) {
    const localNodeCoord = localCoord(localNodeIndex, rect.width);
    const nodeId = nodeByCoord.get(`${rect.x + localNodeCoord.x},${rect.y + localNodeCoord.y}`);
    if (!nodeId) {
      return null;
    }
    globalPath.push(nodeId);
  }

  return globalPath;
}

function hasValidInternalDegreePattern(
  rectNodeSet: ReadonlySet<NodeId>,
  insideEdges: readonly InsideCycleEdge[],
  terminals: RectanglePatchTerminals
): boolean {
  const degrees = new Map<NodeId, number>();

  for (const nodeId of rectNodeSet) {
    degrees.set(nodeId, 0);
  }

  for (const edge of insideEdges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }

  for (const nodeId of rectNodeSet) {
    const expectedDegree = nodeId === terminals.terminalA || nodeId === terminals.terminalB ? 1 : 2;
    if ((degrees.get(nodeId) ?? 0) !== expectedDegree) {
      return false;
    }
  }

  return true;
}

function insideEdgesConnectPatch(
  rectNodeSet: ReadonlySet<NodeId>,
  insideEdges: readonly InsideCycleEdge[],
  startNode: NodeId
): boolean {
  if (!rectNodeSet.has(startNode)) {
    return false;
  }

  const adjacency = new Map<NodeId, Set<NodeId>>();
  for (const nodeId of rectNodeSet) {
    adjacency.set(nodeId, new Set());
  }
  for (const edge of insideEdges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const stack = [startNode];
  const seen = new Set<NodeId>();

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (seen.has(nodeId)) {
      continue;
    }

    seen.add(nodeId);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!seen.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return seen.size === rectNodeSet.size;
}

function createEmptyRectanglePatchAggregate(): RectanglePatchAggregateDiagnostics {
  return {
    rectanglesScanned: 0,
    fullRectangles: 0,
    crossingCountNotTwo: 0,
    exactlyTwoCrossingRectangles: 0,
    invalidInternalDegreePattern: 0,
    internalPathNotConnected: 0,
    internalPathMissesVertices: 0,
    cacheMisses: 0,
    noAlternativePath: 0,
    validPatches: 0
  };
}

function createEmptyRectanglePatchMutationAggregate(): RectanglePatchMutationAggregateDiagnostics {
  return {
    patchesScanned: 0,
    validTwoTerminalPatches: 0,
    alternativesConsidered: 0,
    noOpAlternatives: 0,
    rawCandidatesGenerated: 0,
    duplicateCandidates: 0,
    graphValidCandidates: 0,
    graphInvalidCandidates: 0,
    budgetExhausted: false
  };
}

function createEmptySnakePatchMutationClassificationAggregate(): SnakePatchMutationClassificationAggregate {
  return {
    graphValidCandidates: 0,
    immediateLockedCandidates: 0,
    immediateAppleForwardCandidates: 0,
    nonImmediateCandidates: 0,
    transitionCandidatesAfterPrefilter: 0,
    transitionCandidatesSkippedByPrefilter: 0,
    transitionSearchesStarted: 0,
    transitionSearchesSucceeded: 0,
    transitionReachableCandidates: 0,
    usableCandidates: 0,
    unusableCandidates: 0,
    rejectedByLockedCertificate: 0,
    rejectedByAppleForward: 0,
    rejectedByTransitionSearch: 0,
    noCurrentAppleForTransition: 0,
    prefilterRejectedButWouldHaveSucceeded: null
  };
}
