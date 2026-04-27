import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import { createDefaultMaps } from '../src/data/default-maps';
import { appleForward, bodyContiguous } from '../src/core/hamiltonian-certificate';
import { advanceGame } from '../src/core/game-engine';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import {
  TwoOptDiagnosticAnalyzer,
  constructTwoOptCandidate,
  type TwoOptDiagnostics,
  type TwoOptDirectedEdge
} from '../src/core/two-opt-diagnostics';
import type { HamiltonianCycle } from '../src/core/types';
import { makeGameState } from './helpers';

const ALTERNATE_RECT_4X4_CYCLE: HamiltonianCycle = [
  'n-0-0',
  'n-1-0',
  'n-2-0',
  'n-3-0',
  'n-3-1',
  'n-3-2',
  'n-3-3',
  'n-2-3',
  'n-2-2',
  'n-2-1',
  'n-1-1',
  'n-1-2',
  'n-1-3',
  'n-0-3',
  'n-0-2',
  'n-0-1'
];

class InjectedTwoOptAnalyzer extends TwoOptDiagnosticAnalyzer {
  constructor(
    private readonly injectedAttempts: Array<{
      candidate: HamiltonianCycle | null;
      replacementEdgesMissing: boolean;
      edgePairIndices: { firstIndex: number; secondIndex: number };
      reconnectMode: 'ac-bd' | 'ad-bc';
      intendedReplacementEdges: TwoOptDirectedEdge[];
      allIntendedReplacementEdgesExist: boolean;
      layout: {
        replacementSeamIndices: number[];
        internalReversalEdgeIndices: number[];
        wraparoundEdgeIndex: number;
      } | null;
    }>,
    options: ConstructorParameters<typeof TwoOptDiagnosticAnalyzer>[0] = {}
  ) {
    super(options);
  }

  protected override generateCandidateAttempts() {
    return this.injectedAttempts.map((attempt) => ({
      candidate: attempt.candidate ? [...attempt.candidate] : null,
      replacementEdgesMissing: attempt.replacementEdgesMissing,
      edgePairIndices: { ...attempt.edgePairIndices },
      reconnectMode: attempt.reconnectMode,
      intendedReplacementEdges: attempt.intendedReplacementEdges.map((edge) => ({ ...edge })),
      allIntendedReplacementEdgesExist: attempt.allIntendedReplacementEdgesExist,
      layout: attempt.layout
        ? {
            replacementSeamIndices: [...attempt.layout.replacementSeamIndices],
            internalReversalEdgeIndices: [...attempt.layout.internalReversalEdgeIndices],
            wraparoundEdgeIndex: attempt.layout.wraparoundEdgeIndex
          }
        : null
    }));
  }
}

function makeInjectedAttempt(
  candidate: HamiltonianCycle | null,
  overrides: Partial<{
    replacementEdgesMissing: boolean;
    edgePairIndices: { firstIndex: number; secondIndex: number };
    reconnectMode: 'ac-bd' | 'ad-bc';
    intendedReplacementEdges: TwoOptDirectedEdge[];
    allIntendedReplacementEdgesExist: boolean;
    layout: {
      replacementSeamIndices: number[];
      internalReversalEdgeIndices: number[];
      wraparoundEdgeIndex: number;
    } | null;
  }> = {}
) {
  const cycleLength = candidate?.length ?? 16;
  return {
    candidate,
    replacementEdgesMissing: overrides.replacementEdgesMissing ?? false,
    edgePairIndices: overrides.edgePairIndices ?? { firstIndex: 0, secondIndex: 5 },
    reconnectMode: overrides.reconnectMode ?? 'ac-bd',
    intendedReplacementEdges: overrides.intendedReplacementEdges ?? [
      { from: 'n-0-0', to: 'n-1-0' },
      { from: 'n-2-0', to: 'n-3-0' }
    ],
    allIntendedReplacementEdgesExist: overrides.allIntendedReplacementEdgesExist ?? true,
    layout: overrides.layout ?? {
      replacementSeamIndices: [0, 5],
      internalReversalEdgeIndices: [1, 2, 3, 4],
      wraparoundEdgeIndex: cycleLength - 1
    }
  };
}

function cycleHasDirectedEdge(cycle: HamiltonianCycle, from: string, to: string): boolean {
  return cycle.some((nodeId, index) => nodeId === from && cycle[(index + 1) % cycle.length] === to);
}

describe('Two-opt diagnostics', () => {
  it('constructs an ac-bd candidate with the intended replacement seams', () => {
    const construction = constructTwoOptCandidate(['a', 'b', 'c', 'd', 'e', 'f'], { firstIndex: 0, secondIndex: 3 }, 'ac-bd');

    assert.ok(construction);
    assert.equal(construction.candidate.length, 6);
    assert.equal(new Set(construction.candidate).size, 6);
    assert.deepEqual(new Set(construction.candidate), new Set(['a', 'b', 'c', 'd', 'e', 'f']));
    assert.equal(cycleHasDirectedEdge(construction.candidate, 'a', 'd'), true);
    assert.equal(cycleHasDirectedEdge(construction.candidate, 'b', 'e'), true);
    assert.equal(cycleHasDirectedEdge(construction.candidate, 'a', 'b'), false);
    assert.equal(cycleHasDirectedEdge(construction.candidate, 'd', 'e'), false);
  });

  it('does not assemble an ad-bc subtour split as a raw candidate', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });

    const construction = constructTwoOptCandidate(map.hamiltonianCycle, { firstIndex: 1, secondIndex: 5 }, 'ad-bc');

    assert.equal(construction, null);
  });

  it('diagnostics run without changing the locked cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const originalLockedCycle = [...state.lockedHamiltonianCycle!];
    const analyzer = new TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 64, searchNeighborhood: null });

    analyzer.analyze(state, map.hamiltonianCycle);

    assert.deepEqual(state.lockedHamiltonianCycle, originalLockedCycle);
  });

  it('missing replacement edges are counted', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 64, searchNeighborhood: null });

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.ok(result.diagnostics.replacementEdgesMissing > 0);
  });

  it('duplicate candidates are counted', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([
      makeInjectedAttempt(ALTERNATE_RECT_4X4_CYCLE),
      makeInjectedAttempt(ALTERNATE_RECT_4X4_CYCLE)
    ]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.diagnostics.duplicateCandidatesSkipped, 1);
    assert.equal(result.diagnostics.validCandidates, 1);
  });

  it('graph-invalid candidates are counted', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt([...map.hamiltonianCycle.slice(0, -1)])]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.diagnostics.graphInvalidCandidates, 1);
  });

  it('valid candidates are counted on a controlled setup', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(ALTERNATE_RECT_4X4_CYCLE)]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(validateHamiltonianCycle(map.graph, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.equal(bodyContiguous(state.snake.segments, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.equal(appleForward(state.snake.segments, state.appleNodeId, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.equal(result.diagnostics.validCandidates, 1);
    assert.equal(result.diagnostics.improvingCandidates, 1);
    assert.deepEqual(result.bestCandidate, ALTERNATE_RECT_4X4_CYCLE);
  });

  it('budget exhaustion is reported', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 6, height: 6 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[17]!
    });
    const analyzer = new TwoOptDiagnosticAnalyzer({ maxPairsChecked: 0, searchNeighborhood: null });

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.diagnostics.budgetExhausted, true);
  });

  it('candidate with duplicate nodes is categorized as duplicate failure', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const duplicateCandidate = [...map.hamiltonianCycle];
    duplicateCandidate[duplicateCandidate.length - 1] = duplicateCandidate[0]!;
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(duplicateCandidate)]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.invalidCandidateDetails[0]?.failureCategory, 'duplicates');
    assert.equal(result.invalidCandidateDetails[0]?.duplicateNodeCount, 1);
  });

  it('candidate with missing nodes is categorized as missing failure', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const missingNodeCandidate = [...map.hamiltonianCycle];
    missingNodeCandidate[missingNodeCandidate.length - 1] = 'ghost-node';
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(missingNodeCandidate)]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.invalidCandidateDetails[0]?.failureCategory, 'missing-nodes');
    assert.equal(result.invalidCandidateDetails[0]?.missingNodeCount, 1);
  });

  it('candidate with bad replacement seam is categorized correctly', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const candidate = [
      map.hamiltonianCycle[0]!,
      map.hamiltonianCycle[5]!,
      map.hamiltonianCycle[4]!,
      map.hamiltonianCycle[3]!,
      map.hamiltonianCycle[2]!,
      map.hamiltonianCycle[1]!,
      ...map.hamiltonianCycle.slice(6)
    ];
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([
      makeInjectedAttempt(candidate, {
        intendedReplacementEdges: [
          { from: map.hamiltonianCycle[0]!, to: map.hamiltonianCycle[5]! },
          { from: map.hamiltonianCycle[1]!, to: map.hamiltonianCycle[6]! }
        ],
        layout: {
          replacementSeamIndices: [0, 5],
          internalReversalEdgeIndices: [1, 2, 3, 4],
          wraparoundEdgeIndex: candidate.length - 1
        }
      })
    ]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.invalidCandidateDetails[0]?.failureCategory, 'bad-replacement-seam');
    assert.equal(result.invalidCandidateDetails[0]?.firstInvalidEdgeLocation, 'replacement-seam');
  });

  it('candidate with bad internal reversal is categorized correctly', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const candidate = [
      map.hamiltonianCycle[0]!,
      map.hamiltonianCycle[1]!,
      map.hamiltonianCycle[10]!,
      map.hamiltonianCycle[2]!,
      map.hamiltonianCycle[3]!,
      map.hamiltonianCycle[4]!,
      map.hamiltonianCycle[5]!,
      map.hamiltonianCycle[6]!,
      map.hamiltonianCycle[7]!,
      map.hamiltonianCycle[8]!,
      map.hamiltonianCycle[9]!,
      map.hamiltonianCycle[11]!,
      map.hamiltonianCycle[12]!,
      map.hamiltonianCycle[13]!,
      map.hamiltonianCycle[14]!,
      map.hamiltonianCycle[15]!
    ];
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(candidate)]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.invalidCandidateDetails[0]?.failureCategory, 'bad-internal-reversal');
    assert.equal(result.invalidCandidateDetails[0]?.firstInvalidEdgeLocation, 'internal-reversal');
  });

  it('candidate with bad wraparound seam is categorized correctly', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const wraparoundBadCandidate: HamiltonianCycle = [
      'n-0-0',
      'n-1-0',
      'n-2-0',
      'n-3-0',
      'n-3-1',
      'n-2-1',
      'n-1-1',
      'n-0-1',
      'n-0-2',
      'n-1-2',
      'n-2-2',
      'n-3-2',
      'n-3-3',
      'n-2-3',
      'n-1-3',
      'n-0-3'
    ];
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new InjectedTwoOptAnalyzer([
      makeInjectedAttempt(wraparoundBadCandidate, {
        layout: {
          replacementSeamIndices: [0, 5],
          internalReversalEdgeIndices: [1, 2, 3, 4],
          wraparoundEdgeIndex: wraparoundBadCandidate.length - 1
        }
      })
    ]);

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.invalidCandidateDetails[0]?.failureCategory, 'bad-wraparound');
    assert.equal(result.invalidCandidateDetails[0]?.firstInvalidEdgeLocation, 'wraparound');
  });

  it('certified-hamiltonian behavior remains unchanged', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 64, searchNeighborhood: null });

    analyzer.analyze(state, map.hamiltonianCycle);
    const decision = decideAiMove(state, 'certified-hamiltonian');
    const nextState = advanceGame(state, decision!.direction, 0, { next: () => 0 });

    assert.equal(nextState.snake.segments[0], map.hamiltonianCycle[1]);
  });

  it('4x4 exhaustive diagnostics are deterministic', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!
    });
    const analyzer = new TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 256, searchNeighborhood: null });

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.diagnostics.edgePairsConsidered, 104);
    assert.equal(result.diagnostics.replacementPairsConsidered, 208);
    assert.equal(result.diagnostics.rawCandidatesGenerated, 0);
    assert.equal(result.diagnostics.graphInvalidCandidates, 0);
    assert.equal(result.diagnostics.invalidDueToBadReplacementSeam, 0);
    assert.equal(result.invalidCandidateDetails.length, 0);
  });

  it('supports default maps in diagnostics-only mode', () => {
    const map = createDefaultMaps()[0]!;
    const midpoint = Math.floor(map.hamiltonianCycle.length / 2);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[midpoint]!
    });
    const analyzer = new TwoOptDiagnosticAnalyzer({ maxPairsChecked: 8, searchNeighborhood: 3 });

    const result = analyzer.analyze(state, map.hamiltonianCycle);

    assert.equal(result.diagnostics.edgePairsConsidered, 8);
  });
});
