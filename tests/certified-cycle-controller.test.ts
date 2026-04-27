import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import { CertifiedHamiltonianInvariantError } from '../src/core/certified-hamiltonian-error';
import {
  CanSwitchAndLock,
  applyCertifiedPostAppleTransition,
  createCertifiedRuntimeSwitchingDiagnostics,
  getCertifiedLockedCycle,
  setCertifiedLockedCycleOrThrow,
  selectBestSwitchableCycle
} from '../src/core/certified-cycle-controller';
import { generateDiverseHamiltonianCycles, type CycleLibrary, type CycleLibraryEntry } from '../src/core/cycle-library';
import { advanceGame } from '../src/core/game-engine';
import { createInitialGameState } from '../src/core/game-state';
import {
  appleForward,
  bodyContiguous,
  cycleIndexOf,
  distanceForwardOnCycle,
  explainLockedCertificateFailure,
  validLockedCertificate
} from '../src/core/hamiltonian-certificate';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { createPatchMutationScenarioStates } from '../src/core/patch-mutation-scenarios';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import type { GameState, HamiltonianCycle } from '../src/core/types';
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

function makeEntry(id: string, cycle: HamiltonianCycle, source: CycleLibraryEntry['source'] = 'solver'): CycleLibraryEntry {
  return {
    id,
    cycle,
    source,
    archetypeName: source === 'base' ? 'base' : 'test-candidate',
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

function nextOnCycle(cycle: HamiltonianCycle, nodeId: string): string {
  const index = cycle.indexOf(nodeId);
  assert.notEqual(index, -1);
  return cycle[(index + 1) % cycle.length]!;
}

function makePostApplePlanningPair<T extends { state: ReturnType<typeof makeGameState> }>(
  scenario: T
): { previousState: T['state']; nextState: T['state'] } {
  return {
    previousState: {
      ...scenario.state,
      applesEaten: scenario.state.applesEaten - 1
    },
    nextState: scenario.state
  };
}

function getPatchScenario(
  map: ReturnType<typeof createRectangularSavedMap>,
  scenarioId: string
) {
  const scenario = createPatchMutationScenarioStates(map, {
    seedValues: [0, 0.23, 0.47, 0.71],
    midGameFillRatios: [],
    maxSimulationSteps: 100
  }).find((candidate) => candidate.scenarioId === scenarioId);

  assert.ok(scenario);
  return scenario;
}

const V2_TEST_OPTIONS = {
  enablePatchMutation: false,
  enableV2PatchMutation: true,
  maxV2FillRatio: 1,
  maxV2RectsScanned: 500,
  maxV2Candidates: 300,
  maxV2PatchArea: 24,
  maxV2TransitionPathsPerCandidate: 8,
  maxV2TransitionSlack: 2,
  maxV2TransitionPathLength: 16,
  maxV2TransitionSearchStates: 10_000,
  maxV2SolverExpansions: 100_000
};

function createSeededRandom(seed: number): { next(): number } {
  let state = Math.max(1, Math.floor(seed)) % 2_147_483_647;
  return {
    next(): number {
      state = (state * 48_271) % 2_147_483_647;
      return state / 2_147_483_647;
    }
  };
}

function summarizeLockedProofState(
  state: GameState,
  cycle: HamiltonianCycle
) {
  const head = state.snake.segments[0] ?? null;
  const tail = state.snake.segments[state.snake.segments.length - 1] ?? null;
  const headIndex = head ? cycleIndexOf(head, cycle) : null;
  const nextOnLockedCycle = headIndex === null ? null : cycle[(headIndex + 1) % cycle.length] ?? null;

  return {
    applesEaten: state.applesEaten,
    certifiedMode: state.certifiedMode,
    lockedCycleId: state.lockedHamiltonianCycleId,
    head,
    tail,
    snakeLength: state.snake.segments.length,
    apple: state.appleNodeId,
    graphValid: validateHamiltonianCycle(state.map.graph, cycle),
    lockedCertificateValid: validLockedCertificate(state.snake.segments, cycle),
    lockedCertificateFailure: explainLockedCertificateFailure(state.snake.segments, cycle),
    forwardDistanceTailToHead: head && tail ? distanceForwardOnCycle(tail, head, cycle) : null,
    expectedForwardDistance: state.snake.segments.length - 1,
    nextOnLockedCycle,
    nextOnLockedCycleOccupied: nextOnLockedCycle ? state.snake.segments.includes(nextOnLockedCycle) : null
  };
}

describe('Certified cycle controller', () => {
  it('initial certified state starts on the base locked cycle and library phase', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });

    const state = createInitialGameState(map, 'ai', 'certified-hamiltonian');

    assert.deepEqual(state.lockedHamiltonianCycle, map.hamiltonianCycle);
    assert.equal(state.lockedHamiltonianCycleId, 'rect:base');
    assert.equal(state.certifiedPhase, 'library');
    assert.equal(Object.prototype.hasOwnProperty.call(state, 'pendingCertifiedSwitch'), false);
  });

  it('a graph-invalid locked cycle fails immediately in certified initialization even when the body certificate would pass', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const corruptedMap = {
      ...map,
      hamiltonianCycle: [
        map.hamiltonianCycle[0]!,
        map.hamiltonianCycle[2]!,
        ...map.hamiltonianCycle.filter((nodeId) => nodeId !== map.hamiltonianCycle[0] && nodeId !== map.hamiltonianCycle[2])
      ]
    };

    assert.equal(validLockedCertificate([corruptedMap.hamiltonianCycle[0]!], corruptedMap.hamiltonianCycle), true);

    assert.throws(
      () => createInitialGameState(corruptedMap, 'ai', 'certified-hamiltonian'),
      /Certified Hamiltonian AI invariant failed: initial locked cycle does not form a valid Hamiltonian cycle for the current map graph\./
    );
  });

  it('CanSwitchAndLock accepts a valid candidate for the real current state', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const candidate = makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE);
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-3-2'
    });

    assert.equal(validLockedCertificate(state.snake.segments, candidate.cycle), true);
    assert.equal(appleForward(state.snake.segments, state.appleNodeId, candidate.cycle), true);
    assert.equal(CanSwitchAndLock(state, candidate), true);
  });

  it('CanSwitchAndLock rejects invalid cycles', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-3-2'
    });

    assert.equal(
      CanSwitchAndLock(
        state,
        makeEntry('rect:generated:bad', [...ALTERNATE_RECT_4X4_CYCLE.slice(0, -1)])
      ),
      false
    );
  });

  it('a cycle-library candidate with bodyContiguous true but wrong orientation is rejected', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const wrongOrientationBody = [map.hamiltonianCycle[3]!, map.hamiltonianCycle[5]!, map.hamiltonianCycle[4]!];
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...ALTERNATE_RECT_4X4_CYCLE],
      lockedHamiltonianCycleId: 'rect:generated:alt',
      snake: {
        segments: wrongOrientationBody,
        direction: 'down',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[10]!
    });

    assert.equal(bodyContiguous(wrongOrientationBody, map.hamiltonianCycle), true);
    assert.equal(validLockedCertificate(wrongOrientationBody, map.hamiltonianCycle), false);
    assert.equal(CanSwitchAndLock(state, makeEntry('rect:base', [...map.hamiltonianCycle], 'base')), false);
  });

  it('selectBestSwitchableCycle prefers the shorter current-apple path', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-3-2'
    });

    const selected = selectBestSwitchableCycle(
      state,
      makeLibrary(map.id, [
        makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
        makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
      ])
    );

    assert.equal(selected?.id, 'rect:generated:alt');
  });

  it('selection keeps the current cycle when no candidate improves the current apple path', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-2-2'
    });

    const selected = selectBestSwitchableCycle(
      state,
      makeLibrary(map.id, [
        makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
        makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
      ])
    );

    assert.equal(selected, null);
  });

  it('no pre-apple pending switch is staged or committed', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const cycleLibrary = makeLibrary(map.id, [
      makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
      makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
    ]);
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      lockedHamiltonianCycleId: 'rect:base',
      snake: {
        segments: [map.hamiltonianCycle[1]!, map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-3-2'
    });

    assert.equal(selectBestSwitchableCycle(previousState, cycleLibrary)?.id, 'rect:generated:alt');

    const advancedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary
    });

    assert.equal(previousState.applesEaten, advancedState.applesEaten);
    assert.deepEqual(getCertifiedLockedCycle(transitioned), map.hamiltonianCycle);
    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
    assert.equal(Object.prototype.hasOwnProperty.call(transitioned, 'pendingCertifiedSwitch'), false);
  });

  it('post-apple cycle selection uses the real nextState body, not a simulated pre-apple body', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const alternateEntry = makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE);
    const cycleLibrary = makeLibrary(map.id, [
      makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
      alternateEntry
    ]);
    const previousState = makeGameState({
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

    assert.equal(CanSwitchAndLock(previousState, alternateEntry), true);

    const advancedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary
    });

    assert.equal(previousState.applesEaten + 1, advancedState.applesEaten);
    assert.equal(validLockedCertificate(advancedState.snake.segments, ALTERNATE_RECT_4X4_CYCLE), false);
    assert.deepEqual(getCertifiedLockedCycle(transitioned), map.hamiltonianCycle);
    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
  });

  it('after an apple event, a valid better candidate can be locked immediately', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const cycleLibrary = makeLibrary(map.id, [
      makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
      makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
    ]);
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

    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-3-2'
    };
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary
    });

    assert.equal(validLockedCertificate(advancedState.snake.segments, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.equal(appleForward(advancedState.snake.segments, advancedState.appleNodeId, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.deepEqual(getCertifiedLockedCycle(transitioned), ALTERNATE_RECT_4X4_CYCLE);
    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect:generated:alt');
  });

  it('if no valid candidate exists after apple, the old locked cycle is kept when still valid', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const previousState = makeGameState({
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

    const advancedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)])
    });

    assert.equal(validLockedCertificate(advancedState.snake.segments, map.hamiltonianCycle), true);
    assert.deepEqual(getCertifiedLockedCycle(transitioned), map.hamiltonianCycle);
    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
  });

  it('a graph-invalid locked cycle fails in ensureValidLockedCycleOrThrow during certified post-step validation', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const corruptedCycle = [
      map.hamiltonianCycle[0]!,
      map.hamiltonianCycle[2]!,
      ...map.hamiltonianCycle.filter((nodeId) => nodeId !== map.hamiltonianCycle[0] && nodeId !== map.hamiltonianCycle[2])
    ];
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...corruptedCycle],
      lockedHamiltonianCycleId: 'rect:corrupted',
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: 'n-3-2'
    });
    const nextState = makeGameState({
      ...previousState,
      elapsedMs: 1
    });

    assert.equal(validLockedCertificate(nextState.snake.segments, corruptedCycle), true);

    assert.throws(
      () => applyCertifiedPostAppleTransition({
        previousState,
        nextState,
        cycleLibrary: makeLibrary(map.id, [])
      }),
      /Certified Hamiltonian AI invariant failed: locked cycle rect:corrupted does not form a valid Hamiltonian cycle for the current map graph\./
    );
  });

  it('locked cycle assignment cannot bypass graph and locked-certificate validation', () => {
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
      appleNodeId: map.hamiltonianCycle[12]!
    });

    assert.equal(bodyContiguous(state.snake.segments, map.hamiltonianCycle), true);
    assert.equal(validLockedCertificate(state.snake.segments, map.hamiltonianCycle), false);

    assert.throws(
      () => setCertifiedLockedCycleOrThrow(state, map.hamiltonianCycle, 'rect:base'),
      /Certified Hamiltonian AI invariant failed: locked cycle rect:base does not satisfy the locked Hamiltonian certificate for the current body\./
    );
  });

  it('if the old locked cycle is invalid after apple and no candidate exists, certified mode fails loudly', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...ALTERNATE_RECT_4X4_CYCLE],
      lockedHamiltonianCycleId: 'rect:generated:alt',
      snake: {
        segments: ['n-3-1'],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: 'n-2-1',
      applesEaten: 0
    });
    const nextState = makeGameState({
      ...previousState,
      snake: {
        segments: ['n-2-1', 'n-3-1'],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: 'n-0-0',
      applesEaten: 1
    });

    assert.equal(validLockedCertificate(nextState.snake.segments, ALTERNATE_RECT_4X4_CYCLE), false);

    assert.throws(
      () => applyCertifiedPostAppleTransition({
        previousState,
        nextState,
        cycleLibrary: makeLibrary(map.id, [])
      }),
      CertifiedHamiltonianInvariantError
    );
  });

  it('keeps existing certified behavior when patch mutation is disabled', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]);
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
    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-2-2'
    };
    const withoutPatch = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: library
    });
    const withDisabledPatch = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: library,
      options: { enablePatchMutation: false }
    });

    assert.deepEqual(withDisabledPatch, withoutPatch);
    assert.equal(withDisabledPatch.lockedHamiltonianCycleId, 'rect:base');
  });

  it('keeps old behavior when patch mutation is enabled but no candidate is available', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-2-2'
    };
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: null,
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchRectsScanned: 0
      }
    });

    assert.deepEqual(getCertifiedLockedCycle(transitioned), map.hamiltonianCycle);
    assert.equal(transitioned.certifiedMode, 'locked');
    assert.equal(diagnostics.patchMutationAttempted, 1);
    assert.equal(diagnostics.patchGraphValidCandidates, 0);
    assert.equal(diagnostics.oldCycleKept, 1);
  });

  it('selects an immediate-locked patch mutation candidate when it improves pathLen', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-2-2'
    };
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16
      }
    });

    assert.equal(transitioned.lockedHamiltonianCycleId?.startsWith('v1-patch:'), true);
    assert.equal(validateHamiltonianCycle(map.graph, getCertifiedLockedCycle(transitioned)), true);
    assert.equal(validLockedCertificate(transitioned.snake.segments, getCertifiedLockedCycle(transitioned)), true);
    assert.equal(appleForward(transitioned.snake.segments, transitioned.appleNodeId, getCertifiedLockedCycle(transitioned)), true);
    assert.equal(diagnostics.patchSelectedCandidates, 1);
    assert.equal(diagnostics.selectedCandidateSource, 'v1-patch');

    const decision = decideAiMove(transitioned, 'certified-hamiltonian')!;
    const expectedDestination = nextOnCycle(getCertifiedLockedCycle(transitioned), transitioned.snake.segments[0]!);
    assert.equal(transitioned.map.graph.edges.some((edge) =>
      edge.from === transitioned.snake.segments[0] &&
      edge.to === expectedDestination &&
      edge.direction === decision.direction
    ), true);
  });

  it('rejects non-improving patch mutation candidates by default', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-2-0'
    };
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16
      }
    });

    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
    assert.equal(diagnostics.patchSelectedCandidates, 0);
    assert.equal(diagnostics.patchRejectedNoImprovement > 0, true);
  });

  it('can select an immediate-locked improving patch candidate without starting transition search', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-2-2'
    };

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        transitionPrefilterMode: 'combined',
        preferImmediateLockedBeforeTransitionSearch: true,
        minCheapImprovementForTransitionSearch: 1
      }
    });

    assert.equal(transitioned.lockedHamiltonianCycleId?.startsWith('v1-patch:'), true);
    assert.equal(diagnostics.patchTransitionSearchesStarted, 0);
    assert.equal(diagnostics.patchImmediateLockedSelectedWithoutTransition, 0);
    assert.equal(diagnostics.patchNonImmediateCandidates, 0);
  });

  it('limits non-immediate patch candidates to the configured top-K transition searches', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const midGameScenario = createPatchMutationScenarioStates(map, {
      seedValues: [],
      midGameFillRatios: [0.4],
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    }).find((scenario) => scenario.kind === 'mid-game');

    assert.ok(midGameScenario);

    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const transitioned = applyCertifiedPostAppleTransition({
      previousState: {
        ...midGameScenario.state,
        applesEaten: midGameScenario.state.applesEaten
      },
      nextState: {
        ...midGameScenario.state,
        applesEaten: midGameScenario.state.applesEaten + 1,
        certifiedMode: 'locked' as const,
        activeCertifiedTransitionPlan: null
      },
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        patchRectangleSearchMode: 'broad',
        transitionPrefilterMode: 'combined',
        maxTransitionCandidatesPerPlanningEvent: 1,
        minCheapImprovementForTransitionSearch: -1_000,
        maxTransitionPathsPerCandidate: 64,
        maxTransitionSlack: 6
      }
    });

    assert.equal(diagnostics.patchNonImmediateCandidates > 1, true);
    assert.equal(diagnostics.patchTransitionCandidatesAfterPrefilter <= 1, true);
    assert.equal(diagnostics.patchTransitionSearchesStarted <= 1, true);
    assert.equal(diagnostics.patchTransitionCandidatesSkippedByPrefilter > 0, true);
    assert.equal(transitioned.certifiedMode === 'transition' || transitioned.lockedHamiltonianCycleId === 'rect:base', true);
  });

  it('does not use candidates skipped by the transition prefilter', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const midGameScenario = createPatchMutationScenarioStates(map, {
      seedValues: [],
      midGameFillRatios: [0.4],
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    }).find((scenario) => scenario.kind === 'mid-game');

    assert.ok(midGameScenario);

    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const transitioned = applyCertifiedPostAppleTransition({
      previousState: {
        ...midGameScenario.state,
        applesEaten: midGameScenario.state.applesEaten
      },
      nextState: {
        ...midGameScenario.state,
        applesEaten: midGameScenario.state.applesEaten + 1,
        certifiedMode: 'locked' as const,
        activeCertifiedTransitionPlan: null
      },
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        patchRectangleSearchMode: 'broad',
        transitionPrefilterMode: 'combined',
        maxTransitionCandidatesPerPlanningEvent: 0,
        minCheapImprovementForTransitionSearch: -1_000,
        maxTransitionPathsPerCandidate: 64,
        maxTransitionSlack: 6
      }
    });

    assert.equal(diagnostics.patchTransitionSearchesStarted, 0);
    assert.equal(diagnostics.patchTransitionCandidatesSkippedByPrefilter > 0, true);
    assert.equal(diagnostics.patchSelectedCandidates, 0);
    assert.equal(transitioned.certifiedMode, 'locked');
    assert.equal(transitioned.lockedHamiltonianCycleId, midGameScenario.state.lockedHamiltonianCycleId);
  });

  it('stages and follows a certified transition-backed patch mutation plan when it improves pathLen', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const midGameScenario = createPatchMutationScenarioStates(map, {
      seedValues: [],
      midGameFillRatios: [0.4],
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    }).find((scenario) => scenario.kind === 'mid-game');

    assert.ok(midGameScenario);

    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const nextState = {
      ...midGameScenario.state,
      applesEaten: midGameScenario.state.applesEaten + 1,
      certifiedMode: 'locked' as const,
      activeCertifiedTransitionPlan: null
    };
    const previousState = {
      ...midGameScenario.state,
      applesEaten: midGameScenario.state.applesEaten
    };
    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        patchRectangleSearchMode: 'broad',
        maxTransitionPathsPerCandidate: 64,
        maxTransitionSlack: 6
      }
    });

    assert.equal(transitioned.certifiedMode, 'transition');
    assert.ok(transitioned.activeCertifiedTransitionPlan);
    assert.equal(diagnostics.patchSelectedCandidates, 1);
    assert.equal(diagnostics.selectedCandidateSource, 'v1-patch');

    const firstDecision = decideAiMove(transitioned, 'certified-hamiltonian')!;
    assert.equal(firstDecision.direction, transitioned.activeCertifiedTransitionPlan.directions[0]);

    const afterOneStep = advanceGame(transitioned, firstDecision.direction, 0, { next: () => 0 });
    const progressed = applyCertifiedPostAppleTransition({
      previousState: transitioned,
      nextState: afterOneStep,
      cycleLibrary: null,
      options: { enablePatchMutation: true }
    });

    if (progressed.certifiedMode === 'transition') {
      assert.equal(progressed.activeCertifiedTransitionPlan?.nextDirectionIndex, 1);
    } else {
      assert.equal(progressed.lockedHamiltonianCycleId?.startsWith('v1-patch:'), true);
      assert.equal(validLockedCertificate(progressed.snake.segments, getCertifiedLockedCycle(progressed)), true);
    }
  });

  it('with transition prefilter disabled, certified patch behavior matches the current behavior', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const midGameScenario = createPatchMutationScenarioStates(map, {
      seedValues: [],
      midGameFillRatios: [0.4],
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16
    }).find((scenario) => scenario.kind === 'mid-game');

    assert.ok(midGameScenario);

    const previousState = {
      ...midGameScenario.state,
      applesEaten: midGameScenario.state.applesEaten
    };
    const nextState = {
      ...midGameScenario.state,
      applesEaten: midGameScenario.state.applesEaten + 1,
      certifiedMode: 'locked' as const,
      activeCertifiedTransitionPlan: null
    };
    const baseOptions = {
      enablePatchMutation: true,
      maxPatchWidth: 4,
      maxPatchHeight: 4,
      maxPatchArea: 16,
      patchRectangleSearchMode: 'broad' as const,
      maxTransitionPathsPerCandidate: 64,
      maxTransitionSlack: 6
    };

    const omitted = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      options: baseOptions
    });
    const explicitNone = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
      options: {
        ...baseOptions,
        transitionPrefilterMode: 'none'
      }
    });

    assert.deepEqual(explicitNone.activeCertifiedTransitionPlan, omitted.activeCertifiedTransitionPlan);
    assert.equal(explicitNone.certifiedMode, omitted.certifiedMode);
    assert.deepEqual(explicitNone.lockedHamiltonianCycle, omitted.lockedHamiltonianCycle);
    assert.equal(explicitNone.lockedHamiltonianCycleId, omitted.lockedHamiltonianCycleId);
  });

  it('respects patch mutation budget limits', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
    const advancedState = {
      ...advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 }),
      appleNodeId: 'n-2-2'
    };

    applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: null,
      diagnostics,
      options: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        maxPatchCandidates: 1
      }
    });

    assert.equal(diagnostics.patchGraphValidCandidates <= 1, true);
    assert.equal(diagnostics.patchRejectedBudget, 1);
  });

  it('regresses the reproduced 6x6 V1-only lock failure and keeps every locked post-step certificate valid', () => {
    const map = createRectangularSavedMap({ id: 'eval-6x6', name: 'Eval 6x6', width: 6, height: 6 });
    const random = createSeededRandom(202);
    const library = generateDiverseHamiltonianCycles(map, { maxCycles: 10, maxAttempts: 64, minDiversity: 0.2 });
    const libraryEntriesById = new Map(library.entries.map((entry) => [entry.id, entry]));
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
    const lockEvents: unknown[] = [];
    let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0.37 });

    try {
      for (let step = 0; step < 220 && !state.isOver; step += 1) {
        const previousState = state;
        const previousCycle = getCertifiedLockedCycle(previousState);

        if (previousState.certifiedMode === 'transition') {
          assert.ok(previousState.activeCertifiedTransitionPlan);
          assert.equal(validateHamiltonianCycle(previousState.map.graph, previousState.activeCertifiedTransitionPlan.targetCycle), true);
        } else {
          assert.equal(validateHamiltonianCycle(previousState.map.graph, previousCycle), true);
          assert.equal(validLockedCertificate(previousState.snake.segments, previousCycle), true);

          const libraryEntry = previousState.lockedHamiltonianCycleId
            ? libraryEntriesById.get(previousState.lockedHamiltonianCycleId)
            : null;
          if (libraryEntry) {
            assert.deepEqual(previousCycle, libraryEntry.cycle);
          }
        }

        const decision = decideAiMove(previousState, 'certified-hamiltonian');
        assert.ok(decision);
        const advancedState = advanceGame(previousState, decision.direction, 0, random);
        state = applyCertifiedPostAppleTransition({
          previousState,
          nextState: advancedState,
          cycleLibrary: library,
          options: {
            enablePatchMutation: true,
            maxPatchWidth: 6,
            maxPatchHeight: 6,
            maxPatchArea: 20,
            maxTransitionPathsPerCandidate: 64,
            maxTransitionSlack: 6,
            enableV2PatchMutation: false
          },
          diagnostics
        });

        if (
          previousState.lockedHamiltonianCycleId !== state.lockedHamiltonianCycleId ||
          previousState.applesEaten !== state.applesEaten ||
          previousState.certifiedMode !== state.certifiedMode
        ) {
          const lockedCycle = getCertifiedLockedCycle(state);
          lockEvents.push({
            step,
            selectedCandidateSource: diagnostics.switchAttemptSummaries.at(-1)?.selectedCandidateSource ?? null,
            previousLockedCycleId: previousState.lockedHamiltonianCycleId,
            newLockedCycleId: state.lockedHamiltonianCycleId,
            state: summarizeLockedProofState(state, lockedCycle)
          });
        }

        if (!state.isOver && state.certifiedMode === 'locked') {
          const lockedCycle = getCertifiedLockedCycle(state);
          assert.equal(validateHamiltonianCycle(state.map.graph, lockedCycle), true);
          assert.equal(validLockedCertificate(state.snake.segments, lockedCycle), true);
        }
      }
    } catch (error) {
      assert.fail(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        currentState: summarizeLockedProofState(state, getCertifiedLockedCycle(state)),
        lockEvents
      }, null, 2));
    }

    assert.equal(diagnostics.v2PatchAttempted, 0);
    assert.equal(state.applesEaten >= 25, true);
  });

  it('keeps behavior unchanged when V2 patch mutation is disabled', () => {
    const map = createRectangularSavedMap({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
    const scenario = getPatchScenario(map, 'rect-4:seed-0_23');
    const { previousState, nextState } = makePostApplePlanningPair(scenario);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, []),
      diagnostics,
      options: {
        enablePatchMutation: false,
        enableV2PatchMutation: false
      }
    });

    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
    assert.equal(diagnostics.v2PatchAttempted, 0);
    assert.equal(diagnostics.v2SelectedCandidates, 0);
  });

  it('selects an immediate-locked V2 patch mutation candidate when it improves pathLen', () => {
    const map = createRectangularSavedMap({ id: 'rect-6', name: 'Rect 6', width: 6, height: 6 });
    const scenario = getPatchScenario(map, 'rect-6:initial-far');
    const { previousState, nextState } = makePostApplePlanningPair(scenario);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, []),
      diagnostics,
      options: V2_TEST_OPTIONS
    });

    assert.equal(transitioned.lockedHamiltonianCycleId?.startsWith('v2-patch:'), true);
    assert.equal(transitioned.certifiedMode, 'locked');
    assert.equal(validateHamiltonianCycle(map.graph, getCertifiedLockedCycle(transitioned)), true);
    assert.equal(validLockedCertificate(transitioned.snake.segments, getCertifiedLockedCycle(transitioned)), true);
    assert.equal(appleForward(transitioned.snake.segments, transitioned.appleNodeId, getCertifiedLockedCycle(transitioned)), true);
    assert.equal(diagnostics.selectedCandidateSource, 'v2-patch');
    assert.equal(diagnostics.v2SelectedCandidates, 1);
    assert.equal(diagnostics.v2ImmediateLockedSelections, 1);

    const decision = decideAiMove(transitioned, 'certified-hamiltonian')!;
    const expectedDestination = nextOnCycle(getCertifiedLockedCycle(transitioned), transitioned.snake.segments[0]!);
    assert.equal(transitioned.map.graph.edges.some((edge) =>
      edge.from === transitioned.snake.segments[0] &&
      edge.to === expectedDestination &&
      edge.direction === decision.direction
    ), true);
  });

  it('stages a certified transition-backed V2 patch mutation plan when it improves pathLen', () => {
    const map = createRectangularSavedMap({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
    const scenario = getPatchScenario(map, 'rect-4:manual-far');
    const { previousState, nextState } = makePostApplePlanningPair(scenario);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, []),
      diagnostics,
      options: V2_TEST_OPTIONS
    });

    assert.equal(transitioned.certifiedMode, 'transition');
    assert.equal(transitioned.activeCertifiedTransitionPlan?.source, 'v2-patch');
    assert.equal(transitioned.activeCertifiedTransitionPlan?.targetCycleId.startsWith('v2-patch:'), true);
    assert.equal(diagnostics.selectedCandidateSource, 'v2-patch');
    assert.equal(diagnostics.v2SelectedCandidates, 1);
    assert.equal(diagnostics.v2TransitionSelections, 1);

    const firstDecision = decideAiMove(transitioned, 'certified-hamiltonian')!;
    assert.equal(firstDecision.direction, transitioned.activeCertifiedTransitionPlan?.directions[0]);
  });

  it('rejects non-improving V2 patch mutation candidates by default', () => {
    const map = createRectangularSavedMap({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
    const scenario = getPatchScenario(map, 'rect-4:initial-near');
    const { previousState, nextState } = makePostApplePlanningPair(scenario);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, []),
      diagnostics,
      options: V2_TEST_OPTIONS
    });

    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
    assert.equal(diagnostics.v2PatchAttempted, 1);
    assert.equal(diagnostics.v2SnakeUsableCandidates > 0, true);
    assert.equal(diagnostics.v2ImprovingCandidates, 0);
    assert.equal(diagnostics.v2SelectedCandidates, 0);
    assert.equal(diagnostics.v2RejectedNoImprovement > 0, true);
  });

  it('skips V2 patch mutation above the configured fill-ratio threshold', () => {
    const map = createRectangularSavedMap({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
    const scenario = getPatchScenario(map, 'rect-4:seed-0_23');
    const { previousState, nextState } = makePostApplePlanningPair(scenario);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, []),
      diagnostics,
      options: {
        ...V2_TEST_OPTIONS,
        maxV2FillRatio: 0.01
      }
    });

    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
    assert.equal(diagnostics.v2PatchAttempted, 0);
    assert.equal(diagnostics.v2SelectedCandidates, 0);
  });

  it('respects V2 patch mutation candidate budget limits', () => {
    const map = createRectangularSavedMap({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
    const scenario = getPatchScenario(map, 'rect-4:seed-0_23');
    const { previousState, nextState } = makePostApplePlanningPair(scenario);
    const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();

    const transitioned = applyCertifiedPostAppleTransition({
      previousState,
      nextState,
      cycleLibrary: makeLibrary(map.id, []),
      diagnostics,
      options: {
        ...V2_TEST_OPTIONS,
        maxV2Candidates: 0
      }
    });

    assert.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
    assert.equal(diagnostics.v2PatchAttempted, 1);
    assert.equal(diagnostics.v2GraphValidCandidates > 0, true);
    assert.equal(diagnostics.v2SnakeUsableCandidates, 0);
    assert.equal(diagnostics.v2SelectedCandidates, 0);
    assert.equal(diagnostics.v2RejectedBudget, 1);
  });
});
