import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import { applyCertifiedPostAppleTransition, getCertifiedLockedCycle } from '../src/core/certified-cycle-controller';
import {
  analyzeCertifiedTransitionTargets,
  generateCandidatePathsToApple
} from '../src/core/certified-transition-diagnostics';
import { generateDiverseHamiltonianCycles, type CycleLibrary, type CycleLibraryEntry } from '../src/core/cycle-library';
import { advanceGame } from '../src/core/game-engine';
import { createInitialGameState } from '../src/core/game-state';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import type { GameState, HamiltonianCycle } from '../src/core/types';
import { makeGameState } from './helpers';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeEntry(id: string, cycle: HamiltonianCycle, source: CycleLibraryEntry['source'] = 'solver'): CycleLibraryEntry {
  return {
    id,
    cycle,
    source,
    archetypeName: source === 'base' ? 'base' : 'test-target',
    minDistanceToAccepted: source === 'base' ? 0 : 1,
    minOrderDistanceToAccepted: source === 'base' ? 0 : 1
  };
}

function makeLibrary(mapId: string, entries: CycleLibraryEntry[]): CycleLibrary {
  return {
    mapId,
    status: 'ready',
    entries,
    diagnostics: {
      generationAttempts: 0,
      generatedCycles: entries.filter((entry) => entry.source !== 'base').length,
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
}

function stepUntilApple(state: GameState, library: CycleLibrary): GameState {
  let current = state;
  const targetApples = current.applesEaten + 1;
  for (let step = 0; step < current.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
    const decision = decideAiMove(current, 'certified-hamiltonian');
    if (!decision) {
      return current;
    }
    const advanced = advanceGame(current, decision.direction, 0, { next: () => 0 });
    current = applyCertifiedPostAppleTransition({
      previousState: current,
      nextState: advanced,
      cycleLibrary: library
    });
    if (current.applesEaten >= targetApples) {
      return current;
    }
  }
  return current;
}

describe('Certified transition diagnostics', () => {
  it('diagnostics do not change gameplay behavior', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = generateDiverseHamiltonianCycles(map);
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const before = clone(state);
    const decisionBefore = decideAiMove(state, 'certified-hamiltonian');

    analyzeCertifiedTransitionTargets(state, library);

    assert.deepEqual(state, before);
    assert.deepEqual(decideAiMove(state, 'certified-hamiltonian'), decisionBefore);
  });

  it('at snake length 1 and 2, the current locked cycle has a successful transition path', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = generateDiverseHamiltonianCycles(map);
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const afterFirstApple = stepUntilApple(initial, library);

    for (const state of [initial, afterFirstApple]) {
      const diagnostics = analyzeCertifiedTransitionTargets(state, library);
      const currentTarget = diagnostics.targets.find((target) => target.isCurrentLockedCycle);

      assert.ok(currentTarget);
      assert.equal(currentTarget.successfulTransitionPaths > 0, true);
    }
  });

  it('controlled one-step apple path can certify a target cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const library = makeLibrary(map.id, [makeEntry('rect:base', map.hamiltonianCycle, 'base')]);

    const diagnostics = analyzeCertifiedTransitionTargets(state, library, {
      maxPathLength: 1,
      maxPaths: 8,
      slack: 0
    });
    const target = diagnostics.targets[0];

    assert.ok(target);
    assert.equal(target.successfulTransitionPaths > 0, true);
    assert.equal(target.bestSuccessfulPathLength, 1);
    assert.deepEqual(target.bestSuccessfulPath, ['right']);
  });

  it('path reaches apple but post-apple validLockedCertificate failure is reported', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const reversed = [map.hamiltonianCycle[0]!, ...map.hamiltonianCycle.slice(1).reverse()];
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const library = makeLibrary(map.id, [makeEntry('rect:reversed', reversed)]);

    const diagnostics = analyzeCertifiedTransitionTargets(state, library, {
      maxPathLength: 1,
      maxPaths: 8,
      slack: 0
    });
    const target = diagnostics.targets[0];

    assert.ok(target);
    assert.equal(target.safePathsToApple > 0, true);
    assert.equal(target.successfulTransitionPaths, 0);
    assert.equal(target.failureReasons.postAppleLockedCertificateFailed > 0, true);
    assert.equal(target.lockedCertificateFailures.length > 0, true);
  });

  it('collision-before-apple paths are rejected', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: ['n-0-0', 'n-0-1', 'n-1-0', 'n-1-1'],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-2-0'
    });
    const library = makeLibrary(map.id, [makeEntry('rect:base', map.hamiltonianCycle, 'base')]);

    const paths = generateCandidatePathsToApple(state, { maxPaths: 8, slack: 2 });
    const diagnostics = analyzeCertifiedTransitionTargets(state, library, { maxPaths: 8, slack: 2 });

    assert.equal(paths.paths.length > 0, true);
    assert.equal(diagnostics.targets[0]!.failureReasons.collisionBeforeApple > 0, true);
  });

  it('diagnostics are deterministic for fixed options', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 6, height: 6 });
    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 8 });
    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });

    const left = analyzeCertifiedTransitionTargets(state, library, { maxPaths: 16, slack: 4 });
    const right = analyzeCertifiedTransitionTargets(state, library, { maxPaths: 16, slack: 4 });

    assert.deepEqual(left, right);
    assert.equal(left.bestTargetCycleId !== null, true);
    assert.equal(getCertifiedLockedCycle(state).length, map.hamiltonianCycle.length);
  });
});
