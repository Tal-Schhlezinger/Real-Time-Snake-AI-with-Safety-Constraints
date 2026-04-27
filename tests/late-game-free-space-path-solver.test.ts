import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import {
  LateGameFreeSpacePathSolver,
  solveLateGameFreeSpacePath
} from '../src/core/late-game-free-space-path-solver';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import type { GameState } from '../src/core/types';
import { makeGameState } from './helpers';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeLateGameSolvableState(): GameState {
  const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
  const body = map.hamiltonianCycle.slice(0, 12).reverse();

  return makeGameState({
    map,
    mode: 'ai',
    aiStrategy: 'certified-hamiltonian',
    lockedHamiltonianCycle: [...map.hamiltonianCycle],
    lockedHamiltonianCycleId: 'rect:base',
    snake: {
      segments: body,
      direction: 'left',
      pendingGrowth: 0
    },
    appleNodeId: map.hamiltonianCycle[12]!
  });
}

describe('Late-game free-space path solver', () => {
  it('known small solvable state succeeds', () => {
    const state = makeLateGameSolvableState();
    const result = solveLateGameFreeSpacePath(state, { freeCountThreshold: 4 });

    assert.equal(result.success, true);
    assert.equal(result.freeCount, 4);
    assert.deepEqual(result.foundPath, [
      state.map.hamiltonianCycle[11]!,
      state.map.hamiltonianCycle[12]!,
      state.map.hamiltonianCycle[13]!,
      state.map.hamiltonianCycle[14]!,
      state.map.hamiltonianCycle[15]!,
      state.map.hamiltonianCycle[0]!
    ]);
    assert.equal(result.appleIndexOnFoundPath, 1);
  });

  it('disconnected free region fails', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-0-0', 'n-1-0', 'n-1-1', 'n-1-2', 'n-1-3', 'n-0-3'],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-0-1'
    });

    const result = solveLateGameFreeSpacePath(state);

    assert.equal(result.success, false);
    assert.equal(result.searchAttempted, true);
    assert.equal(result.failureReason, 'disconnected-free-space');
  });

  it('budget exhaustion is reported', () => {
    const state = makeLateGameSolvableState();
    const result = new LateGameFreeSpacePathSolver({
      freeCountThreshold: 4,
      maxExpansions: 0
    }).solve(state);

    assert.equal(result.success, false);
    assert.equal(result.searchAttempted, true);
    assert.equal(result.budgetExhausted, true);
    assert.equal(result.failureReason, 'budget-exhausted');
  });

  it('resulting cycle validates when successful', () => {
    const state = makeLateGameSolvableState();
    const result = solveLateGameFreeSpacePath(state, { freeCountThreshold: 4 });

    assert.ok(result.cycle);
    assert.equal(validateHamiltonianCycle(state.map.graph, result.cycle), true);
    assert.deepEqual(result.resultingCycleValidity, {
      graphValid: true,
      lockedCertificateValid: true,
      appleForwardValid: true
    });
  });

  it('diagnostics do not change gameplay behavior', () => {
    const state = makeLateGameSolvableState();
    const before = clone(state);
    const decisionBefore = decideAiMove(state, 'certified-hamiltonian');

    solveLateGameFreeSpacePath(state, { freeCountThreshold: 4 });

    assert.deepEqual(state, before);
    assert.deepEqual(decideAiMove(state, 'certified-hamiltonian'), decisionBefore);
  });
});
