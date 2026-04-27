import assert from 'node:assert/strict';
import { coordFromNodeId, nodeIdForCoord } from '../src/core/coords';
import { decideAiMove } from '../src/core/ai-controller';
import { advanceGame } from '../src/core/game-engine';
import { createInitialGameState } from '../src/core/game-state';
import { buildGraphFromDraft } from '../src/core/graph';
import { localIndex, getRectanglePaths } from '../src/core/rectangle-path-cache';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import {
  analyzeRectanglePatch,
  analyzeRectanglePatches,
  classifyPatchMutationCandidateForSnake,
  classifyPatchMutationCandidatesForSnake,
  comparePatchMutationFeaturesForRanking,
  enumerateRectangles,
  extractInsideCycleEdges,
  extractCycleSegment,
  generateRectanglePatchMutationCandidates,
  getCycleCutCrossings,
  isFullRectangleInBoard,
  pathUsesExactlyPatch,
  rankPatchMutationCandidates,
  sameNodeSet,
  scorePatchMutationCandidate,
  spliceTwoTerminalPatchPath
} from '../src/core/two-terminal-patch-mutation';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import type { GameState, NodeId } from '../src/core/types';
import type { PatchMutationFeatures } from '../src/core/two-terminal-patch-mutation';
import { describe, it } from './testkit';

const syntheticOldCycle = ['a', 'p1', 'p2', 'p3', 'p4', 'b', 'o1', 'o2'];
const syntheticPatchNodes = new Set<NodeId>(['a', 'p1', 'p2', 'p3', 'p4', 'b']);
const syntheticOldInternalPath = ['a', 'p1', 'p2', 'p3', 'p4', 'b'];
const syntheticReplacementPath = ['a', 'p2', 'p4', 'p1', 'p3', 'b'];

function spliceSynthetic(replacementInternalPath: NodeId[] = syntheticReplacementPath): NodeId[] | null {
  return spliceTwoTerminalPatchPath({
    oldCycle: syntheticOldCycle,
    patchNodeSet: syntheticPatchNodes,
    terminalA: 'a',
    terminalB: 'b',
    oldInternalPath: syntheticOldInternalPath,
    replacementInternalPath
  });
}

function arraysEqual(a: readonly NodeId[], b: readonly NodeId[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withoutProfile<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => key === 'profile' ? undefined : nestedValue)) as T;
}

function stepUntilNextApple(state: GameState): GameState {
  let current = state;
  const targetApples = state.applesEaten + 1;

  for (let step = 0; step < state.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
    const decision = decideAiMove(current, 'certified-hamiltonian');
    assert.ok(decision);
    current = advanceGame(current, decision.direction, 0, { next: () => 0 });
    if (current.applesEaten >= targetApples) {
      return current;
    }
  }

  return current;
}

function makePatchMutationFeatures(overrides: Partial<PatchMutationFeatures> = {}): PatchMutationFeatures {
  const base: Omit<PatchMutationFeatures, 'patchMutationScore'> = {
    candidateId: 'candidate-a',
    patchId: 'rect-0-0-2x2',
    usabilityMode: 'immediate-locked',
    pathLenToCurrentApple: 4,
    transitionPathLength: null,
    currentLockedCyclePathLen: 6,
    pathLenImprovement: 2,
    mutationSize: {
      changedCycleEdges: 4,
      rectangleArea: 4
    },
    cycleScore: 10,
    cycleFeatures: null
  };
  const merged = {
    ...base,
    ...overrides,
    mutationSize: {
      ...base.mutationSize,
      ...overrides.mutationSize
    }
  };

  return {
    ...merged,
    patchMutationScore: overrides.patchMutationScore ?? scorePatchMutationCandidate(merged)
  };
}

describe('Two-terminal patch mutation splice helper', () => {
  it('splices a small artificial cycle when replacement uses the same terminals and patch nodes', () => {
    assert.deepEqual(spliceSynthetic(), ['a', 'p2', 'p4', 'p1', 'p3', 'b', 'o1', 'o2']);
  });

  it('candidate cycle has the same node set as oldCycle', () => {
    const candidate = spliceSynthetic();

    assert.ok(candidate);
    assert.equal(sameNodeSet(candidate, syntheticOldCycle), true);
  });

  it('candidate cycle has no duplicates', () => {
    const candidate = spliceSynthetic();

    assert.ok(candidate);
    assert.equal(new Set(candidate).size, candidate.length);
  });

  it('candidate preserves outside nodes in the same order', () => {
    const candidate = spliceSynthetic();

    assert.ok(candidate);
    assert.deepEqual(
      candidate.filter((nodeId) => !syntheticPatchNodes.has(nodeId)),
      syntheticOldCycle.filter((nodeId) => !syntheticPatchNodes.has(nodeId))
    );
  });

  it('candidate contains replacementInternalPath as the internal patch segment', () => {
    const candidate = spliceSynthetic();

    assert.ok(candidate);
    assert.deepEqual(candidate.slice(0, syntheticReplacementPath.length), syntheticReplacementPath);
  });

  it('replacement with missing patch node is rejected', () => {
    assert.equal(spliceSynthetic(['a', 'p2', 'p4', 'p1', 'b']), null);
  });

  it('replacement with duplicate patch node is rejected', () => {
    assert.equal(spliceSynthetic(['a', 'p2', 'p4', 'p1', 'p1', 'b']), null);
  });

  it('replacement with wrong terminal is rejected', () => {
    assert.equal(spliceSynthetic(['a', 'p2', 'p4', 'p1', 'b', 'p3']), null);
  });

  it('replacement with same path as old path returns null as a no-op', () => {
    assert.equal(spliceSynthetic(syntheticOldInternalPath), null);
  });

  it('reversed replacement orientation is supported by orienting it to the old internal segment', () => {
    const reversedReplacement = [...syntheticReplacementPath].reverse();

    assert.deepEqual(spliceSynthetic(reversedReplacement), ['a', 'p2', 'p4', 'p1', 'p3', 'b', 'o1', 'o2']);
  });

  it('pathUsesExactlyPatch rejects duplicates and missing patch vertices', () => {
    assert.equal(pathUsesExactlyPatch(syntheticReplacementPath, syntheticPatchNodes), true);
    assert.equal(pathUsesExactlyPatch(['a', 'p2', 'p4', 'p1', 'p1', 'b'], syntheticPatchNodes), false);
    assert.equal(pathUsesExactlyPatch(['a', 'p2', 'p4', 'p1', 'b'], syntheticPatchNodes), false);
  });

  it('extractCycleSegment returns the unique contiguous patch segment when it is unambiguous', () => {
    assert.deepEqual(extractCycleSegment(syntheticOldCycle, 'a', 'b', syntheticPatchNodes), syntheticOldInternalPath);
  });

  it('spliced cached rectangle path can validate as a Hamiltonian cycle on a small grid board', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const oldCycle = map.hamiltonianCycle;
    const terminalA = oldCycle[0]!;
    const terminalB = oldCycle[oldCycle.length - 1]!;
    const patchNodeSet = new Set<NodeId>(oldCycle);
    const terminalACoord = coordFromNodeId(terminalA);
    const terminalBCoord = coordFromNodeId(terminalB);
    const localTerminalA = localIndex(terminalACoord.x, terminalACoord.y, 4);
    const localTerminalB = localIndex(terminalBCoord.x, terminalBCoord.y, 4);
    const oldLocalPath = oldCycle.map((nodeId) => {
      const coord = coordFromNodeId(nodeId);
      return localIndex(coord.x, coord.y, 4);
    });
    const replacementLocalPath = getRectanglePaths(4, 4, localTerminalA, localTerminalB, {
      maxPathsPerTerminalPair: 64
    }).find((path) => !arraysEqual(path.map(String), oldLocalPath.map(String)));

    assert.ok(replacementLocalPath);

    const replacementPath = replacementLocalPath.map((index) => {
      const x = index % 4;
      const y = Math.floor(index / 4);
      return nodeIdForCoord({ x, y });
    });

    const candidate = spliceTwoTerminalPatchPath({
      oldCycle,
      patchNodeSet,
      terminalA,
      terminalB,
      oldInternalPath: oldCycle,
      replacementInternalPath: replacementPath
    });

    assert.ok(candidate);
    assert.equal(validateHamiltonianCycle(map.graph, candidate), true);
  });
});

describe('Rectangle two-terminal patch diagnostics', () => {
  it('enumerates rectangles deterministically within configured bounds', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });

    assert.deepEqual(enumerateRectangles(map.graph, { maxWidth: 2, maxHeight: 2, maxArea: 4 }).slice(0, 4), [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 2, height: 1 },
      { x: 0, y: 0, width: 1, height: 2 },
      { x: 0, y: 0, width: 2, height: 2 }
    ]);
  });

  it('finds a known two-terminal rectangle patch in a controlled cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const rect = { x: 0, y: 0, width: 4, height: 2 };
    const result = analyzeRectanglePatch(map.graph, map.hamiltonianCycle, rect);

    assert.equal(result.fullRectangle, true);
    assert.equal(result.crossingCount, 2);
    assert.deepEqual(result.terminals, {
      terminalA: 'n-1-1',
      terminalB: 'n-0-1'
    });
    assert.equal(result.internalDegreePatternValid, true);
    assert.equal(result.internalPathConnected, true);
    assert.equal(result.internalPathVisitsAllVertices, true);
    assert.deepEqual(result.originalInsidePath, [
      'n-0-1',
      'n-0-0',
      'n-1-0',
      'n-2-0',
      'n-3-0',
      'n-3-1',
      'n-2-1',
      'n-1-1'
    ]);
  });

  it('rejects rectangles with crossing count 0 or 3+', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const wholeBoard = analyzeRectanglePatch(map.graph, map.hamiltonianCycle, { x: 0, y: 0, width: 4, height: 4 });
    const fourCrossings = analyzeRectanglePatch(map.graph, map.hamiltonianCycle, { x: 1, y: 0, width: 2, height: 2 });

    assert.equal(wholeBoard.crossingCount, 0);
    assert.equal(wholeBoard.rejectionReason, 'crossing-count-not-two');
    assert.equal(fourCrossings.crossingCount >= 3, true);
    assert.equal(fourCrossings.rejectionReason, 'crossing-count-not-two');
  });

  it('does not produce odd crossing counts for closed cycle rectangle membership', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const diagnostics = analyzeRectanglePatches(map.graph, map.hamiltonianCycle, { maxWidth: 4, maxHeight: 4, maxArea: 16 });

    assert.equal(diagnostics.patches.some((patch) => patch.crossingCount % 2 === 1), false);
  });

  it('rejects a rectangle with a missing non-playable cell', () => {
    const graph = buildGraphFromDraft({
      width: 3,
      height: 3,
      walls: [{ x: 1, y: 1 }],
      portals: []
    }).graph;
    const cycle = ['n-0-0', 'n-1-0', 'n-2-0', 'n-2-1', 'n-2-2', 'n-1-2', 'n-0-2', 'n-0-1'];
    const result = analyzeRectanglePatch(graph, cycle, { x: 0, y: 0, width: 3, height: 3 });

    assert.equal(isFullRectangleInBoard(graph, { x: 0, y: 0, width: 3, height: 3 }), false);
    assert.equal(result.fullRectangle, false);
    assert.equal(result.vertexCount, 8);
    assert.equal(result.rejectionReason, 'rectangle-not-full');
  });

  it('identifies terminals from the two cut crossings', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const rectNodeSet = new Set(['n-0-0', 'n-1-0', 'n-2-0', 'n-3-0', 'n-0-1', 'n-1-1', 'n-2-1', 'n-3-1']);
    const crossings = getCycleCutCrossings(map.hamiltonianCycle, rectNodeSet);

    assert.deepEqual(crossings.map((crossing) => crossing.insideNode), ['n-1-1', 'n-0-1']);
    assert.deepEqual(crossings.map((crossing) => crossing.outsideNode), ['n-1-2', 'n-0-2']);
  });

  it('verifies the original inside path visits every patch node exactly once', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const rectNodeSet = new Set(['n-0-0', 'n-1-0', 'n-2-0', 'n-3-0', 'n-0-1', 'n-1-1', 'n-2-1', 'n-3-1']);
    const insideEdges = extractInsideCycleEdges(map.hamiltonianCycle, rectNodeSet);
    const segment = extractCycleSegment(map.hamiltonianCycle, 'n-1-1', 'n-0-1', rectNodeSet);

    assert.equal(insideEdges.length, rectNodeSet.size - 1);
    assert.ok(segment);
    assert.equal(pathUsesExactlyPatch(segment, rectNodeSet), true);
  });

  it('reports alternativePathCount from RectanglePathCache', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const rect = { x: 0, y: 0, width: 4, height: 2 };
    const result = analyzeRectanglePatch(map.graph, map.hamiltonianCycle, rect);
    const expectedAlternativeCount =
      getRectanglePaths(4, 2, localIndex(0, 1, 4), localIndex(1, 1, 4)).length - 1;

    assert.equal(result.cacheKey, '4x2:4->5');
    assert.equal(result.alternativePathCount, expectedAlternativeCount);
  });

  it('reports cache-miss when a theorem-compatible rectangle exceeds the path cache area limit', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const result = analyzeRectanglePatches(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 3,
      maxArea: 12,
      pathCacheOptions: { maxArea: 6 }
    }).patches.find((patch) => patch.rect.x === 0 && patch.rect.y === 0 && patch.rect.width === 4 && patch.rect.height === 3);

    assert.ok(result);
    assert.equal(result.rejectionReason, 'cache-miss');
    assert.equal(result.cacheKey, '4x3:8->11');
    assert.equal(result.alternativePathCount, null);
  });

  it('diagnostics do not mutate cycle or graph state', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const graphBefore = JSON.parse(JSON.stringify(map.graph));
    const cycleBefore = [...map.hamiltonianCycle];

    analyzeRectanglePatches(map.graph, map.hamiltonianCycle, { maxWidth: 4, maxHeight: 4, maxArea: 16 });

    assert.deepEqual(map.graph, graphBefore);
    assert.deepEqual(map.hamiltonianCycle, cycleBefore);
  });

  it('aggregate diagnostics output is deterministic', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const options = { maxWidth: 4, maxHeight: 4, maxArea: 16 };

    assert.deepEqual(
      analyzeRectanglePatches(map.graph, map.hamiltonianCycle, options),
      analyzeRectanglePatches(map.graph, map.hamiltonianCycle, options)
    );
  });
});

describe('Rectangle patch splice candidate diagnostics', () => {
  it('splicing from detected patches preserves the old cycle node set', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const result = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.ok(result.candidates.length > 0);
    for (const candidate of result.candidates) {
      assert.equal(sameNodeSet(candidate.cycle, map.hamiltonianCycle), true);
    }
  });

  it('detected patch alternatives generate raw candidates', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const result = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.equal(result.aggregate.validTwoTerminalPatches > 0, true);
    assert.equal(result.aggregate.alternativesConsidered > 0, true);
    assert.equal(result.aggregate.rawCandidatesGenerated > 0, true);
  });

  it('every raw candidate is passed through validateHamiltonianCycle', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    let validationCalls = 0;
    const result = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      validateCycle: (graph, candidateCycle) => {
        validationCalls += 1;
        return validateHamiltonianCycle(graph, candidateCycle);
      }
    });

    assert.equal(validationCalls, result.aggregate.rawCandidatesGenerated);
    assert.equal(
      validationCalls,
      result.candidateDiagnostics.filter((diagnostic) => diagnostic.rawCandidateGenerated).length
    );
  });

  it('graph-valid candidates are counted', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const result = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.equal(result.aggregate.graphValidCandidates > 0, true);
    assert.equal(result.aggregate.graphInvalidCandidates, 0);
    assert.equal(result.candidates.length, result.aggregate.graphValidCandidates);
  });

  it('duplicate candidates are deduplicated', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const result = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.equal(result.aggregate.duplicateCandidates > 0, true);
    assert.equal(
      result.candidateDiagnostics.filter((diagnostic) => diagnostic.rejectionReason === 'duplicate-candidate').length,
      result.aggregate.duplicateCandidates
    );
  });

  it('no-op alternatives are skipped', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const result = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.equal(result.aggregate.noOpAlternatives > 0, true);
    assert.equal(
      result.candidateDiagnostics.filter((diagnostic) => diagnostic.rejectionReason === 'no-op-alternative').length,
      result.aggregate.noOpAlternatives
    );
  });

  it('generation diagnostics do not mutate cycle or graph state', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const graphBefore = JSON.parse(JSON.stringify(map.graph));
    const cycleBefore = [...map.hamiltonianCycle];

    generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.deepEqual(map.graph, graphBefore);
    assert.deepEqual(map.hamiltonianCycle, cycleBefore);
  });

  it('generation output is deterministic', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const options = { maxWidth: 4, maxHeight: 4, maxArea: 16 };

    const first = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, options);
    const second = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, options);

    assert.equal(first.profile.generationMs >= 0, true);
    assert.deepEqual(withoutProfile(second), withoutProfile(first));
  });
});

describe('Rectangle patch mutation Snake certification classification', () => {
  it('graph-valid candidate with validLockedCertificate and appleForward is classified immediate-locked-valid', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const result = classifyPatchMutationCandidateForSnake(state, { cycle: map.hamiltonianCycle });

    assert.equal(result.graphValid, true);
    assert.equal(result.immediateLockedCertificate, true);
    assert.equal(result.immediateAppleForward, true);
    assert.equal(result.usableForSnake, true);
    assert.equal(result.reason, 'immediate-locked-valid');
  });

  it('graph-valid candidate with validLockedCertificate but failing appleForward is not immediate-usable', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const state = {
      ...initial,
      appleNodeId: initial.snake.segments[0]!
    };
    const result = classifyPatchMutationCandidateForSnake(state, { cycle: map.hamiltonianCycle }, {
      transitionOptions: { maxPaths: 4, slack: 0 }
    });

    assert.equal(result.graphValid, true);
    assert.equal(result.immediateLockedCertificate, true);
    assert.equal(result.immediateAppleForward, false);
    assert.equal(result.usableForSnake, false);
    assert.equal(result.reason, 'immediate-locked-valid-but-apple-forward-failed');
  });

  it('graph-valid candidate without immediate certificate but with transition plan is classified transition-valid', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    state = stepUntilNextApple(state);
    state = stepUntilNextApple(state);
    state = stepUntilNextApple(state);
    const candidate = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    }).candidates[0];

    assert.ok(candidate);
    const result = classifyPatchMutationCandidateForSnake(state, candidate, {
      transitionOptions: { maxPaths: 64, slack: 6 }
    });

    assert.equal(result.graphValid, true);
    assert.equal(result.immediateLockedCertificate, false);
    assert.equal(result.transitionPlanExists, true);
    assert.equal(result.transitionPathLength, 8);
    assert.equal(result.usableForSnake, true);
    assert.equal(result.reason, 'transition-valid');
  });

  it('graph-valid candidate with neither immediate certificate nor transition plan is rejected', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    state = stepUntilNextApple(state);
    state = stepUntilNextApple(state);
    const candidate = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    }).candidates[0];

    assert.ok(candidate);
    const result = classifyPatchMutationCandidateForSnake(state, candidate, {
      transitionOptions: { maxPaths: 64, slack: 6 }
    });

    assert.equal(result.graphValid, true);
    assert.equal(result.immediateLockedCertificate, false);
    assert.equal(result.transitionPlanExists, false);
    assert.equal(result.usableForSnake, false);
    assert.equal(result.reason, 'locked-invalid-transition-not-found');
  });

  it('graph-invalid candidate is never usable', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const invalidCycle = [...map.hamiltonianCycle];
    invalidCycle[1] = invalidCycle[0]!;
    const result = classifyPatchMutationCandidateForSnake(state, { cycle: invalidCycle });

    assert.equal(result.graphValid, false);
    assert.equal(result.usableForSnake, false);
    assert.equal(result.reason, 'graph-invalid');
  });

  it('classification does not mutate gameplay state', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const before = clone(state);

    classifyPatchMutationCandidatesForSnake(state, map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      transitionOptions: { maxPaths: 8, slack: 2 }
    });

    assert.deepEqual(state, before);
  });

  it('classification diagnostics are deterministic', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const options = {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      transitionOptions: { maxPaths: 8, slack: 2 }
    };

    const first = classifyPatchMutationCandidatesForSnake(state, map.graph, map.hamiltonianCycle, options);
    const second = classifyPatchMutationCandidatesForSnake(state, map.graph, map.hamiltonianCycle, options);

    assert.equal(first.mutationDiagnostics.profile.generationMs >= 0, true);
    assert.deepEqual(withoutProfile(second), withoutProfile(first));
  });
});

describe('Rectangle patch mutation scoring diagnostics', () => {
  it('usable improving candidate ranks above usable non-improving candidate', () => {
    const improving = makePatchMutationFeatures({ candidateId: 'improving', pathLenImprovement: 2 });
    const nonImproving = makePatchMutationFeatures({ candidateId: 'flat', pathLenImprovement: 0 });

    assert.deepEqual(
      [nonImproving, improving].sort(comparePatchMutationFeaturesForRanking).map((features) => features.candidateId),
      ['improving', 'flat']
    );
  });

  it('immediate-locked beats transition when improvement is equal', () => {
    const immediate = makePatchMutationFeatures({
      candidateId: 'immediate',
      usabilityMode: 'immediate-locked',
      pathLenImprovement: 2,
      transitionPathLength: null
    });
    const transition = makePatchMutationFeatures({
      candidateId: 'transition',
      usabilityMode: 'transition-valid',
      pathLenImprovement: 2,
      transitionPathLength: 3
    });

    assert.deepEqual(
      [transition, immediate].sort(comparePatchMutationFeaturesForRanking).map((features) => features.candidateId),
      ['immediate', 'transition']
    );
  });

  it('transition with shorter path ranks above longer transition', () => {
    const short = makePatchMutationFeatures({
      candidateId: 'short',
      usabilityMode: 'transition-valid',
      transitionPathLength: 3,
      pathLenImprovement: 2
    });
    const long = makePatchMutationFeatures({
      candidateId: 'long',
      usabilityMode: 'transition-valid',
      transitionPathLength: 5,
      pathLenImprovement: 2
    });

    assert.deepEqual(
      [long, short].sort(comparePatchMutationFeaturesForRanking).map((features) => features.candidateId),
      ['short', 'long']
    );
  });

  it('smaller mutation wins tie', () => {
    const small = makePatchMutationFeatures({
      candidateId: 'small',
      pathLenImprovement: 2,
      mutationSize: { changedCycleEdges: 4, rectangleArea: 4 }
    });
    const large = makePatchMutationFeatures({
      candidateId: 'large',
      pathLenImprovement: 2,
      mutationSize: { changedCycleEdges: 8, rectangleArea: 4 }
    });

    assert.deepEqual(
      [large, small].sort(comparePatchMutationFeaturesForRanking).map((features) => features.candidateId),
      ['small', 'large']
    );
  });

  it('invalid or unusable candidates are never ranked as selectable', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const result = rankPatchMutationCandidates(state, map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      validateCycle: () => false
    });

    assert.equal(result.rankedCandidates.length, 0);
    assert.equal(result.aggregate.usableCandidates, 0);
    assert.equal(result.aggregate.bestCandidate, null);
  });

  it('scoring is deterministic', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const options = { maxWidth: 4, maxHeight: 4, maxArea: 16 };

    assert.deepEqual(
      withoutProfile(rankPatchMutationCandidates(state, map.graph, map.hamiltonianCycle, options)),
      withoutProfile(rankPatchMutationCandidates(state, map.graph, map.hamiltonianCycle, options))
    );
  });

  it('ranking diagnostics do not mutate gameplay state', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const before = clone(state);

    rankPatchMutationCandidates(state, map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.deepEqual(state, before);
  });
});
