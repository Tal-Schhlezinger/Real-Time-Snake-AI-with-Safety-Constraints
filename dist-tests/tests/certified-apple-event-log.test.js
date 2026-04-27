"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const certified_cycle_controller_1 = require("../src/core/certified-cycle-controller");
const certified_apple_event_log_1 = require("../src/core/certified-apple-event-log");
const cycle_library_1 = require("../src/core/cycle-library");
const game_engine_1 = require("../src/core/game-engine");
const game_state_1 = require("../src/core/game-state");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
function runPlainCertifiedSimulation(width, height, appleLimit = 4) {
    const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: `plain-${width}x${height}`, name: 'Plain', width, height });
    const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map);
    let state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    let steps = 0;
    while (!state.isOver && state.applesEaten < appleLimit && steps < map.graph.nodes.length * appleLimit * 4) {
        const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        if (!decision) {
            break;
        }
        const advanced = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        state = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
        lockedCycle: (0, certified_cycle_controller_1.getCertifiedLockedCycle)(state),
        steps
    };
}
(0, testkit_1.describe)('Certified apple event log', () => {
    (0, testkit_1.it)('debug log generation does not change game state or movement decisions', () => {
        const plain = runPlainCertifiedSimulation(4, 4);
        const report = (0, certified_apple_event_log_1.collectCertifiedAppleEventLog)((0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }), { appleLimit: 4 });
        strict_1.default.equal(report.finalStateSummary.applesEaten, plain.applesEaten);
        strict_1.default.equal(report.finalStateSummary.outcome, plain.outcome);
        strict_1.default.equal(report.finalStateSummary.lockedCycleId?.endsWith(':base') ?? false, plain.lockedCycleId?.endsWith(':base') ?? false);
        strict_1.default.equal(report.finalStateSummary.steps, plain.steps);
    });
    (0, testkit_1.it)('log includes before-apple and after-apple snapshots', () => {
        const report = (0, certified_apple_event_log_1.collectCertifiedAppleEventLog)((0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }), { appleLimit: 2 });
        const event = report.events[0];
        strict_1.default.ok(event);
        strict_1.default.equal(event.beforeApple.stepNumber > 0, true);
        strict_1.default.equal(event.beforeApple.boardRendering.includes('H'), true);
        strict_1.default.equal(event.afterApple.applesEatenAfter >= 1, true);
        strict_1.default.equal(typeof event.afterApple.boardRendering, 'string');
    });
    (0, testkit_1.it)('log includes candidate rejection reasons and final selection reason', () => {
        const report = (0, certified_apple_event_log_1.collectCertifiedAppleEventLog)((0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'debug-6x6', name: 'Debug 6x6', width: 6, height: 6 }), { appleLimit: 2 });
        const eventWithCandidates = report.events.find((event) => event.candidateEvaluation !== null);
        strict_1.default.ok(eventWithCandidates);
        strict_1.default.equal(eventWithCandidates.candidateEvaluation.candidates.some((candidate) => candidate.finalDecision.startsWith('rejected')), true);
        strict_1.default.equal(typeof eventWithCandidates.finalSelection.finalReason, 'string');
    });
    (0, testkit_1.it)('formatted log is deterministic for fixed options', () => {
        const left = (0, certified_apple_event_log_1.formatCertifiedAppleEventLog)((0, certified_apple_event_log_1.collectCertifiedAppleEventLog)((0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }), { appleLimit: 2 }));
        const right = (0, certified_apple_event_log_1.formatCertifiedAppleEventLog)((0, certified_apple_event_log_1.collectCertifiedAppleEventLog)((0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }), { appleLimit: 2 }));
        strict_1.default.equal(left, right);
        strict_1.default.equal(left.includes('-- Apple Event 1 --'), true);
        strict_1.default.equal(left.includes('final:'), true);
    });
});
