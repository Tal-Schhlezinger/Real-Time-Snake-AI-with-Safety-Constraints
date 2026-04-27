import assert from 'node:assert/strict';
import { createDefaultMaps } from '../src/data/default-maps';
import {
  analyzeFourExitDecomposition,
  analyzeMultiTerminalRectanglePatch,
  analyzeMultiTerminalRectanglePatches,
  analyzeSamePairing4ExitPathCovers,
  classifyV2FourExitSpliceCandidateForSnake,
  classifyV2FourExitSpliceCandidatesForSnake,
  compareV2FourExitMutationFeaturesForRanking,
  generateV2FourExitSpliceCandidates,
  generateSamePairing4ExitPathCovers,
  pathCoverSignature,
  reconstructCycleFromDegreeTwoEdges,
  sameAsOriginalCover,
  spliceMultiTerminalSamePairingCoverByEdges,
  validateSamePairingPathCover,
  type V2FourExitMutationFeatures,
  type UndirectedCycleEdge,
  type SamePairingPathCover
} from '../src/core/multi-terminal-patch-diagnostics';
import { decideAiMove } from '../src/core/ai-controller';
import { advanceGame } from '../src/core/game-engine';
import { createInitialGameState } from '../src/core/game-state';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import type { RectanglePatchRect } from '../src/core/two-terminal-patch-mutation';
import type { GameState, GraphSnapshot, NodeId } from '../src/core/types';
import { describe, it } from './testkit';

const fourExitRect: RectanglePatchRect = { x: 0, y: 0, width: 3, height: 2 };
const alternativeCoverRect: RectanglePatchRect = { x: 0, y: 0, width: 3, height: 3 };

function getAlternativeCoverFixture(): {
  map: ReturnType<typeof createRectangularSavedMap>;
  patch: ReturnType<typeof analyzeMultiTerminalRectanglePatch>;
  cover: SamePairingPathCover;
} {
  const map = createRectangularSavedMap({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
  const patch = analyzeMultiTerminalRectanglePatch(map.graph, map.hamiltonianCycle, alternativeCoverRect);
  const diagnostics = generateSamePairing4ExitPathCovers(patch, map.graph, {
    maxPatchArea4Exit: 9,
    maxCoversPerPatch: 8,
    maxSolverExpansionsPerPatch: 20_000
  });
  const cover = diagnostics.covers[0];

  assert.ok(cover);
  return { map, patch, cover };
}

function edgeKey(from: NodeId, to: NodeId): string {
  return [from, to].sort().join('--');
}

function cycleEdgeSet(cycle: readonly NodeId[]): Set<string> {
  const edges = new Set<string>();

  for (let index = 0; index < cycle.length; index += 1) {
    edges.add(edgeKey(cycle[index]!, cycle[(index + 1) % cycle.length]!));
  }

  return edges;
}

function pathCoverEdgeSet(cover: SamePairingPathCover): Set<string> {
  const edges = new Set<string>();

  for (const path of cover.paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      edges.add(edgeKey(path[index]!, path[index + 1]!));
    }
  }

  return edges;
}

function withoutProfile<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => key === 'profile' ? undefined : nestedValue)) as T;
}

function stepUntilNextApple(state: GameState): GameState {
  let current = state;
  const targetApples = current.applesEaten + 1;

  for (let step = 0; step < current.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
    const decision = decideAiMove(current, 'certified-hamiltonian');
    assert.ok(decision);
    current = advanceGame(current, decision.direction, 0, { next: () => 0 });
    if (current.applesEaten >= targetApples) {
      return current;
    }
  }

  return current;
}

function makeV2MutationFeatures(overrides: Partial<V2FourExitMutationFeatures> = {}): V2FourExitMutationFeatures {
  return {
    candidateId: overrides.candidateId ?? 'candidate-a',
    patchId: overrides.patchId ?? 'rect-0-0-3x3',
    usabilityMode: overrides.usabilityMode ?? 'immediate-locked',
    currentLockedCyclePathLen: overrides.currentLockedCyclePathLen ?? 8,
    candidatePathLenToApple: overrides.candidatePathLenToApple ?? 4,
    transitionPathLength: overrides.transitionPathLength ?? null,
    pathLenImprovement: overrides.pathLenImprovement ?? 4,
    changedCycleEdges: overrides.changedCycleEdges ?? 6,
    rectangleArea: overrides.rectangleArea ?? 9,
    cycleScore: overrides.cycleScore ?? 10,
    cycleFeatures: overrides.cycleFeatures ?? null,
    finalV2MutationScore: overrides.finalV2MutationScore ?? 0
  };
}

describe('Multi-terminal rectangle patch diagnostics', () => {
  it('detects a controlled 4-exit rectangle and extracts exactly two terminal pairs', () => {
    const map = createRectangularSavedMap({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
    const result = analyzeMultiTerminalRectanglePatch(map.graph, map.hamiltonianCycle, fourExitRect);

    assert.equal(result.fullRectangle, true);
    assert.equal(result.crossingCount, 4);
    assert.equal(result.repeatedTerminalCount, 0);
    assert.equal(result.rejectionReason, 'valid-four-exit-decomposition');
    assert.ok(result.fourExitDecomposition);
    assert.deepEqual(result.fourExitDecomposition.terminalPairs, [
      {
        terminalA: 'n-0-1',
        terminalB: 'n-2-0',
        originalPath: ['n-0-1', 'n-0-0', 'n-1-0', 'n-2-0']
      },
      {
        terminalA: 'n-1-1',
        terminalB: 'n-2-1',
        originalPath: ['n-1-1', 'n-2-1']
      }
    ]);
  });

  it('rejects repeated-terminal 4-exit patches outright', () => {
    const map = createRectangularSavedMap({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
    const result = analyzeMultiTerminalRectanglePatch(
      map.graph,
      map.hamiltonianCycle,
      { x: 0, y: 0, width: 2, height: 2 }
    );

    assert.equal(result.crossingCount, 4);
    assert.equal(result.repeatedTerminalCount, 1);
    assert.equal(result.fourExitDecomposition, null);
    assert.equal(result.rejectionReason, 'repeated-terminal');
  });

  it('uses only Hamiltonian cycle edges for internal degree, not board graph degree', () => {
    const map = createRectangularSavedMap({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
    const result = analyzeMultiTerminalRectanglePatch(map.graph, map.hamiltonianCycle, fourExitRect);
    const boardOutDegree = map.graph.edges.filter((edge) => edge.from === 'n-1-1').length;

    assert.ok(result.fourExitDecomposition);
    assert.equal(result.fourExitDecomposition.internalDegreeByNode['n-1-1'], 1);
    assert.ok(boardOutDegree > 1);
  });

  it('requires the internal components to cover every patch vertex', () => {
    const map = createRectangularSavedMap({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
    const result = analyzeMultiTerminalRectanglePatch(map.graph, map.hamiltonianCycle, fourExitRect);
    const covered = new Set(result.fourExitDecomposition?.terminalPairs.flatMap((pair) => pair.originalPath));

    assert.ok(result.fourExitDecomposition);
    assert.equal(result.fourExitDecomposition.coversAllPatchVertices, true);
    assert.equal(covered.size, result.vertexCount);
  });

  it('rejects malformed 4-exit decomposition inputs instead of producing terminal pairs', () => {
    const rectNodeSet = new Set<NodeId>(['a', 'b', 'c', 'd']);
    const terminals = ['a', 'b', 'c', 'd'];
    const crossingEdges = terminals.map((insideNode, cycleIndex) => ({
      from: `o-${insideNode}`,
      to: insideNode,
      insideNode,
      outsideNode: `o-${insideNode}`,
      cycleIndex
    }));
    const result = analyzeFourExitDecomposition(rectNodeSet, terminals, crossingEdges, [
      { from: 'a', to: 'b', cycleIndex: 0 }
    ]);

    assert.equal(result.decomposition, null);
    assert.notEqual(result.rejectionReason, 'valid-four-exit-decomposition');
  });

  it('counts 6-exit and 8-exit rectangles without decomposing them', () => {
    const map = createDefaultMaps()[0]!;
    const result = analyzeMultiTerminalRectanglePatches(map.graph, map.hamiltonianCycle, {
      maxWidth: 8,
      maxHeight: 6,
      maxArea: 30
    });
    const sixExitPatch = result.patches.find((patch) => patch.exitClass === 'six' && patch.repeatedTerminalCount === 0);
    const eightExitPatch = result.patches.find((patch) => patch.exitClass === 'eight' && patch.repeatedTerminalCount === 0);

    assert.ok(result.aggregate.sixExitRectangles > 0);
    assert.ok(result.aggregate.eightExitRectangles > 0);
    assert.ok(sixExitPatch);
    assert.ok(eightExitPatch);
    assert.equal(sixExitPatch.fourExitDecomposition, null);
    assert.equal(sixExitPatch.rejectionReason, 'six-exit-count-only');
    assert.equal(eightExitPatch.fourExitDecomposition, null);
    assert.equal(eightExitPatch.rejectionReason, 'eight-exit-count-only');
  });

  it('reports deterministic aggregate counters for fixed scan options', () => {
    const map = createRectangularSavedMap({ id: 'multi-6x6', name: 'Multi 6x6', width: 6, height: 6 });
    const options = { maxWidth: 5, maxHeight: 5, maxArea: 20 };

    assert.deepEqual(
      analyzeMultiTerminalRectanglePatches(map.graph, map.hamiltonianCycle, options),
      analyzeMultiTerminalRectanglePatches(map.graph, map.hamiltonianCycle, options)
    );
  });

  it('does not mutate graph or cycle inputs', () => {
    const map = createRectangularSavedMap({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
    const graphBefore = JSON.stringify(map.graph);
    const cycleBefore = JSON.stringify(map.hamiltonianCycle);

    analyzeMultiTerminalRectanglePatches(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    });

    assert.equal(JSON.stringify(map.graph), graphBefore);
    assert.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
  });

  it('rejects rectangles with missing cells as not full', () => {
    const map = createRectangularSavedMap({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
    const graphWithMissingCell: GraphSnapshot = {
      ...map.graph,
      nodes: map.graph.nodes.filter((node) => node.id !== 'n-1-1')
    };
    const result = analyzeMultiTerminalRectanglePatch(graphWithMissingCell, map.hamiltonianCycle, {
      x: 0,
      y: 0,
      width: 2,
      height: 2
    });

    assert.equal(result.fullRectangle, false);
    assert.equal(result.rejectionReason, 'rectangle-not-full');
  });

  it('controlled 4-exit patch has an alternative same-pairing path cover', () => {
    const { map, patch } = getAlternativeCoverFixture();
    const diagnostics = generateSamePairing4ExitPathCovers(patch, map.graph, {
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 8,
      maxSolverExpansionsPerPatch: 20_000
    });

    assert.equal(diagnostics.attempted, true);
    assert.equal(diagnostics.rejectionReason, 'valid-alternative-cover');
    assert.ok(diagnostics.coversFound > 0);
    assert.equal(validateSamePairingPathCover(patch, map.graph, diagnostics.covers[0]!), true);
    assert.equal(sameAsOriginalCover(patch, diagnostics.covers[0]!), false);
  });

  it('wrong terminal pairing is rejected by path-cover validation', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const wrongPairing: SamePairingPathCover = {
      paths: [cover.paths[1], cover.paths[0]]
    };

    assert.equal(validateSamePairingPathCover(patch, map.graph, wrongPairing), false);
  });

  it('incomplete and missing-vertex covers are rejected', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const incomplete: SamePairingPathCover = {
      paths: [[...cover.paths[0].slice(0, -1), cover.paths[0][cover.paths[0].length - 1]!], cover.paths[1]]
    };
    incomplete.paths[0].splice(1, 1);

    assert.equal(validateSamePairingPathCover(patch, map.graph, incomplete), false);
  });

  it('duplicate vertices across paths are rejected', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const duplicateAcrossPaths: SamePairingPathCover = {
      paths: [[cover.paths[0][0]!, cover.paths[1][0]!, ...cover.paths[0].slice(1)], cover.paths[1]]
    };

    assert.equal(validateSamePairingPathCover(patch, map.graph, duplicateAcrossPaths), false);
  });

  it('no-op cover matching the original decomposition is skipped', () => {
    const map = createRectangularSavedMap({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
    const patch = analyzeMultiTerminalRectanglePatch(map.graph, map.hamiltonianCycle, alternativeCoverRect);
    const originalCover: SamePairingPathCover = {
      paths: [
        patch.fourExitDecomposition!.terminalPairs[0]!.originalPath,
        patch.fourExitDecomposition!.terminalPairs[1]!.originalPath
      ]
    };
    const diagnostics = generateSamePairing4ExitPathCovers(patch, map.graph, {
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 8,
      maxSolverExpansionsPerPatch: 20_000
    });

    assert.equal(validateSamePairingPathCover(patch, map.graph, originalCover), true);
    assert.equal(sameAsOriginalCover(patch, originalCover), true);
    assert.ok(diagnostics.noOpCoversSkipped > 0);
  });

  it('duplicate covers are deduplicated by signature', () => {
    const { map, patch } = getAlternativeCoverFixture();
    const diagnostics = generateSamePairing4ExitPathCovers(patch, map.graph, {
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 32,
      maxSolverExpansionsPerPatch: 50_000
    });
    const signatures = new Set(diagnostics.covers.map(pathCoverSignature));

    assert.equal(signatures.size, diagnostics.covers.length);
  });

  it('budget exhaustion is reported with a tiny expansion budget', () => {
    const map = createRectangularSavedMap({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
    const patch = analyzeMultiTerminalRectanglePatch(map.graph, map.hamiltonianCycle, alternativeCoverRect);
    const diagnostics = generateSamePairing4ExitPathCovers(patch, map.graph, {
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 8,
      maxSolverExpansionsPerPatch: 1
    });

    assert.equal(diagnostics.attempted, true);
    assert.equal(diagnostics.budgetExhausted, true);
    assert.equal(diagnostics.rejectionReason, 'budget-exhausted');
  });

  it('6-exit and 8-exit patches remain count-only and produce no path-cover diagnostics', () => {
    const map = createDefaultMaps()[0]!;
    const result = analyzeSamePairing4ExitPathCovers(map.graph, map.hamiltonianCycle, {
      maxWidth: 8,
      maxHeight: 6,
      maxArea: 30,
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 4,
      maxSolverExpansionsPerPatch: 1_000
    });

    assert.ok(result.patchScan.aggregate.sixExitRectangles > 0);
    assert.ok(result.patchScan.aggregate.eightExitRectangles > 0);
    assert.equal(result.patches.length, result.patchScan.aggregate.validFourExitDecompositions);
    assert.equal(result.patches.every((patch) => patch.terminalPairs.length === 2), true);
  });

  it('same-pairing path-cover diagnostics do not mutate graph or cycle inputs', () => {
    const map = createRectangularSavedMap({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
    const graphBefore = JSON.stringify(map.graph);
    const cycleBefore = JSON.stringify(map.hamiltonianCycle);

    analyzeSamePairing4ExitPathCovers(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9
    });

    assert.equal(JSON.stringify(map.graph), graphBefore);
    assert.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
  });

  it('same-pairing path-cover diagnostics are deterministic', () => {
    const map = createRectangularSavedMap({ id: 'multi-cover-6x6', name: 'Multi Cover 6x6', width: 6, height: 6 });
    const options = {
      maxWidth: 5,
      maxHeight: 5,
      maxArea: 20,
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 4,
      maxSolverExpansionsPerPatch: 5_000
    };

    const first = analyzeSamePairing4ExitPathCovers(map.graph, map.hamiltonianCycle, options);
    const second = analyzeSamePairing4ExitPathCovers(map.graph, map.hamiltonianCycle, options);

    assert.equal(first.profile.detectionMs >= 0, true);
    assert.equal(first.profile.pathCoverSolvingMs >= 0, true);
    assert.deepEqual(withoutProfile(second), withoutProfile(first));
  });

  it('edge-set splice preserves outside edges', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const candidate = spliceMultiTerminalSamePairingCoverByEdges(map.graph, map.hamiltonianCycle, patch, cover);

    assert.ok(candidate);
    const originalEdges = cycleEdgeSet(map.hamiltonianCycle);
    const candidateEdges = cycleEdgeSet(candidate);
    const oldInternalEdges = new Set(
      patch.fourExitDecomposition!.internalEdges.map((edge) => edgeKey(edge.from, edge.to))
    );

    for (const edge of originalEdges) {
      if (!oldInternalEdges.has(edge)) {
        assert.equal(candidateEdges.has(edge), true);
      }
    }
  });

  it('edge-set splice removes old internal edges not present in the replacement cover', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const candidate = spliceMultiTerminalSamePairingCoverByEdges(map.graph, map.hamiltonianCycle, patch, cover);

    assert.ok(candidate);
    const candidateEdges = cycleEdgeSet(candidate);
    const replacementEdges = pathCoverEdgeSet(cover);

    for (const edge of patch.fourExitDecomposition!.internalEdges) {
      const key = edgeKey(edge.from, edge.to);
      if (!replacementEdges.has(key)) {
        assert.equal(candidateEdges.has(key), false);
      }
    }
  });

  it('edge-set splice adds replacement cover edges', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const candidate = spliceMultiTerminalSamePairingCoverByEdges(map.graph, map.hamiltonianCycle, patch, cover);

    assert.ok(candidate);
    const candidateEdges = cycleEdgeSet(candidate);

    for (const edge of pathCoverEdgeSet(cover)) {
      assert.equal(candidateEdges.has(edge), true);
    }
  });

  it('degree mismatch is rejected during cycle reconstruction', () => {
    const invalidEdges: UndirectedCycleEdge[] = [
      { a: 'a', b: 'b' },
      { a: 'b', b: 'c' }
    ];

    assert.equal(reconstructCycleFromDegreeTwoEdges(invalidEdges, 'a'), null);
  });

  it('subtour or multiple-cycle edge sets are rejected during reconstruction', () => {
    const subtourEdges: UndirectedCycleEdge[] = [
      { a: 'a', b: 'b' },
      { a: 'b', b: 'c' },
      { a: 'c', b: 'a' },
      { a: 'd', b: 'e' },
      { a: 'e', b: 'f' },
      { a: 'f', b: 'd' }
    ];

    assert.equal(reconstructCycleFromDegreeTwoEdges(subtourEdges, 'a'), null);
  });

  it('reconstructed V2 splice candidate has the same node set as the old cycle', () => {
    const { map, patch, cover } = getAlternativeCoverFixture();
    const candidate = spliceMultiTerminalSamePairingCoverByEdges(map.graph, map.hamiltonianCycle, patch, cover);

    assert.ok(candidate);
    assert.deepEqual(new Set(candidate), new Set(map.hamiltonianCycle));
  });

  it('graph-valid V2 splice candidates pass validateHamiltonianCycle', () => {
    const map = createRectangularSavedMap({ id: 'multi-splice-4x4', name: 'Multi Splice 4x4', width: 4, height: 4 });
    const result = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 8,
      maxSolverExpansionsPerPatch: 20_000
    });

    assert.ok(result.candidates.length > 0);
    assert.equal(result.aggregate.graphValidCandidates, result.candidates.length);
    assert.equal(result.candidates.every((candidate) => validateHamiltonianCycle(map.graph, candidate.cycle)), true);
  });

  it('V2 splice candidates are deduplicated by global edge signature', () => {
    const map = createRectangularSavedMap({ id: 'multi-splice-6x6', name: 'Multi Splice 6x6', width: 6, height: 6 });
    const result = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 6,
      maxHeight: 6,
      maxArea: 24,
      maxPatchArea4Exit: 24,
      maxCoversPerPatch: 64,
      maxSolverExpansionsPerPatch: 100_000
    });
    const signatures = new Set([...result.candidates.map((candidate) =>
      [...cycleEdgeSet(candidate.cycle)].sort().join('|')
    )]);

    assert.equal(signatures.size, result.candidates.length);
    assert.equal(
      result.candidateDiagnostics.filter((diagnostic) => diagnostic.rejectionReason === 'duplicate-candidate').length,
      result.aggregate.duplicateCandidatesSkipped
    );
  });

  it('V2 splice diagnostics do not mutate graph or cycle inputs', () => {
    const map = createRectangularSavedMap({ id: 'multi-splice-4x4', name: 'Multi Splice 4x4', width: 4, height: 4 });
    const graphBefore = JSON.stringify(map.graph);
    const cycleBefore = JSON.stringify(map.hamiltonianCycle);

    generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9
    });

    assert.equal(JSON.stringify(map.graph), graphBefore);
    assert.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
  });

  it('V2 splice diagnostics are deterministic', () => {
    const map = createRectangularSavedMap({ id: 'multi-splice-6x6', name: 'Multi Splice 6x6', width: 6, height: 6 });
    const options = {
      maxWidth: 5,
      maxHeight: 5,
      maxArea: 20,
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 4,
      maxSolverExpansionsPerPatch: 5_000
    };

    const first = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, options);
    const second = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, options);

    assert.equal(first.profile.totalMs >= 0, true);
    assert.equal(first.profile.splicingValidationMs >= 0, true);
    assert.deepEqual(withoutProfile(second), withoutProfile(first));
  });

  it('graph-valid V2 candidate with validLockedCertificate and appleForward is immediate-locked', () => {
    const map = createRectangularSavedMap({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const candidate = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9
    }).candidates[0];

    assert.ok(candidate);
    const classification = classifyV2FourExitSpliceCandidateForSnake(state, candidate);

    assert.equal(classification.graphValid, true);
    assert.equal(classification.immediateLocked, true);
    assert.equal(classification.usabilityMode, 'immediate-locked');
    assert.equal(classification.reason, 'immediate-locked');
  });

  it('graph-valid V2 candidate without immediate lock but with certified transition is transition-reachable', () => {
    const map = createRectangularSavedMap({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const state = stepUntilNextApple(initial);
    const candidate = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9
    }).candidates[0];

    assert.ok(candidate);
    const classification = classifyV2FourExitSpliceCandidateForSnake(state, candidate, {
      transitionOptions: { maxPaths: 64, slack: 6 }
    });

    assert.equal(classification.graphValid, true);
    assert.equal(classification.immediateLocked, false);
    assert.equal(classification.transitionReachable, true);
    assert.equal(classification.usabilityMode, 'transition-valid');
    assert.equal(classification.reason, 'transition-valid');
  });

  it('graph-valid V2 candidate with neither immediate lock nor transition is unusable', () => {
    const map = createRectangularSavedMap({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const invalidBodyState: GameState = {
      ...initial,
      appleNodeId: null,
      snake: {
        ...initial.snake,
        segments: ['n-0-0', 'n-2-2']
      }
    };
    const candidate = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9
    }).candidates[0];

    assert.ok(candidate);
    const classification = classifyV2FourExitSpliceCandidateForSnake(invalidBodyState, candidate);

    assert.equal(classification.graphValid, true);
    assert.equal(classification.usableForSnake, false);
    assert.equal(classification.usabilityMode, 'unusable');
    assert.equal(classification.reason, 'no-current-apple-for-transition');
  });

  it('appleForward failure blocks immediate-locked V2 use', () => {
    const map = createRectangularSavedMap({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const state: GameState = {
      ...initial,
      appleNodeId: initial.snake.segments[0]!
    };
    const candidate = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9
    }).candidates[0];

    assert.ok(candidate);
    const classification = classifyV2FourExitSpliceCandidateForSnake(state, candidate, {
      transitionOptions: { maxPaths: 4, slack: 0 }
    });

    assert.equal(classification.lockedCertificateValid, true);
    assert.equal(classification.appleForwardValid, false);
    assert.equal(classification.usableForSnake, false);
    assert.equal(classification.reason, 'immediate-locked-apple-forward-failed');
  });

  it('V2 scoring ranks improving candidates above non-improving candidates', () => {
    const improving = makeV2MutationFeatures({ candidateId: 'improving', pathLenImprovement: 3 });
    const nonImproving = makeV2MutationFeatures({ candidateId: 'flat', pathLenImprovement: 0 });

    assert.deepEqual(
      [nonImproving, improving].sort(compareV2FourExitMutationFeaturesForRanking).map((feature) => feature.candidateId),
      ['improving', 'flat']
    );
  });

  it('V2 scoring prefers immediate-locked over transition-valid on equal improvement', () => {
    const immediate = makeV2MutationFeatures({
      candidateId: 'immediate',
      usabilityMode: 'immediate-locked',
      transitionPathLength: null,
      pathLenImprovement: 2
    });
    const transition = makeV2MutationFeatures({
      candidateId: 'transition',
      usabilityMode: 'transition-valid',
      candidatePathLenToApple: null,
      transitionPathLength: 2,
      pathLenImprovement: 2
    });

    assert.deepEqual(
      [transition, immediate].sort(compareV2FourExitMutationFeaturesForRanking).map((feature) => feature.candidateId),
      ['immediate', 'transition']
    );
  });

  it('V2 Snake diagnostics do not mutate graph, cycle, or game state', () => {
    const map = createRectangularSavedMap({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const graphBefore = JSON.stringify(map.graph);
    const cycleBefore = JSON.stringify(map.hamiltonianCycle);
    const stateBefore = JSON.stringify(state);

    classifyV2FourExitSpliceCandidatesForSnake(state, map.graph, map.hamiltonianCycle, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 9,
      transitionOptions: { maxPaths: 8, slack: 2 }
    });

    assert.equal(JSON.stringify(map.graph), graphBefore);
    assert.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
    assert.equal(JSON.stringify(state), stateBefore);
  });

  it('V2 Snake diagnostics are deterministic', () => {
    const map = createRectangularSavedMap({ id: 'multi-snake-6x6', name: 'Multi Snake 6x6', width: 6, height: 6 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const options = {
      maxWidth: 5,
      maxHeight: 5,
      maxArea: 20,
      maxPatchArea4Exit: 9,
      maxCoversPerPatch: 4,
      maxSolverExpansionsPerPatch: 5_000,
      transitionOptions: { maxPaths: 8, slack: 2 }
    };

    const first = classifyV2FourExitSpliceCandidatesForSnake(state, map.graph, map.hamiltonianCycle, options);
    const second = classifyV2FourExitSpliceCandidatesForSnake(state, map.graph, map.hamiltonianCycle, options);

    assert.equal(first.profile.transitionSearchMs >= 0, true);
    assert.deepEqual(withoutProfile(second), withoutProfile(first));
  });
});
