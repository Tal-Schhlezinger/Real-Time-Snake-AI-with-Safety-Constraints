import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import { appleForward, bodyContiguous } from '../src/core/hamiltonian-certificate';
import {
  applyCertifiedHamiltonianPostStepRepair,
  NullCycleRepairer,
  RectangleFlipCycleRepairer,
  type RectangleFlipRepairDiagnostics,
  type CycleRepairer
} from '../src/core/cycle-repairer';
import { advanceGame } from '../src/core/game-engine';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import type { HamiltonianCycle } from '../src/core/types';
import { makeGameState } from './helpers';

function nextOnCycle(cycle: string[], head: string): string {
  const index = cycle.indexOf(head);
  if (index === -1) {
    throw new Error(`Head ${head} is not in the cycle.`);
  }
  return cycle[(index + 1) % cycle.length]!;
}

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

class InjectedRectangleFlipRepairer extends RectangleFlipCycleRepairer {
  constructor(
    private readonly injectedCandidates: HamiltonianCycle[],
    options: ConstructorParameters<typeof RectangleFlipCycleRepairer>[0] = {}
  ) {
    super(options);
  }

  protected override generateCandidateCycles(): HamiltonianCycle[] {
    this.lastSearchStats = {
      rectanglesVisited: 0,
      candidatesChecked: this.injectedCandidates.length,
      validCandidatesFound: 0
    };
    this.lastDiagnostics = {
      rectanglesScanned: 0,
      rectanglesInFocus: 0,
      patternsConsidered: 0,
      rawCandidatesGenerated: this.injectedCandidates.length,
      duplicateCandidatesSkipped: 0,
      graphInvalidCandidates: 0,
      bodyContiguousFailed: 0,
      appleForwardFailed: 0,
      nonImprovingCandidates: 0,
      acceptedCandidates: 0,
      budgetExhausted: false
    };
    return this.injectedCandidates.map((candidate) => [...candidate]);
  }
}

describe('Cycle repairer', () => {
  it('core helper does nothing for non-certified strategies', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const nextState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'greedy',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[1]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[3]!,
      applesEaten: 1
    });
    const repairer: CycleRepairer = {
      proposeCycle() {
        throw new Error('repairer should not be called');
      }
    };

    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState: makeGameState({
        map,
        mode: 'ai',
        aiStrategy: 'greedy',
        lockedHamiltonianCycle: [...map.hamiltonianCycle],
        snake: {
          segments: [map.hamiltonianCycle[0]!],
          direction: 'right',
          pendingGrowth: 0
        },
        appleNodeId: map.hamiltonianCycle[1]!,
        applesEaten: 0
      }),
      nextState,
      strategy: 'greedy',
      cycleRepairer: repairer
    });

    assert.equal(repaired, nextState);
  });

  it('NullCycleRepairer keeps the old cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: new NullCycleRepairer()
    });

    assert.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
  });

  it('core helper does nothing when applesEaten did not increase', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const calls: number[] = [];
    const repairer: CycleRepairer = {
      proposeCycle() {
        calls.push(1);
        return null;
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[5]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });

    assert.equal(calls.length, 0);
    assert.equal(repaired, movedState);
  });

  it('core helper calls repairer after apple eaten in certified mode', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const calls: number[] = [];
    const repairer: CycleRepairer = {
      proposeCycle() {
        calls.push(1);
        return null;
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: [...map.hamiltonianCycle],
      snake: {
        segments: [map.hamiltonianCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: map.hamiltonianCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });

    assert.equal(calls.length, 1);
  });

  it('invalid proposed cycle is rejected', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const repairer: CycleRepairer = {
      proposeCycle() {
        return [...oldCycle.slice(0, -1)];
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });

    assert.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
  });

  it('candidate repair cycle is rejected if AppleForward fails', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const candidate = [...oldCycle].reverse();
    const repairer: CycleRepairer = {
      proposeCycle() {
        return candidate;
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });

    assert.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
  });

  it('valid candidate repair cycle is accepted if validateHamiltonianCycle, bodyContiguous, and AppleForward all pass', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const candidate = [...oldCycle.slice(5), ...oldCycle.slice(0, 5)];
    const repairer: CycleRepairer = {
      proposeCycle() {
        return candidate;
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });

    assert.deepEqual(repaired.lockedHamiltonianCycle, candidate);
  });

  it('after accepting a valid proposed cycle, certified-hamiltonian follows next_on_cycle on the new cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const candidate = [...oldCycle.slice(5), ...oldCycle.slice(0, 5)];
    const repairer: CycleRepairer = {
      proposeCycle() {
        return candidate;
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });
    const expectedNextHead = nextOnCycle(candidate, repaired.snake.segments[0]!);
    const nextDecision = decideAiMove(repaired, 'certified-hamiltonian');
    const afterNextMove = advanceGame(repaired, nextDecision!.direction, 0, { next: () => 0 });

    assert.equal(afterNextMove.snake.segments[0], expectedNextHead);
  });

  it('between apple events, movement remains exactly next_on_cycle of the currently locked cycle', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const candidate = [...oldCycle.slice(5), ...oldCycle.slice(0, 5)];
    const calls: number[] = [];
    const repairer: CycleRepairer = {
      proposeCycle() {
        calls.push(1);
        return candidate;
      }
    };
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });

    const movedState = advanceGame(previousState, decideAiMove(previousState, 'certified-hamiltonian')!.direction, 0, { next: () => 0 });
    let state = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState: movedState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });
    state = {
      ...state,
      appleNodeId: candidate[(candidate.indexOf(state.snake.segments[0]!) + 5) % candidate.length]!
    };

    for (let step = 0; step < 3; step += 1) {
      const activeCycle = state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
      const expectedNextHead = nextOnCycle(activeCycle, state.snake.segments[0]!);
      const decision = decideAiMove(state, 'certified-hamiltonian');
      const advanced = advanceGame(state, decision!.direction, 0, { next: () => 0 });
      state = applyCertifiedHamiltonianPostStepRepair({
        previousState: state,
        nextState: advanced,
        strategy: 'certified-hamiltonian',
        cycleRepairer: repairer
      });
      assert.equal(state.snake.segments[0], expectedNextHead);
    }

    assert.equal(calls.length, 1);
  });

  it('RectangleFlipCycleRepairer returns null if no valid flip exists', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const repairer = new RectangleFlipCycleRepairer({ maxFlipsChecked: 12, searchNeighborhood: null });
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

    const candidate = repairer.proposeCycle(state, map.hamiltonianCycle);

    assert.equal(candidate, null);
    assert.deepEqual(repairer.lastDiagnostics, {
      rectanglesScanned: 9,
      rectanglesInFocus: 9,
      patternsConsidered: 72,
      rawCandidatesGenerated: 0,
      duplicateCandidatesSkipped: 0,
      graphInvalidCandidates: 0,
      bodyContiguousFailed: 0,
      appleForwardFailed: 0,
      nonImprovingCandidates: 0,
      acceptedCandidates: 0,
      budgetExhausted: false
    } satisfies RectangleFlipRepairDiagnostics);
  });

  it('invalid flip candidates are rejected', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const repairer = new InjectedRectangleFlipRepairer([[...map.hamiltonianCycle.slice(0, -1)]]);
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

    assert.equal(repairer.proposeCycle(state, map.hamiltonianCycle), null);
    assert.equal(repairer.lastDiagnostics.graphInvalidCandidates, 1);
    assert.equal(repairer.lastDiagnostics.acceptedCandidates, 0);
  });

  it('a valid flip candidate can be accepted', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const repairer = new InjectedRectangleFlipRepairer([ALTERNATE_RECT_4X4_CYCLE]);
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

    const candidate = repairer.proposeCycle(state, map.hamiltonianCycle);

    assert.deepEqual(candidate, ALTERNATE_RECT_4X4_CYCLE);
  });

  it('accepted candidate passes validateHamiltonianCycle, bodyContiguous, and appleForward', () => {
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

    assert.equal(validateHamiltonianCycle(map.graph, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.equal(bodyContiguous(state.snake.segments, ALTERNATE_RECT_4X4_CYCLE), true);
    assert.equal(appleForward(state.snake.segments, state.appleNodeId, ALTERNATE_RECT_4X4_CYCLE), true);
  });

  it('a valid non-improving flip is not accepted unless config allows non-improving repairs', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const nonImprovingCandidate = [...map.hamiltonianCycle.slice(5), ...map.hamiltonianCycle.slice(0, 5)];
    const strictRepairer = new InjectedRectangleFlipRepairer([nonImprovingCandidate]);
    const permissiveRepairer = new InjectedRectangleFlipRepairer([nonImprovingCandidate], {
      allowNonImprovingRepairs: true
    });
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

    assert.equal(strictRepairer.proposeCycle(state, map.hamiltonianCycle), null);
    assert.equal(strictRepairer.lastDiagnostics.nonImprovingCandidates, 1);
    assert.equal(strictRepairer.lastDiagnostics.acceptedCandidates, 0);
    assert.deepEqual(permissiveRepairer.proposeCycle(state, map.hamiltonianCycle), nonImprovingCandidate);
    assert.equal(permissiveRepairer.lastDiagnostics.acceptedCandidates, 1);
  });

  it('search budget is respected', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const repairer = new RectangleFlipCycleRepairer({ maxFlipsChecked: 0, searchNeighborhood: null });
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

    assert.equal(repairer.proposeCycle(state, map.hamiltonianCycle), null);
    assert.equal(repairer.lastSearchStats.candidatesChecked, 0);
    assert.equal(repairer.lastDiagnostics.budgetExhausted, true);
  });

  it('certified-hamiltonian still follows exactly next_on_cycle of the locked cycle after a repair', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const repairer = new InjectedRectangleFlipRepairer([ALTERNATE_RECT_4X4_CYCLE]);
    const oldCycle = [...map.hamiltonianCycle];
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });
    const nextState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[1]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[9]!,
      applesEaten: 1
    });

    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: repairer
    });
    const decision = decideAiMove(repaired, 'certified-hamiltonian');
    const afterMove = advanceGame(repaired, decision!.direction, 0, { next: () => 0 });

    assert.deepEqual(repaired.lockedHamiltonianCycle, ALTERNATE_RECT_4X4_CYCLE);
    assert.equal(afterMove.snake.segments[0], nextOnCycle(ALTERNATE_RECT_4X4_CYCLE, repaired.snake.segments[0]!));
  });

  it('if the repairer returns null, the old cycle is kept', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const oldCycle = [...map.hamiltonianCycle];
    const previousState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[0]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[1]!
    });
    const nextState = makeGameState({
      map,
      mode: 'ai',
      aiStrategy: 'certified-hamiltonian',
      lockedHamiltonianCycle: oldCycle,
      snake: {
        segments: [oldCycle[1]!],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: oldCycle[9]!,
      applesEaten: 1
    });

    const repaired = applyCertifiedHamiltonianPostStepRepair({
      previousState,
      nextState,
      strategy: 'certified-hamiltonian',
      cycleRepairer: new RectangleFlipCycleRepairer({ maxFlipsChecked: 12, searchNeighborhood: null })
    });

    assert.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
  });
});
