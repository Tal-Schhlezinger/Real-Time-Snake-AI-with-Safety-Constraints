import { appleForward, bodyContiguous, distanceForwardOnCycle } from './hamiltonian-certificate.js';
import {
  compareCandidateCycles,
  computeCycleFeatures,
  defaultCycleScoreWeights,
  scoreCycleFeatures,
  type CycleFeatures,
  type CycleScoreWeights
} from './cycle-scoring.js';
import { validateHamiltonianCycle } from './map-validator.js';
import type { GameState, GraphSnapshot, HamiltonianCycle, NodeId } from './types.js';

export interface TwoOptDiagnosticOptions {
  maxPairsChecked?: number;
  searchNeighborhood?: number | null;
  exhaustive?: boolean;
  scoreWeights?: CycleScoreWeights;
}

export interface TwoOptDiagnostics {
  edgePairsConsidered: number;
  replacementPairsConsidered: number;
  replacementEdgesMissing: number;
  rawCandidatesGenerated: number;
  duplicateCandidatesSkipped: number;
  graphInvalidCandidates: number;
  bodyContiguousFailed: number;
  appleForwardFailed: number;
  validCandidates: number;
  improvingCandidates: number;
  bestPathLenBefore: number | null;
  bestPathLenAfter: number | null;
  bestScoreBefore: number;
  bestScoreAfter: number | null;
  budgetExhausted: boolean;
  invalidDueToLength: number;
  invalidDueToDuplicates: number;
  invalidDueToMissingNodes: number;
  invalidDueToBadReplacementSeam: number;
  invalidDueToBadInternalReversal: number;
  invalidDueToBadWraparound: number;
  invalidDueToOtherBadEdge: number;
}

export type TwoOptReconnectMode = 'ac-bd' | 'ad-bc';

export interface TwoOptDirectedEdge {
  from: NodeId;
  to: NodeId;
}

export type TwoOptInvalidEdgeLocation = 'replacement-seam' | 'internal-reversal' | 'wraparound' | 'elsewhere' | null;

export type TwoOptInvalidFailureCategory =
  | 'length'
  | 'duplicates'
  | 'missing-nodes'
  | 'bad-replacement-seam'
  | 'bad-internal-reversal'
  | 'bad-wraparound'
  | 'other-bad-edge';

export interface TwoOptInvalidCandidateDetail {
  edgePairIndices: {
    firstIndex: number;
    secondIndex: number;
  };
  reconnectMode: TwoOptReconnectMode;
  candidateLength: number;
  duplicateNodeCount: number;
  missingNodeCount: number;
  candidateNodeSetEqualsOldCycleNodeSet: boolean;
  intendedReplacementEdges: TwoOptDirectedEdge[];
  allIntendedReplacementEdgesExist: boolean;
  firstInvalidEdge: TwoOptDirectedEdge | null;
  firstInvalidEdgeIndex: number | null;
  firstInvalidEdgeMatchesIntendedReplacementSeam: boolean;
  firstInvalidEdgeLocation: TwoOptInvalidEdgeLocation;
  failureCategory: TwoOptInvalidFailureCategory;
}

export interface TwoOptDiagnosticsResult {
  diagnostics: TwoOptDiagnostics;
  bestCandidate: HamiltonianCycle | null;
  bestFeatures: CycleFeatures | null;
  invalidCandidateDetails: TwoOptInvalidCandidateDetail[];
}

interface EdgePair {
  firstIndex: number;
  secondIndex: number;
}

interface TwoOptCandidateLayout {
  replacementSeamIndices: number[];
  internalReversalEdgeIndices: number[];
  wraparoundEdgeIndex: number;
}

interface CandidateAttempt {
  candidate: HamiltonianCycle | null;
  replacementEdgesMissing: boolean;
  edgePairIndices: EdgePair;
  reconnectMode: TwoOptReconnectMode;
  intendedReplacementEdges: TwoOptDirectedEdge[];
  allIntendedReplacementEdgesExist: boolean;
  layout: TwoOptCandidateLayout | null;
}

interface StandardTwoOptConstruction {
  candidate: HamiltonianCycle;
  layout: TwoOptCandidateLayout;
}

interface TwoOptCutPaths {
  rotatedCycle: HamiltonianCycle;
  firstPath: HamiltonianCycle;
  secondPath: HamiltonianCycle;
}

const DEFAULT_TWO_OPT_DIAGNOSTIC_OPTIONS: Required<TwoOptDiagnosticOptions> = {
  maxPairsChecked: 64,
  searchNeighborhood: 3,
  exhaustive: false,
  scoreWeights: defaultCycleScoreWeights
};

const EMPTY_TWO_OPT_DIAGNOSTICS: TwoOptDiagnostics = {
  edgePairsConsidered: 0,
  replacementPairsConsidered: 0,
  replacementEdgesMissing: 0,
  rawCandidatesGenerated: 0,
  duplicateCandidatesSkipped: 0,
  graphInvalidCandidates: 0,
  bodyContiguousFailed: 0,
  appleForwardFailed: 0,
  validCandidates: 0,
  improvingCandidates: 0,
  bestPathLenBefore: null,
  bestPathLenAfter: null,
  bestScoreBefore: 0,
  bestScoreAfter: null,
  budgetExhausted: false,
  invalidDueToLength: 0,
  invalidDueToDuplicates: 0,
  invalidDueToMissingNodes: 0,
  invalidDueToBadReplacementSeam: 0,
  invalidDueToBadInternalReversal: 0,
  invalidDueToBadWraparound: 0,
  invalidDueToOtherBadEdge: 0
};

function buildCycleEdgeSignature(cycle: HamiltonianCycle): string {
  const edges: string[] = [];
  for (let index = 0; index < cycle.length; index += 1) {
    edges.push(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
  }
  edges.sort();
  return edges.join('|');
}

function rotateCycleToStart(cycle: HamiltonianCycle, start: NodeId): HamiltonianCycle | null {
  const startIndex = cycle.indexOf(start);
  if (startIndex === -1) {
    return null;
  }
  return [...cycle.slice(startIndex), ...cycle.slice(0, startIndex)];
}

function splitCycleAtEdgePair(oldCycle: HamiltonianCycle, pair: EdgePair): TwoOptCutPaths | null {
  const firstStart = oldCycle[pair.firstIndex];
  const firstNext = oldCycle[(pair.firstIndex + 1) % oldCycle.length];
  const secondStart = oldCycle[pair.secondIndex];
  const secondNext = oldCycle[(pair.secondIndex + 1) % oldCycle.length];
  if (!firstStart || !firstNext || !secondStart || !secondNext) {
    return null;
  }

  const rotatedCycle = rotateCycleToStart(oldCycle, firstStart);
  if (!rotatedCycle || rotatedCycle[1] !== firstNext) {
    return null;
  }

  const secondIndex = pair.secondIndex - pair.firstIndex;
  if (secondIndex <= 1 || secondIndex >= rotatedCycle.length - 1) {
    return null;
  }

  if (rotatedCycle[secondIndex] !== secondStart || rotatedCycle[secondIndex + 1] !== secondNext) {
    return null;
  }

  return {
    rotatedCycle,
    firstPath: rotatedCycle.slice(1, secondIndex + 1),
    secondPath: [...rotatedCycle.slice(secondIndex + 1), rotatedCycle[0]!]
  };
}

function seamEdgeForMode(
  oldCycle: HamiltonianCycle,
  pair: EdgePair,
  mode: TwoOptReconnectMode
): [TwoOptDirectedEdge, TwoOptDirectedEdge] {
  const a = oldCycle[pair.firstIndex]!;
  const b = oldCycle[(pair.firstIndex + 1) % oldCycle.length]!;
  const c = oldCycle[pair.secondIndex]!;
  const d = oldCycle[(pair.secondIndex + 1) % oldCycle.length]!;

  if (mode === 'ac-bd') {
    return [
      { from: a, to: c },
      { from: b, to: d }
    ];
  }

  return [
    { from: a, to: d },
    { from: b, to: c }
  ];
}

export function constructTwoOptCandidate(
  oldCycle: HamiltonianCycle,
  pair: EdgePair,
  mode: TwoOptReconnectMode
): StandardTwoOptConstruction | null {
  const cutPaths = splitCycleAtEdgePair(oldCycle, pair);
  if (!cutPaths) {
    return null;
  }

  if (mode === 'ad-bc') {
    // On a single cycle, reconnecting the cut edges as a->d and b->c closes
    // the two cut paths into separate subtours rather than one Hamiltonian cycle.
    return null;
  }

  const [seam1, seam2] = seamEdgeForMode(cutPaths.rotatedCycle, { firstIndex: 0, secondIndex: cutPaths.firstPath.length }, mode);
  const reversedFirstPath = [...cutPaths.firstPath].reverse();
  const candidate = [cutPaths.rotatedCycle[0]!, ...reversedFirstPath, ...cutPaths.secondPath.slice(0, -1)];
  if (candidate.length !== oldCycle.length) {
    return null;
  }
  if (new Set(candidate).size !== oldCycle.length || !nodeSetEqualsOldCycle(candidate, oldCycle)) {
    return null;
  }

  const secondSeamIndex = reversedFirstPath.length;
  if (candidate[0] !== seam1.from || candidate[1] !== seam1.to) {
    return null;
  }
  if (candidate[secondSeamIndex] !== seam2.from || candidate[(secondSeamIndex + 1) % candidate.length] !== seam2.to) {
    return null;
  }

  return {
    candidate,
    layout: {
      replacementSeamIndices: [0, secondSeamIndex],
      internalReversalEdgeIndices: Array.from({ length: Math.max(0, reversedFirstPath.length - 1) }, (_, index) => index + 1),
      wraparoundEdgeIndex: candidate.length - 1
    }
  };
}

function buildSearchFocus(state: GameState, cycle: HamiltonianCycle, neighborhood: number | null): Set<NodeId> | null {
  if (neighborhood === null) {
    return null;
  }

  const head = state.snake.segments[0];
  const apple = state.appleNodeId;
  if (!head || !apple) {
    return null;
  }

  const headIndex = cycle.indexOf(head);
  const pathLen = distanceForwardOnCycle(head, apple, cycle);
  if (headIndex === -1 || pathLen === null) {
    return null;
  }

  const focus = new Set<NodeId>();
  for (let offset = -neighborhood; offset <= pathLen + neighborhood; offset += 1) {
    const wrappedIndex = (headIndex + offset + cycle.length * 4) % cycle.length;
    focus.add(cycle[wrappedIndex]!);
  }

  return focus;
}

function isEdgePairNearFocus(cycle: HamiltonianCycle, pair: EdgePair, focus: Set<NodeId> | null): boolean {
  if (!focus) {
    return true;
  }

  const nodes = [
    cycle[pair.firstIndex]!,
    cycle[(pair.firstIndex + 1) % cycle.length]!,
    cycle[pair.secondIndex]!,
    cycle[(pair.secondIndex + 1) % cycle.length]!
  ];

  return nodes.some((nodeId) => focus.has(nodeId));
}

function buildEdgePairs(cycle: HamiltonianCycle): EdgePair[] {
  const pairs: EdgePair[] = [];
  for (let firstIndex = 0; firstIndex < cycle.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 2; secondIndex < cycle.length; secondIndex += 1) {
      if (firstIndex === 0 && secondIndex === cycle.length - 1) {
        continue;
      }
      pairs.push({ firstIndex, secondIndex });
    }
  }
  return pairs;
}

function reorderEdgePairs(cycle: HamiltonianCycle, pairs: EdgePair[], focus: Set<NodeId> | null, exhaustive: boolean): EdgePair[] {
  if (exhaustive || !focus) {
    return pairs;
  }

  const near: EdgePair[] = [];
  const far: EdgePair[] = [];
  for (const pair of pairs) {
    if (isEdgePairNearFocus(cycle, pair, focus)) {
      near.push(pair);
    } else {
      far.push(pair);
    }
  }
  return [...near, ...far];
}

function isImprovingCandidate(baseline: CycleFeatures, candidate: CycleFeatures, weights: CycleScoreWeights): boolean {
  const pathImproves = baseline.pathLen !== null && candidate.pathLen !== null && candidate.pathLen < baseline.pathLen;
  return pathImproves || compareCandidateCycles(candidate, baseline, weights) < 0;
}

function edgeExistsInGraph(graph: GraphSnapshot, from: NodeId, to: NodeId): boolean {
  return graph.edges.some((edge) => edge.from === from && edge.to === to);
}

function findFirstInvalidEdge(graph: GraphSnapshot, candidate: HamiltonianCycle): { edge: TwoOptDirectedEdge; index: number } | null {
  if (candidate.length === 0) {
    return null;
  }

  for (let index = 0; index < candidate.length; index += 1) {
    const edge = {
      from: candidate[index]!,
      to: candidate[(index + 1) % candidate.length]!
    };
    if (!edgeExistsInGraph(graph, edge.from, edge.to)) {
      return { edge, index };
    }
  }

  return null;
}

function nodeSetEqualsOldCycle(candidate: HamiltonianCycle, oldCycle: HamiltonianCycle): boolean {
  const oldSet = new Set(oldCycle);
  const candidateSet = new Set(candidate);
  if (candidateSet.size !== oldSet.size) {
    return false;
  }
  for (const nodeId of candidateSet) {
    if (!oldSet.has(nodeId)) {
      return false;
    }
  }
  return true;
}

function classifyInvalidEdgeLocation(attempt: CandidateAttempt, invalidEdgeIndex: number | null): TwoOptInvalidEdgeLocation {
  if (invalidEdgeIndex === null || !attempt.layout) {
    return null;
  }
  if (attempt.layout.replacementSeamIndices.includes(invalidEdgeIndex)) {
    return 'replacement-seam';
  }
  if (attempt.layout.internalReversalEdgeIndices.includes(invalidEdgeIndex)) {
    return 'internal-reversal';
  }
  if (attempt.layout.wraparoundEdgeIndex === invalidEdgeIndex) {
    return 'wraparound';
  }
  return 'elsewhere';
}

function inspectInvalidCandidate(
  graph: GraphSnapshot,
  oldCycle: HamiltonianCycle,
  attempt: CandidateAttempt
): TwoOptInvalidCandidateDetail | null {
  const candidate = attempt.candidate;
  if (!candidate) {
    return null;
  }

  const uniqueNodeCount = new Set(candidate).size;
  const duplicateNodeCount = candidate.length - uniqueNodeCount;
  const oldNodeSet = new Set(oldCycle);
  const candidateNodeSet = new Set(candidate);
  let missingNodeCount = 0;
  for (const nodeId of oldNodeSet) {
    if (!candidateNodeSet.has(nodeId)) {
      missingNodeCount += 1;
    }
  }
  const candidateNodeSetEqualsOldCycleNodeSet = nodeSetEqualsOldCycle(candidate, oldCycle);
  const firstInvalid = findFirstInvalidEdge(graph, candidate);
  const firstInvalidEdgeLocation = classifyInvalidEdgeLocation(attempt, firstInvalid?.index ?? null);
  const firstInvalidEdgeMatchesIntendedReplacementSeam = attempt.intendedReplacementEdges.some(
    (edge) => edge.from === firstInvalid?.edge.from && edge.to === firstInvalid?.edge.to
  );

  let failureCategory: TwoOptInvalidFailureCategory;
  if (candidate.length !== oldCycle.length) {
    failureCategory = 'length';
  } else if (duplicateNodeCount > 0) {
    failureCategory = 'duplicates';
  } else if (missingNodeCount > 0 || !candidateNodeSetEqualsOldCycleNodeSet) {
    failureCategory = 'missing-nodes';
  } else if (firstInvalidEdgeLocation === 'replacement-seam') {
    failureCategory = 'bad-replacement-seam';
  } else if (firstInvalidEdgeLocation === 'internal-reversal') {
    failureCategory = 'bad-internal-reversal';
  } else if (firstInvalidEdgeLocation === 'wraparound') {
    failureCategory = 'bad-wraparound';
  } else {
    failureCategory = 'other-bad-edge';
  }

  return {
    edgePairIndices: {
      firstIndex: attempt.edgePairIndices.firstIndex,
      secondIndex: attempt.edgePairIndices.secondIndex
    },
    reconnectMode: attempt.reconnectMode,
    candidateLength: candidate.length,
    duplicateNodeCount,
    missingNodeCount,
    candidateNodeSetEqualsOldCycleNodeSet,
    intendedReplacementEdges: attempt.intendedReplacementEdges.map((edge) => ({ ...edge })),
    allIntendedReplacementEdgesExist: attempt.allIntendedReplacementEdgesExist,
    firstInvalidEdge: firstInvalid ? { ...firstInvalid.edge } : null,
    firstInvalidEdgeIndex: firstInvalid?.index ?? null,
    firstInvalidEdgeMatchesIntendedReplacementSeam,
    firstInvalidEdgeLocation,
    failureCategory
  };
}

function incrementInvalidFailureCounter(diagnostics: TwoOptDiagnostics, failureCategory: TwoOptInvalidFailureCategory): void {
  switch (failureCategory) {
    case 'length':
      diagnostics.invalidDueToLength += 1;
      return;
    case 'duplicates':
      diagnostics.invalidDueToDuplicates += 1;
      return;
    case 'missing-nodes':
      diagnostics.invalidDueToMissingNodes += 1;
      return;
    case 'bad-replacement-seam':
      diagnostics.invalidDueToBadReplacementSeam += 1;
      return;
    case 'bad-internal-reversal':
      diagnostics.invalidDueToBadInternalReversal += 1;
      return;
    case 'bad-wraparound':
      diagnostics.invalidDueToBadWraparound += 1;
      return;
    case 'other-bad-edge':
      diagnostics.invalidDueToOtherBadEdge += 1;
      return;
  }
}

export class TwoOptDiagnosticAnalyzer {
  readonly options: Required<TwoOptDiagnosticOptions>;
  lastDiagnostics: TwoOptDiagnostics = { ...EMPTY_TWO_OPT_DIAGNOSTICS };
  lastInvalidCandidateDetails: TwoOptInvalidCandidateDetail[] = [];

  constructor(options: TwoOptDiagnosticOptions = {}) {
    this.options = {
      ...DEFAULT_TWO_OPT_DIAGNOSTIC_OPTIONS,
      ...options,
      scoreWeights: options.scoreWeights ?? defaultCycleScoreWeights,
      searchNeighborhood: options.searchNeighborhood ?? DEFAULT_TWO_OPT_DIAGNOSTIC_OPTIONS.searchNeighborhood
    };
  }

  analyze(state: GameState, oldCycle: HamiltonianCycle): TwoOptDiagnosticsResult {
    const baselineFeatures = computeCycleFeatures(state, oldCycle, oldCycle);
    this.lastDiagnostics = {
      ...EMPTY_TWO_OPT_DIAGNOSTICS,
      bestPathLenBefore: baselineFeatures.pathLen,
      bestScoreBefore: scoreCycleFeatures(baselineFeatures, this.options.scoreWeights)
    };
    this.lastInvalidCandidateDetails = [];

    const seenSignatures = new Set<string>([buildCycleEdgeSignature(oldCycle)]);
    let bestCandidate: HamiltonianCycle | null = null;
    let bestFeatures: CycleFeatures | null = null;

    for (const attempt of this.generateCandidateAttempts(state, oldCycle)) {
      this.lastDiagnostics.replacementPairsConsidered += 1;

      if (attempt.replacementEdgesMissing) {
        this.lastDiagnostics.replacementEdgesMissing += 1;
        continue;
      }

      if (!attempt.candidate) {
        continue;
      }

      this.lastDiagnostics.rawCandidatesGenerated += 1;
      const signature = buildCycleEdgeSignature(attempt.candidate);
      if (seenSignatures.has(signature)) {
        this.lastDiagnostics.duplicateCandidatesSkipped += 1;
        continue;
      }
      seenSignatures.add(signature);

      if (!validateHamiltonianCycle(state.map.graph, attempt.candidate)) {
        this.lastDiagnostics.graphInvalidCandidates += 1;
        const detail = inspectInvalidCandidate(state.map.graph, oldCycle, attempt);
        if (detail) {
          this.lastInvalidCandidateDetails.push(detail);
          incrementInvalidFailureCounter(this.lastDiagnostics, detail.failureCategory);
        }
        continue;
      }

      if (!bodyContiguous(state.snake.segments, attempt.candidate)) {
        this.lastDiagnostics.bodyContiguousFailed += 1;
        continue;
      }

      if (!appleForward(state.snake.segments, state.appleNodeId, attempt.candidate)) {
        this.lastDiagnostics.appleForwardFailed += 1;
        continue;
      }

      const features = computeCycleFeatures(state, oldCycle, attempt.candidate);
      this.lastDiagnostics.validCandidates += 1;

      if (bestFeatures === null || compareCandidateCycles(features, bestFeatures, this.options.scoreWeights) < 0) {
        bestCandidate = [...attempt.candidate];
        bestFeatures = features;
      }

      if (isImprovingCandidate(baselineFeatures, features, this.options.scoreWeights)) {
        this.lastDiagnostics.improvingCandidates += 1;
      }
    }

    this.lastDiagnostics.bestPathLenAfter = bestFeatures?.pathLen ?? null;
    this.lastDiagnostics.bestScoreAfter = bestFeatures ? scoreCycleFeatures(bestFeatures, this.options.scoreWeights) : null;

    return {
      diagnostics: { ...this.lastDiagnostics },
      bestCandidate,
      bestFeatures,
      invalidCandidateDetails: this.lastInvalidCandidateDetails.map((detail) => ({
        ...detail,
        edgePairIndices: { ...detail.edgePairIndices },
        intendedReplacementEdges: detail.intendedReplacementEdges.map((edge) => ({ ...edge })),
        firstInvalidEdge: detail.firstInvalidEdge ? { ...detail.firstInvalidEdge } : null
      }))
    };
  }

  protected generateCandidateAttempts(state: GameState, oldCycle: HamiltonianCycle): CandidateAttempt[] {
    const pairs = reorderEdgePairs(
      oldCycle,
      buildEdgePairs(oldCycle),
      buildSearchFocus(state, oldCycle, this.options.searchNeighborhood),
      this.options.exhaustive
    );
    const attempts: CandidateAttempt[] = [];

    for (const pair of pairs) {
      if (this.lastDiagnostics.edgePairsConsidered >= this.options.maxPairsChecked) {
        this.lastDiagnostics.budgetExhausted = true;
        return attempts;
      }
      this.lastDiagnostics.edgePairsConsidered += 1;

      const firstStart = oldCycle[pair.firstIndex]!;
      const firstNext = oldCycle[(pair.firstIndex + 1) % oldCycle.length]!;
      const secondStart = oldCycle[pair.secondIndex]!;
      const secondNext = oldCycle[(pair.secondIndex + 1) % oldCycle.length]!;

      attempts.push(this.buildAttemptForReconnectMode(state, oldCycle, pair, firstStart, firstNext, secondStart, secondNext, 'ac-bd'));
      attempts.push(this.buildAttemptForReconnectMode(state, oldCycle, pair, firstStart, firstNext, secondStart, secondNext, 'ad-bc'));
    }

    return attempts;
  }

  protected buildAttemptForReconnectMode(
    state: GameState,
    oldCycle: HamiltonianCycle,
    edgePairIndices: EdgePair,
    firstStart: NodeId,
    firstNext: NodeId,
    secondStart: NodeId,
    secondNext: NodeId,
    mode: TwoOptReconnectMode
  ): CandidateAttempt {
    const intendedReplacementEdges = mode === 'ac-bd'
      ? [
          { from: firstStart, to: secondStart },
          { from: firstNext, to: secondNext }
        ]
      : [
          { from: firstStart, to: secondNext },
          { from: firstNext, to: secondStart }
        ];
    const allIntendedReplacementEdgesExist = intendedReplacementEdges.every((edge) => edgeExistsInGraph(state.map.graph, edge.from, edge.to));
    if (!allIntendedReplacementEdgesExist) {
      return {
        candidate: null,
        replacementEdgesMissing: true,
        edgePairIndices,
        reconnectMode: mode,
        intendedReplacementEdges,
          allIntendedReplacementEdgesExist,
          layout: null
      };
    }

    const construction = constructTwoOptCandidate(oldCycle, edgePairIndices, mode);
    return {
      candidate: construction?.candidate ?? null,
      replacementEdgesMissing: false,
      edgePairIndices,
      reconnectMode: mode,
      intendedReplacementEdges,
      allIntendedReplacementEdgesExist,
      layout: construction?.layout ?? null
    };
  }
}
