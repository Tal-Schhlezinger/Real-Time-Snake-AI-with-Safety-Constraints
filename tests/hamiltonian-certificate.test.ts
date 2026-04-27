import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import { advanceGame } from '../src/core/game-engine';
import {
  AppleForward,
  BodyContiguous,
  appleForward,
  bodyContiguous,
  cycleIndexOf,
  distanceForwardOnCycle,
  getCertifiedHamiltonianDebugInfo,
  validLockedCertificate
} from '../src/core/hamiltonian-certificate';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { makeGameState } from './helpers';

describe('Hamiltonian certificate', () => {
  const cycle = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('returns true for a body occupying consecutive cycle indices', () => {
    assert.equal(bodyContiguous(['c', 'b', 'd'], cycle), true);
    assert.equal(BodyContiguous(['c', 'b', 'd'], cycle), true);
  });

  it('returns true for a wraparound interval', () => {
    assert.equal(bodyContiguous(['a', 'f', 'e'], cycle), true);
  });

  it('returns false when there is a gap inside the occupied interval', () => {
    assert.equal(bodyContiguous(['b', 'd', 'e'], cycle), false);
  });

  it('returns false when the body is split into separated intervals', () => {
    assert.equal(bodyContiguous(['a', 'b', 'e'], cycle), false);
  });

  it('returns false when a body cell is not in the Hamiltonian cycle', () => {
    assert.equal(bodyContiguous(['a', 'x'], cycle), false);
  });

  it('returns false when the body contains a duplicate cell', () => {
    assert.equal(bodyContiguous(['a', 'a'], cycle), false);
  });

  it('returns true for a single-cell body', () => {
    assert.equal(bodyContiguous(['d'], cycle), true);
  });

  it('treats a full-board body as contiguous for the current full-board game rule', () => {
    assert.equal(bodyContiguous(['d', 'a', 'c', 'b', 'f', 'e'], cycle), true);
  });

  it('validLockedCertificate passes for a correct oriented interval tail -> ... -> head', () => {
    assert.equal(validLockedCertificate(['d', 'c', 'b'], cycle), true);
  });

  it('bodyContiguous true but head in the middle fails validLockedCertificate', () => {
    assert.equal(bodyContiguous(['c', 'd', 'b'], cycle), true);
    assert.equal(validLockedCertificate(['c', 'd', 'b'], cycle), false);
  });

  it('bodyContiguous true but reversed head/tail orientation fails validLockedCertificate', () => {
    assert.equal(bodyContiguous(['b', 'c', 'd'], cycle), true);
    assert.equal(validLockedCertificate(['b', 'c', 'd'], cycle), false);
  });

  it('bodyContiguous true with correct endpoints but scrambled physical body order fails validLockedCertificate', () => {
    assert.equal(bodyContiguous(['d', 'b', 'c', 'a'], cycle), true);
    assert.equal(distanceForwardOnCycle('a', 'd', cycle), 3);
    assert.equal(validLockedCertificate(['d', 'b', 'c', 'a'], cycle), false);
  });

  it('split body intervals fail validLockedCertificate', () => {
    assert.equal(validLockedCertificate(['e', 'd', 'b'], cycle), false);
  });

  it('duplicate body cells fail validLockedCertificate', () => {
    assert.equal(validLockedCertificate(['d', 'c', 'c'], cycle), false);
  });

  it('missing cycle cells fail validLockedCertificate', () => {
    assert.equal(validLockedCertificate(['d', 'x', 'b'], cycle), false);
  });

  it('single-cell bodies pass validLockedCertificate', () => {
    assert.equal(validLockedCertificate(['d'], cycle), true);
  });

  it('next_on_cycle(head) occupied fails validLockedCertificate outside the full-board edge case', () => {
    assert.equal(bodyContiguous(['b', 'a', 'c'], cycle), true);
    assert.equal(validLockedCertificate(['b', 'a', 'c'], cycle), false);
  });

  it('full-board oriented bodies are allowed by validLockedCertificate', () => {
    assert.equal(validLockedCertificate(['e', 'd', 'c', 'b', 'a', 'f'], cycle), true);
  });

  it('returns true when the apple is ahead of the head on the free arc', () => {
    assert.equal(appleForward(['e', 'd', 'c'], 'a', cycle), true);
    assert.equal(AppleForward(['e', 'd', 'c'], 'a', cycle), true);
  });

  it('returns false when the apple lies beyond the occupied tail boundary', () => {
    assert.equal(appleForward(['d', 'c', 'e'], 'a', cycle), false);
  });

  it('returns false when the apple is on the body', () => {
    assert.equal(appleForward(['b', 'a'], 'a', cycle), false);
    assert.equal(appleForward(['b', 'a'], 'b', cycle), false);
  });

  it('handles wraparound forward arcs', () => {
    assert.equal(appleForward(['f', 'e', 'd'], 'b', cycle), true);
  });

  it('returns false when the apple is missing', () => {
    assert.equal(appleForward(['c', 'b'], null, cycle), false);
  });

  it('distanceForwardOnCycle handles normal and wraparound cases', () => {
    assert.equal(distanceForwardOnCycle('b', 'e', cycle), 3);
    assert.equal(distanceForwardOnCycle('e', 'b', cycle), 3);
    assert.equal(distanceForwardOnCycle('f', 'b', cycle), 2);
    assert.equal(distanceForwardOnCycle('c', 'c', cycle), 0);
    assert.equal(distanceForwardOnCycle('c', 'x', cycle), null);
  });

  it('getCertifiedHamiltonianDebugInfo returns correct indices and counters', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[4]!, map.hamiltonianCycle[2]!, map.hamiltonianCycle[3]!],
        direction: 'down',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[9]!,
      stepsSinceLastApple: 2
    });

    const info = getCertifiedHamiltonianDebugInfo(state);

    assert.equal(info.headIndex, 4);
    assert.equal(info.tailIndex, 3);
    assert.equal(info.appleIndex, 9);
    assert.equal(info.distanceHeadToApple, 5);
    assert.equal(info.snakeLength, 3);
    assert.equal(info.playableCellCount, map.graph.nodes.length);
    assert.equal(info.stepsSinceLastApple, 2);
    assert.equal(cycleIndexOf(map.hamiltonianCycle[4]!, map.hamiltonianCycle), 4);
  });

  it('in a deterministic certified-hamiltonian simulation, distanceHeadToApple decreases by 1 each move until apple is eaten', () => {
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
      appleNodeId: map.hamiltonianCycle[5]!,
      stepsSinceLastApple: 0
    });

    while (state.applesEaten === 0) {
      const before = getCertifiedHamiltonianDebugInfo(state);
      const decision = decideAiMove(state, 'certified-hamiltonian');
      const nextState = advanceGame(state, decision!.direction, 0, { next: () => 0 });

      if (nextState.applesEaten === state.applesEaten) {
        const after = getCertifiedHamiltonianDebugInfo(nextState);
        assert.equal(after.distanceHeadToApple, (before.distanceHeadToApple ?? 0) - 1);
        assert.equal(after.stepsSinceLastApple, before.stepsSinceLastApple + 1);
      } else {
        assert.equal(nextState.applesEaten, state.applesEaten + 1);
        assert.equal(nextState.stepsSinceLastApple, 0);
      }

      state = nextState;
    }
  });

  it('in a deterministic certified-hamiltonian simulation, the apple is eventually eaten', () => {
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
      appleNodeId: map.hamiltonianCycle[6]!,
      stepsSinceLastApple: 0
    });

    const initialDistance = getCertifiedHamiltonianDebugInfo(state).distanceHeadToApple;
    let steps = 0;
    while (state.applesEaten === 0 && steps <= map.graph.nodes.length) {
      const decision = decideAiMove(state, 'certified-hamiltonian');
      state = advanceGame(state, decision!.direction, 0, { next: () => 0 });
      steps += 1;
    }

    assert.equal(state.applesEaten, 1);
    assert.equal(steps, initialDistance);
  });

  it('no non-eating loop occurs under locked-cycle following', () => {
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
      appleNodeId: map.hamiltonianCycle[7]!,
      stepsSinceLastApple: 0
    });

    const seen = new Set<string>();
    while (state.applesEaten === 0) {
      const info = getCertifiedHamiltonianDebugInfo(state);
      const key = `${info.headIndex}:${info.distanceHeadToApple}:${info.stepsSinceLastApple}`;
      assert.equal(seen.has(key), false);
      seen.add(key);

      const decision = decideAiMove(state, 'certified-hamiltonian');
      state = advanceGame(state, decision!.direction, 0, { next: () => 0 });
    }

    assert.equal(state.applesEaten, 1);
  });
});
