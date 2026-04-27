import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import {
  compareCandidateCycles,
  computeCycleFeatures,
  defaultCycleScoreWeights,
  scoreCycleFeatures,
  type CycleFeatures
} from '../src/core/cycle-scoring';
import { distanceForwardOnCycle } from '../src/core/hamiltonian-certificate';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { makeGameState } from './helpers';

function reverseCycle(cycle: string[]): string[] {
  return [...cycle].reverse();
}

function makeBaseFeatures(overrides: Partial<CycleFeatures> = {}): CycleFeatures {
  return {
    pathLen: 4,
    repairDistanceFromOldCycle: 4,
    maxDistToBody: 2,
    sumDistToBody: 8,
    meanDistToBody: 2,
    bodyAdjacency: 3,
    freeComponentCount: null,
    holeArea: null,
    cutRisk: null,
    futureMobilityMargin: null,
    arcNodeIds: ['a', 'b', 'c'],
    ...overrides
  };
}

describe('Cycle scoring', () => {
  it('same cycle has repairDistanceFromOldCycle = 0', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[4]!
    });

    const features = computeCycleFeatures(state, map.hamiltonianCycle, map.hamiltonianCycle);

    assert.equal(features.repairDistanceFromOldCycle, 0);
  });

  it('different cycle has positive repair distance', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const reversed = reverseCycle(map.hamiltonianCycle);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[4]!
    });

    const features = computeCycleFeatures(state, map.hamiltonianCycle, reversed);

    assert.ok(features.repairDistanceFromOldCycle > 0);
  });

  it('pathLen equals distanceForwardOnCycle(head, apple)', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const candidate = reverseCycle(map.hamiltonianCycle);
    const head = map.hamiltonianCycle[5]!;
    const apple = map.hamiltonianCycle[13]!;
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [head, map.hamiltonianCycle[4]!, map.hamiltonianCycle[3]!],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: apple
    });

    const features = computeCycleFeatures(state, map.hamiltonianCycle, candidate);

    assert.equal(features.pathLen, distanceForwardOnCycle(head, apple, candidate));
  });

  it('body-hugging arc has lower distance-to-body features than a far arc in a controlled test', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const farCycle = map.hamiltonianCycle;
    const huggingCycle = reverseCycle(map.hamiltonianCycle);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[5]!, map.hamiltonianCycle[4]!, map.hamiltonianCycle[3]!],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[13]!
    });

    const farFeatures = computeCycleFeatures(state, map.hamiltonianCycle, farCycle);
    const huggingFeatures = computeCycleFeatures(state, map.hamiltonianCycle, huggingCycle);

    assert.ok((huggingFeatures.maxDistToBody ?? 0) <= (farFeatures.maxDistToBody ?? 0));
    assert.ok(huggingFeatures.sumDistToBody < farFeatures.sumDistToBody);
    assert.ok((huggingFeatures.meanDistToBody ?? 0) < (farFeatures.meanDistToBody ?? 0));
  });

  it('bodyAdjacency is higher for arcs adjacent to the body', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const farCycle = map.hamiltonianCycle;
    const huggingCycle = reverseCycle(map.hamiltonianCycle);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[5]!, map.hamiltonianCycle[4]!, map.hamiltonianCycle[3]!],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[13]!
    });

    const farFeatures = computeCycleFeatures(state, map.hamiltonianCycle, farCycle);
    const huggingFeatures = computeCycleFeatures(state, map.hamiltonianCycle, huggingCycle);

    assert.ok(huggingFeatures.bodyAdjacency > farFeatures.bodyAdjacency);
  });

  it('scoreCycleFeatures responds to weight changes', () => {
    const shortButDisruptive = makeBaseFeatures({
      pathLen: 2,
      repairDistanceFromOldCycle: 20
    });
    const longButStable = makeBaseFeatures({
      pathLen: 6,
      repairDistanceFromOldCycle: 0
    });

    const pathFocusedWeights = {
      ...defaultCycleScoreWeights,
      pathLen: 10,
      repairDistanceFromOldCycle: 0.1
    };
    const repairFocusedWeights = {
      ...defaultCycleScoreWeights,
      pathLen: 0.1,
      repairDistanceFromOldCycle: 10
    };

    assert.ok(scoreCycleFeatures(shortButDisruptive, pathFocusedWeights) < scoreCycleFeatures(longButStable, pathFocusedWeights));
    assert.ok(scoreCycleFeatures(shortButDisruptive, repairFocusedWeights) > scoreCycleFeatures(longButStable, repairFocusedWeights));
    assert.ok(compareCandidateCycles(shortButDisruptive, longButStable, pathFocusedWeights) < 0);
    assert.ok(compareCandidateCycles(shortButDisruptive, longButStable, repairFocusedWeights) > 0);
  });

  it('scoring does not replace hard validation for invalid cycles', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const invalidCycle = map.hamiltonianCycle.slice(0, -1);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[4]!
    });

    const features = computeCycleFeatures(state, map.hamiltonianCycle, invalidCycle);
    const score = scoreCycleFeatures(features);

    assert.equal(validateHamiltonianCycle(map.graph, invalidCycle), false);
    assert.equal(Number.isFinite(score), true);
  });
});
