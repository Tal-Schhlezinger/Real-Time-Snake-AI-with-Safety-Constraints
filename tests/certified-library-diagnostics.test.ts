import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import {
  applyCertifiedPostAppleTransition,
  createCertifiedRuntimeSwitchingDiagnostics,
  getCertifiedLockedCycle
} from '../src/core/certified-cycle-controller';
import { generateDiverseHamiltonianCycles } from '../src/core/cycle-library';
import { advanceGame } from '../src/core/game-engine';
import { createInitialGameState } from '../src/core/game-state';
import { validLockedCertificate } from '../src/core/hamiltonian-certificate';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { makeGameState } from './helpers';

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('Certified library diagnostics', () => {
  it('diagnostics do not affect gameplay behavior', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 8 });
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const withoutDiagnostics = cloneState(initial);
    const withDiagnostics = cloneState(initial);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    let plainState = withoutDiagnostics;
    let instrumentedState = withDiagnostics;
    for (let step = 0; step < 10 && !plainState.isOver && !instrumentedState.isOver; step += 1) {
      const plainDecision = decideAiMove(plainState, 'certified-hamiltonian');
      const instrumentedDecision = decideAiMove(instrumentedState, 'certified-hamiltonian');

      plainState = applyCertifiedPostAppleTransition({
        previousState: plainState,
        nextState: advanceGame(plainState, plainDecision!.direction, 0, { next: () => 0 }),
        cycleLibrary: library
      });
      instrumentedState = applyCertifiedPostAppleTransition({
        previousState: instrumentedState,
        nextState: advanceGame(instrumentedState, instrumentedDecision!.direction, 0, { next: () => 0 }),
        cycleLibrary: library,
        diagnostics
      });
    }

    assert.deepEqual(instrumentedState, plainState);
    assert.equal(diagnostics.applesEaten >= 0, true);
  });

  it('generated cycles all pass validateHamiltonianCycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 6, height: 6 });
    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 12 });

    assert.equal(library.entries.every((entry) => validateHamiltonianCycle(map.graph, entry.cycle)), true);
  });

  it('diversity stats are deterministic for fixed options', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 6, height: 6 });
    const left = generateDiverseHamiltonianCycles(map, { maxAttempts: 12, maxCycles: 4, minDiversity: 0.2 });
    const right = generateDiverseHamiltonianCycles(map, { maxAttempts: 12, maxCycles: 4, minDiversity: 0.2 });

    assert.deepEqual(left.diagnostics, right.diagnostics);
  });

  it('unsupported maps report unsupported safely', () => {
    const map = {
      ...createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 }),
      walls: [{ x: 1, y: 1 }]
    };
    const library = generateDiverseHamiltonianCycles(map);

    assert.equal(library.status, 'unsupported');
    assert.equal(library.diagnostics.generationAttempts, 0);
    assert.equal(library.diagnostics.generatedCycles, 0);
  });

  it('switching diagnostics count successful and failed switch attempts', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 8 });
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const successPreviousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-0-0'],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-1-0'
    });
    const successNextState = {
      ...advanceGame(successPreviousState, decideAiMove(successPreviousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-3-2'
    };

    applyCertifiedPostAppleTransition({
      previousState: successPreviousState,
      nextState: successNextState,
      cycleLibrary: library,
      diagnostics
    });

    const failPreviousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-3-1'],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: 'n-2-1'
    });
    const failNextState = advanceGame(failPreviousState, decideAiMove(failPreviousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });

    applyCertifiedPostAppleTransition({
      previousState: failPreviousState,
      nextState: failNextState,
      cycleLibrary: library,
      diagnostics
    });

    assert.equal(diagnostics.applesEaten, 2);
    assert.equal(diagnostics.switchAttempts, 2);
    assert.equal(diagnostics.successfulSwitches, 1);
    assert.equal(diagnostics.oldCycleKept, 1);
    assert.equal(diagnostics.noValidSwitchExists, 1);
    assert.equal(diagnostics.candidateCyclesChecked > 0, true);
    assert.equal(diagnostics.candidatesPassingProofGate > 0, true);
    assert.equal(diagnostics.oldPathLenBeforeSwitch.length, 1);
    assert.equal(diagnostics.newPathLenAfterSwitch.length, 1);
    assert.equal(diagnostics.averagePathLenImprovement !== null, true);
    assert.equal(diagnostics.switchAttemptSummaries.length, 2);
    assert.equal(diagnostics.switchAttemptSummaries[0]?.finalDecisionReason, 'selected-switch');
    assert.equal(diagnostics.switchAttemptSummaries[1]?.finalDecisionReason, 'no-proof-valid-candidates');
  });

  it('single-cycle fallback remains valid', () => {
    const map = {
      ...createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 }),
      walls: [{ x: 1, y: 1 }]
    };
    const library = generateDiverseHamiltonianCycles(map);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-0-0'],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-1-0'
    });
    const nextState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-3-2'
    };

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: library,
      diagnostics
    });

    assert.deepEqual(getCertifiedLockedCycle(transitioned), map.hamiltonianCycle);
    assert.equal(validLockedCertificate(transitioned.snake.segments, map.hamiltonianCycle), true);
    assert.equal(diagnostics.switchAttempts, 0);
    assert.equal(diagnostics.oldCycleKept, 1);
  });

  it('diagnostics distinguish no proof-valid candidate vs proof-valid but not improving', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const noProofValidLibrary = {
      mapId: map.id,
      status: 'ready' as const,
      entries: [{
        id: 'rect:base',
        cycle: [...map.hamiltonianCycle],
        source: 'base' as const,
        archetypeName: 'base',
        minDistanceToAccepted: 0,
        minOrderDistanceToAccepted: 0
      }],
      diagnostics: {
        generationAttempts: 0,
        generatedCycles: 0,
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
    };
    const noProofValidDiagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const noProofValidPreviousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-1-1', 'n-0-0'],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-1-0'
    });
    const noProofValidNextState = makeGameState({
      ...noProofValidPreviousState,
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-3-2',
      applesEaten: 1
    });

    applyCertifiedPostAppleTransition({
      previousState: noProofValidPreviousState,
      nextState: noProofValidNextState,
      cycleLibrary: noProofValidLibrary,
      diagnostics: noProofValidDiagnostics
    });

    assert.equal(noProofValidDiagnostics.switchAttemptSummaries[0]?.finalDecisionReason, 'no-proof-valid-candidates');

    const proofValidButNotImprovingLibrary = generateDiverseHamiltonianCycles(map, { maxAttempts: 8 });
    const proofValidButNotImprovingDiagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const proofValidButNotImprovingPreviousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-3-1'],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: 'n-1-0'
    });
    const proofValidButNotImprovingNextState = makeGameState({
      ...proofValidButNotImprovingPreviousState,
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-2-2',
      applesEaten: 1
    });

    applyCertifiedPostAppleTransition({
      previousState: proofValidButNotImprovingPreviousState,
      nextState: proofValidButNotImprovingNextState,
      cycleLibrary: proofValidButNotImprovingLibrary,
      diagnostics: proofValidButNotImprovingDiagnostics
    });

    assert.equal(proofValidButNotImprovingDiagnostics.switchAttemptSummaries[0]?.finalDecisionReason, 'selected-switch');
  });

  it('diagnostics record best proof-valid candidate pathLen and final decision reason', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 8 });
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-0-0'],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-1-0'
    });
    const nextState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-3-2'
    };

    applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: library,
      diagnostics
    });

    const summary = diagnostics.switchAttemptSummaries[0];
    assert.ok(summary);
    assert.equal(summary.finalDecisionReason, 'selected-switch');
    assert.equal(summary.bestProofValidCandidateByPathLen !== null, true);
    assert.equal(summary.bestProofValidCandidateByPathLen!.pathLen, 4);
    assert.equal(summary.bestProofValidCandidateByPathLen!.pathLenDelta, 4);
  });
});
