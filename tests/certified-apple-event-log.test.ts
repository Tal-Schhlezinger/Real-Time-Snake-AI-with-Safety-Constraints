import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { decideAiMove } from '../src/core/ai-controller';
import { applyCertifiedPostAppleTransition, getCertifiedLockedCycle } from '../src/core/certified-cycle-controller';
import {
  collectCertifiedAppleEventLog,
  formatCertifiedAppleEventLog
} from '../src/core/certified-apple-event-log';
import { generateDiverseHamiltonianCycles } from '../src/core/cycle-library';
import { advanceGame } from '../src/core/game-engine';
import { createInitialGameState } from '../src/core/game-state';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';

function runPlainCertifiedSimulation(width: number, height: number, appleLimit = 4) {
  const map = createRectangularSavedMap({ id: `plain-${width}x${height}`, name: 'Plain', width, height });
  const library = generateDiverseHamiltonianCycles(map);
  let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
  let steps = 0;

  while (!state.isOver && state.applesEaten < appleLimit && steps < map.graph.nodes.length * appleLimit * 4) {
    const decision = decideAiMove(state, 'certified-hamiltonian');
    if (!decision) {
      break;
    }
    const advanced = advanceGame(state, decision.direction, 0, { next: () => 0 });
    state = applyCertifiedPostAppleTransition({
      previousState: state,
      nextState: advanced,
      cycleLibrary: library
    });
    steps += 1;
  }

  return {
    applesEaten: state.applesEaten,
    outcome: state.outcome,
    lockedCycleId: state.lockedHamiltonianCycleId,
    lockedCycle: getCertifiedLockedCycle(state),
    steps
  };
}

describe('Certified apple event log', () => {
  it('debug log generation does not change game state or movement decisions', () => {
    const plain = runPlainCertifiedSimulation(4, 4);
    const report = collectCertifiedAppleEventLog(
      createRectangularSavedMap({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }),
      { appleLimit: 4 }
    );

    assert.equal(report.finalStateSummary.applesEaten, plain.applesEaten);
    assert.equal(report.finalStateSummary.outcome, plain.outcome);
    assert.equal(report.finalStateSummary.lockedCycleId?.endsWith(':base') ?? false, plain.lockedCycleId?.endsWith(':base') ?? false);
    assert.equal(report.finalStateSummary.steps, plain.steps);
  });

  it('log includes before-apple and after-apple snapshots', () => {
    const report = collectCertifiedAppleEventLog(
      createRectangularSavedMap({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }),
      { appleLimit: 2 }
    );
    const event = report.events[0];

    assert.ok(event);
    assert.equal(event.beforeApple.stepNumber > 0, true);
    assert.equal(event.beforeApple.boardRendering.includes('H'), true);
    assert.equal(event.afterApple.applesEatenAfter >= 1, true);
    assert.equal(typeof event.afterApple.boardRendering, 'string');
  });

  it('log includes candidate rejection reasons and final selection reason', () => {
    const report = collectCertifiedAppleEventLog(
      createRectangularSavedMap({ id: 'debug-6x6', name: 'Debug 6x6', width: 6, height: 6 }),
      { appleLimit: 2 }
    );
    const eventWithCandidates = report.events.find((event) => event.candidateEvaluation !== null);

    assert.ok(eventWithCandidates);
    assert.equal(
      eventWithCandidates.candidateEvaluation!.candidates.some((candidate) => candidate.finalDecision.startsWith('rejected')),
      true
    );
    assert.equal(typeof eventWithCandidates.finalSelection.finalReason, 'string');
  });

  it('formatted log is deterministic for fixed options', () => {
    const left = formatCertifiedAppleEventLog(collectCertifiedAppleEventLog(
      createRectangularSavedMap({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }),
      { appleLimit: 2 }
    ));
    const right = formatCertifiedAppleEventLog(collectCertifiedAppleEventLog(
      createRectangularSavedMap({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }),
      { appleLimit: 2 }
    ));

    assert.equal(left, right);
    assert.equal(left.includes('-- Apple Event 1 --'), true);
    assert.equal(left.includes('final:'), true);
  });
});
