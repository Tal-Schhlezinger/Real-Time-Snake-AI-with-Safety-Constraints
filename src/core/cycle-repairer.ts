import { appleForward, bodyContiguous } from './hamiltonian-certificate.js';
import { distanceForwardOnCycle } from './hamiltonian-certificate.js';
import { compareCandidateCycles, computeCycleFeatures, defaultCycleScoreWeights, type CycleScoreWeights } from './cycle-scoring.js';
import { nodeIdForCoord } from './coords.js';
import { edgeExists, hydrateGraph } from './graph.js';
import { validateHamiltonianCycle } from './map-validator.js';
import type { AiStrategyName, GameState, HamiltonianCycle, NodeId } from './types.js';

export interface CycleRepairer {
  proposeCycle(state: GameState, oldCycle: HamiltonianCycle): HamiltonianCycle | null;
}

export class NullCycleRepairer implements CycleRepairer {
  proposeCycle(): HamiltonianCycle | null {
    return null;
  }
}

export interface RectangleFlipRepairOptions {
  maxFlipsChecked?: number;
  searchNeighborhood?: number | null;
  allowNonImprovingRepairs?: boolean;
  scoreWeights?: CycleScoreWeights;
}

export interface RectangleFlipRepairStats {
  rectanglesVisited: number;
  candidatesChecked: number;
  validCandidatesFound: number;
}

export interface RectangleFlipRepairDiagnostics {
  rectanglesScanned: number;
  rectanglesInFocus: number;
  patternsConsidered: number;
  rawCandidatesGenerated: number;
  duplicateCandidatesSkipped: number;
  graphInvalidCandidates: number;
  bodyContiguousFailed: number;
  appleForwardFailed: number;
  nonImprovingCandidates: number;
  acceptedCandidates: number;
  budgetExhausted: boolean;
}

interface RectanglePattern {
  currentStart: NodeId;
  currentNext: NodeId;
  otherStart: NodeId;
  otherNext: NodeId;
  replacementLeft: NodeId;
  replacementRight: NodeId;
}

interface CandidateEvaluation {
  cycle: HamiltonianCycle;
  features: ReturnType<typeof computeCycleFeatures>;
}

const DEFAULT_RECTANGLE_FLIP_REPAIR_OPTIONS: Required<RectangleFlipRepairOptions> = {
  maxFlipsChecked: 24,
  searchNeighborhood: 3,
  allowNonImprovingRepairs: false,
  scoreWeights: defaultCycleScoreWeights
};

const EMPTY_RECTANGLE_FLIP_REPAIR_DIAGNOSTICS: RectangleFlipRepairDiagnostics = {
  rectanglesScanned: 0,
  rectanglesInFocus: 0,
  patternsConsidered: 0,
  rawCandidatesGenerated: 0,
  duplicateCandidatesSkipped: 0,
  graphInvalidCandidates: 0,
  bodyContiguousFailed: 0,
  appleForwardFailed: 0,
  nonImprovingCandidates: 0,
  acceptedCandidates: 0,
  budgetExhausted: false
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

function applyTwoOptFlip(
  cycle: HamiltonianCycle,
  firstStart: NodeId,
  firstNext: NodeId,
  secondStart: NodeId,
  secondNext: NodeId,
  replacementLeft: NodeId,
  replacementRight: NodeId,
  graph: ReturnType<typeof hydrateGraph>
): HamiltonianCycle | null {
  if (!edgeExists(graph, replacementLeft, replacementRight) && !edgeExists(graph, replacementRight, replacementLeft)) {
    return null;
  }

  if (!edgeExists(graph, firstStart, secondStart) || !edgeExists(graph, firstNext, secondNext)) {
    return null;
  }

  const rotated = rotateCycleToStart(cycle, firstStart);
  if (!rotated || rotated[1] !== firstNext) {
    return null;
  }

  const secondIndex = rotated.indexOf(secondStart);
  if (secondIndex <= 1 || secondIndex >= rotated.length - 1 || rotated[secondIndex + 1] !== secondNext) {
    return null;
  }

  return [rotated[0]!, ...rotated.slice(1, secondIndex + 1).reverse(), ...rotated.slice(secondIndex + 1)];
}

function buildRectanglePatterns(tl: NodeId, tr: NodeId, br: NodeId, bl: NodeId): RectanglePattern[] {
  return [
    {
      currentStart: tl,
      currentNext: tr,
      otherStart: bl,
      otherNext: br,
      replacementLeft: tl,
      replacementRight: bl
    },
    {
      currentStart: tr,
      currentNext: tl,
      otherStart: br,
      otherNext: bl,
      replacementLeft: tr,
      replacementRight: br
    },
    {
      currentStart: tl,
      currentNext: bl,
      otherStart: tr,
      otherNext: br,
      replacementLeft: tl,
      replacementRight: tr
    },
    {
      currentStart: bl,
      currentNext: tl,
      otherStart: br,
      otherNext: tr,
      replacementLeft: bl,
      replacementRight: br
    }
  ];
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

function isRectangleInFocus(corners: NodeId[], focus: Set<NodeId> | null): boolean {
  if (!focus) {
    return true;
  }
  return corners.some((corner) => focus.has(corner));
}

function isCandidateCycleValid(state: GameState, candidate: HamiltonianCycle): boolean {
  return (
    validateHamiltonianCycle(state.map.graph, candidate) &&
    bodyContiguous(state.snake.segments, candidate) &&
    appleForward(state.snake.segments, state.appleNodeId, candidate)
  );
}

function isCandidateImproving(
  baseline: ReturnType<typeof computeCycleFeatures>,
  candidate: ReturnType<typeof computeCycleFeatures>,
  weights: CycleScoreWeights,
  allowNonImprovingRepairs: boolean
): boolean {
  if (allowNonImprovingRepairs) {
    return true;
  }

  const pathImproves =
    baseline.pathLen !== null &&
    candidate.pathLen !== null &&
    candidate.pathLen < baseline.pathLen;

  return pathImproves || compareCandidateCycles(candidate, baseline, weights) < 0;
}

export class RectangleFlipCycleRepairer implements CycleRepairer {
  readonly options: Required<RectangleFlipRepairOptions>;
  lastSearchStats: RectangleFlipRepairStats = {
    rectanglesVisited: 0,
    candidatesChecked: 0,
    validCandidatesFound: 0
  };
  lastDiagnostics: RectangleFlipRepairDiagnostics = { ...EMPTY_RECTANGLE_FLIP_REPAIR_DIAGNOSTICS };

  constructor(options: RectangleFlipRepairOptions = {}) {
    this.options = {
      ...DEFAULT_RECTANGLE_FLIP_REPAIR_OPTIONS,
      ...options,
      scoreWeights: options.scoreWeights ?? defaultCycleScoreWeights,
      searchNeighborhood: options.searchNeighborhood ?? DEFAULT_RECTANGLE_FLIP_REPAIR_OPTIONS.searchNeighborhood
    };
  }

  proposeCycle(state: GameState, oldCycle: HamiltonianCycle): HamiltonianCycle | null {
    const baselineFeatures = computeCycleFeatures(state, oldCycle, oldCycle);
    const validCandidates: CandidateEvaluation[] = [];
    for (const candidate of this.generateCandidateCycles(state, oldCycle)) {
      if (!validateHamiltonianCycle(state.map.graph, candidate)) {
        this.lastDiagnostics.graphInvalidCandidates += 1;
        continue;
      }

      if (!bodyContiguous(state.snake.segments, candidate)) {
        this.lastDiagnostics.bodyContiguousFailed += 1;
        continue;
      }

      if (!appleForward(state.snake.segments, state.appleNodeId, candidate)) {
        this.lastDiagnostics.appleForwardFailed += 1;
        continue;
      }

      const features = computeCycleFeatures(state, oldCycle, candidate);
      if (!isCandidateImproving(baselineFeatures, features, this.options.scoreWeights, this.options.allowNonImprovingRepairs)) {
        this.lastDiagnostics.nonImprovingCandidates += 1;
        continue;
      }

      validCandidates.push({ cycle: candidate, features });
      this.lastSearchStats.validCandidatesFound += 1;
      this.lastDiagnostics.acceptedCandidates += 1;
    }

    return this.selectBestCandidate(validCandidates, baselineFeatures);
  }

  protected generateCandidateCycles(state: GameState, oldCycle: HamiltonianCycle): HamiltonianCycle[] {
    const graph = hydrateGraph(state.map.graph);
    const focus = buildSearchFocus(state, oldCycle, this.options.searchNeighborhood);
    const seenSignatures = new Set<string>([buildCycleEdgeSignature(oldCycle)]);
    const sourceCycles: HamiltonianCycle[] = [oldCycle, [...oldCycle].reverse()];
    const candidates: HamiltonianCycle[] = [];

    this.lastSearchStats = {
      rectanglesVisited: 0,
      candidatesChecked: 0,
      validCandidatesFound: 0
    };
    this.lastDiagnostics = { ...EMPTY_RECTANGLE_FLIP_REPAIR_DIAGNOSTICS };

    for (let y = 0; y < state.map.height - 1; y += 1) {
      for (let x = 0; x < state.map.width - 1; x += 1) {
        this.lastDiagnostics.rectanglesScanned += 1;
        const tl = nodeIdForCoord({ x, y });
        const tr = nodeIdForCoord({ x: x + 1, y });
        const br = nodeIdForCoord({ x: x + 1, y: y + 1 });
        const bl = nodeIdForCoord({ x, y: y + 1 });
        const corners = [tl, tr, br, bl];

        if (!corners.every((nodeId) => graph.nodesById.has(nodeId)) || !isRectangleInFocus(corners, focus)) {
          continue;
        }

        this.lastSearchStats.rectanglesVisited += 1;
        this.lastDiagnostics.rectanglesInFocus += 1;

        for (const sourceCycle of sourceCycles) {
          for (const pattern of buildRectanglePatterns(tl, tr, br, bl)) {
            if (this.lastSearchStats.candidatesChecked >= this.options.maxFlipsChecked) {
              this.lastDiagnostics.budgetExhausted = true;
              return candidates;
            }

            this.lastDiagnostics.patternsConsidered += 1;

            const candidate = applyTwoOptFlip(
              sourceCycle,
              pattern.currentStart,
              pattern.currentNext,
              pattern.otherStart,
              pattern.otherNext,
              pattern.replacementLeft,
              pattern.replacementRight,
              graph
            );

            if (!candidate) {
              continue;
            }

            const signature = buildCycleEdgeSignature(candidate);
            if (seenSignatures.has(signature)) {
              this.lastDiagnostics.duplicateCandidatesSkipped += 1;
              continue;
            }
            seenSignatures.add(signature);
            this.lastSearchStats.candidatesChecked += 1;
            this.lastDiagnostics.rawCandidatesGenerated += 1;
            candidates.push(candidate);
          }
        }
      }
    }

    return candidates;
  }

  private selectBestCandidate(
    candidates: CandidateEvaluation[],
    baselineFeatures: ReturnType<typeof computeCycleFeatures>
  ): HamiltonianCycle | null {
    if (candidates.length === 0) {
      return null;
    }

    const best = [...candidates].sort((left, right) => compareCandidateCycles(left.features, right.features, this.options.scoreWeights))[0]!;
    if (
      !this.options.allowNonImprovingRepairs &&
      !isCandidateImproving(baselineFeatures, best.features, this.options.scoreWeights, false)
    ) {
      return null;
    }
    return [...best.cycle];
  }
}

export interface CertifiedHamiltonianPostStepRepairArgs {
  previousState: GameState;
  nextState: GameState;
  strategy: AiStrategyName | null;
  cycleRepairer: CycleRepairer;
}

export function getCertifiedLockedCycle(state: GameState): HamiltonianCycle {
  return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}

export function shouldAttemptCycleRepair(
  previousState: GameState,
  nextState: GameState,
  strategy: AiStrategyName | null
): boolean {
  return (
    strategy === 'certified-hamiltonian' &&
    previousState.applesEaten < nextState.applesEaten &&
    nextState.appleNodeId !== null
  );
}

export function applyCertifiedHamiltonianPostStepRepair({
  previousState,
  nextState,
  strategy,
  cycleRepairer
}: CertifiedHamiltonianPostStepRepairArgs): GameState {
  if (strategy !== 'certified-hamiltonian') {
    return nextState;
  }

  const oldCycle = getCertifiedLockedCycle(previousState);
  if (!shouldAttemptCycleRepair(previousState, nextState, strategy)) {
    return nextState;
  }

  const proposal = cycleRepairer.proposeCycle(nextState, oldCycle);
  if (!proposal) {
    return {
      ...nextState,
      lockedHamiltonianCycle: [...oldCycle]
    };
  }

  if (
    !validateHamiltonianCycle(nextState.map.graph, proposal) ||
    !bodyContiguous(nextState.snake.segments, proposal) ||
    !appleForward(nextState.snake.segments, nextState.appleNodeId, proposal)
  ) {
    return {
      ...nextState,
      lockedHamiltonianCycle: [...oldCycle]
    };
  }

  return {
    ...nextState,
    lockedHamiltonianCycle: [...proposal]
  };
}

export function applyCertifiedCycleRepair(
  previousState: GameState,
  nextState: GameState,
  cycleRepairer: CycleRepairer
): GameState {
  return applyCertifiedHamiltonianPostStepRepair({
    previousState,
    nextState,
    strategy: previousState.aiStrategy,
    cycleRepairer
  });
}
