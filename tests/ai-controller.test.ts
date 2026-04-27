import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { advanceGame, listPotentialMoves } from '../src/core/game-engine';
import { decideAiMove } from '../src/core/ai-controller';
import { bodyContiguous, validLockedCertificate } from '../src/core/hamiltonian-certificate';
import { nodeIdForCoord } from '../src/core/coords';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { makeDraft, makeGameState, makeSavedMap } from './helpers';

function nextOnCycle(map: ReturnType<typeof createRectangularSavedMap>, head: string): string {
  const index = map.hamiltonianCycle.indexOf(head);
  if (index === -1) {
    throw new Error(`Head ${head} is not in the Hamiltonian cycle.`);
  }
  return map.hamiltonianCycle[(index + 1) % map.hamiltonianCycle.length]!;
}

describe('AI controller', () => {
  it('avoids an immediately fatal move when a safe move exists', () => {
    const map = makeSavedMap(
      makeDraft({
        width: 4,
        height: 4,
        walls: [{ x: 2, y: 1 }],
        snakeSpawn: { x: 1, y: 1 }
      })
    );

    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'greedy',
      snake: {
        segments: [
          nodeIdForCoord({ x: 1, y: 1 }),
          nodeIdForCoord({ x: 1, y: 2 }),
          nodeIdForCoord({ x: 0, y: 2 })
        ],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: nodeIdForCoord({ x: 3, y: 1 })
    });

    const decision = decideAiMove(state, 'greedy');

    assert.notEqual(decision, null);
    assert.notEqual(decision?.direction, 'right');
    assert.equal(['up', 'left'].includes(decision?.direction ?? ''), true);
  });

  it('certified-hamiltonian always chooses the direction whose destination is next_on_cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const head = map.hamiltonianCycle[0]!;
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [head],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[10]!
    });

    const successor = nextOnCycle(map, head);
    const decision = decideAiMove(state, 'certified-hamiltonian');
    const nextState = advanceGame(state, decision!.direction, 0, { next: () => 0 });

    assert.notEqual(decision, null);
    assert.equal(decision?.strategyUsed, 'certified-hamiltonian');
    assert.equal(nextState.snake.segments[0], successor);
  });

  it('certified-hamiltonian keeps choosing next_on_cycle for several consecutive states', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    let state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[12]!
    });

    for (let step = 0; step < 6; step += 1) {
      const head = state.snake.segments[0]!;
      const successor = nextOnCycle(map, head);
      const decision = decideAiMove(state, 'certified-hamiltonian');
      state = advanceGame(state, decision!.direction, 0, { next: () => 0 });
      assert.equal(state.snake.segments[0], successor);
    }
  });

  it('certified-hamiltonian ignores tempting safe non-cycle moves and still chooses next_on_cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const head = map.hamiltonianCycle[0]!;
    const temptingApple = nodeIdForCoord({ x: 0, y: 1 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [head],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: temptingApple
    });

    const successor = nextOnCycle(map, head);
    const alternativeMoves = listPotentialMoves(state).filter((move) => move.to !== successor);
    const decision = decideAiMove(state, 'certified-hamiltonian');
    const nextState = advanceGame(state, decision!.direction, 0, { next: () => 0 });

    assert.equal(alternativeMoves.length > 0, true);
    assert.equal(alternativeMoves.some((move) => move.to === temptingApple), true);
    assert.equal(nextState.snake.segments[0], successor);
    assert.notEqual(nextState.snake.segments[0], temptingApple);
  });

  it('certified-hamiltonian uses validLockedCertificate before moving', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const bodySegments = [map.hamiltonianCycle[4]!, map.hamiltonianCycle[3]!, map.hamiltonianCycle[2]!];
    const head = bodySegments[0]!;
    const successor = nextOnCycle(map, head);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: bodySegments,
        direction: 'down',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[12]!
    });

    assert.equal(validLockedCertificate(bodySegments, map.hamiltonianCycle), true);

    const decision = decideAiMove(state, 'certified-hamiltonian');
    const nextState = advanceGame(state, decision!.direction, 0, { next: () => 0 });

    assert.equal(nextState.snake.segments[0], successor);
  });

  it('certified-hamiltonian throws when bodyContiguous is true but validLockedCertificate is false', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const wrongOrientationBody = [map.hamiltonianCycle[4]!, map.hamiltonianCycle[2]!, map.hamiltonianCycle[3]!];
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: wrongOrientationBody,
        direction: 'down',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[12]!
    });

    assert.equal(bodyContiguous(wrongOrientationBody, map.hamiltonianCycle), true);
    assert.equal(validLockedCertificate(wrongOrientationBody, map.hamiltonianCycle), false);

    assert.throws(
      () => decideAiMove(state, 'certified-hamiltonian'),
      /Certified Hamiltonian AI invariant failed: snake body does not satisfy the locked Hamiltonian certificate\./
    );
  });

  it('certified-hamiltonian fails loudly if the cycle is missing the head node', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const head = map.hamiltonianCycle[0]!;
    const corruptedMap = {
      ...map,
      hamiltonianCycle: map.hamiltonianCycle.filter((nodeId) => nodeId !== head)
    };
    const state = makeGameState({
      map: corruptedMap,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [head],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[8]!
    });

    assert.throws(
      () => decideAiMove(state, 'certified-hamiltonian'),
      /Certified Hamiltonian AI invariant failed: locked cycle is not graph-valid\./
    );
  });

  it('certified-hamiltonian fails loudly if the cycle successor is not a legal outgoing edge', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const head = map.hamiltonianCycle[0]!;
    const invalidSuccessor = map.hamiltonianCycle[5]!;
    const corruptedMap = {
      ...map,
      hamiltonianCycle: [
        head,
        invalidSuccessor,
        ...map.hamiltonianCycle.filter((nodeId) => nodeId !== head && nodeId !== invalidSuccessor)
      ]
    };
    const state = makeGameState({
      map: corruptedMap,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [head],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[8]!
    });

    assert.throws(
      () => decideAiMove(state, 'certified-hamiltonian'),
      /Certified Hamiltonian AI invariant failed: locked cycle is not graph-valid\./
    );
  });

  it('casual hamiltonian mode keeps its fallback behavior when the cycle invariant fails', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const head = map.hamiltonianCycle[0]!;
    const invalidSuccessor = map.hamiltonianCycle[5]!;
    const corruptedMap = {
      ...map,
      hamiltonianCycle: [
        head,
        invalidSuccessor,
        ...map.hamiltonianCycle.filter((nodeId) => nodeId !== head && nodeId !== invalidSuccessor)
      ]
    };
    const state = makeGameState({
      map: corruptedMap,
      mode: 'ai',
      aiStrategy: 'hamiltonian',
      snake: {
        segments: [head],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[8]!
    });

    const decision = decideAiMove(state, 'hamiltonian');

    assert.notEqual(decision, null);
    assert.equal(decision?.strategyUsed, 'greedy');
  });

  it('after one certified locked-cycle move, validLockedCertificate remains true', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: [map.hamiltonianCycle[6]!, map.hamiltonianCycle[5]!, map.hamiltonianCycle[4]!],
        direction: 'down',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[12]!
    });

    const decision = decideAiMove(state, 'certified-hamiltonian');
    const nextState = advanceGame(state, decision!.direction, 0, { next: () => 0 });

    assert.equal(validLockedCertificate(nextState.snake.segments, map.hamiltonianCycle), true);
  });
});
