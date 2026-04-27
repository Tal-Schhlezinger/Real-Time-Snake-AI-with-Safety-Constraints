"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const cycle_repairer_1 = require("../src/core/cycle-repairer");
const game_engine_1 = require("../src/core/game-engine");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
function nextOnCycle(cycle, head) {
    const index = cycle.indexOf(head);
    if (index === -1) {
        throw new Error(`Head ${head} is not in the cycle.`);
    }
    return cycle[(index + 1) % cycle.length];
}
const ALTERNATE_RECT_4X4_CYCLE = [
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
class InjectedRectangleFlipRepairer extends cycle_repairer_1.RectangleFlipCycleRepairer {
    injectedCandidates;
    constructor(injectedCandidates, options = {}) {
        super(options);
        this.injectedCandidates = injectedCandidates;
    }
    generateCandidateCycles() {
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
(0, testkit_1.describe)('Cycle repairer', () => {
    (0, testkit_1.it)('core helper does nothing for non-certified strategies', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const nextState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'greedy',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[1]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[3],
            applesEaten: 1
        });
        const repairer = {
            proposeCycle() {
                throw new Error('repairer should not be called');
            }
        };
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState: (0, helpers_1.makeGameState)({
                map,
                mode: 'ai',
                aiStrategy: 'greedy',
                lockedHamiltonianCycle: [...map.hamiltonianCycle],
                snake: {
                    segments: [map.hamiltonianCycle[0]],
                    direction: 'right',
                    pendingGrowth: 0
                },
                appleNodeId: map.hamiltonianCycle[1],
                applesEaten: 0
            }),
            nextState,
            strategy: 'greedy',
            cycleRepairer: repairer
        });
        strict_1.default.equal(repaired, nextState);
    });
    (0, testkit_1.it)('NullCycleRepairer keeps the old cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: new cycle_repairer_1.NullCycleRepairer()
        });
        strict_1.default.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
    });
    (0, testkit_1.it)('core helper does nothing when applesEaten did not increase', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const calls = [];
        const repairer = {
            proposeCycle() {
                calls.push(1);
                return null;
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[5]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        strict_1.default.equal(calls.length, 0);
        strict_1.default.equal(repaired, movedState);
    });
    (0, testkit_1.it)('core helper calls repairer after apple eaten in certified mode', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const calls = [];
        const repairer = {
            proposeCycle() {
                calls.push(1);
                return null;
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        strict_1.default.equal(calls.length, 1);
    });
    (0, testkit_1.it)('invalid proposed cycle is rejected', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const repairer = {
            proposeCycle() {
                return [...oldCycle.slice(0, -1)];
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        strict_1.default.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
    });
    (0, testkit_1.it)('candidate repair cycle is rejected if AppleForward fails', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const candidate = [...oldCycle].reverse();
        const repairer = {
            proposeCycle() {
                return candidate;
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        strict_1.default.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
    });
    (0, testkit_1.it)('valid candidate repair cycle is accepted if validateHamiltonianCycle, bodyContiguous, and AppleForward all pass', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const candidate = [...oldCycle.slice(5), ...oldCycle.slice(0, 5)];
        const repairer = {
            proposeCycle() {
                return candidate;
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        strict_1.default.deepEqual(repaired.lockedHamiltonianCycle, candidate);
    });
    (0, testkit_1.it)('after accepting a valid proposed cycle, certified-hamiltonian follows next_on_cycle on the new cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const candidate = [...oldCycle.slice(5), ...oldCycle.slice(0, 5)];
        const repairer = {
            proposeCycle() {
                return candidate;
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        const expectedNextHead = nextOnCycle(candidate, repaired.snake.segments[0]);
        const nextDecision = (0, ai_controller_1.decideAiMove)(repaired, 'certified-hamiltonian');
        const afterNextMove = (0, game_engine_1.advanceGame)(repaired, nextDecision.direction, 0, { next: () => 0 });
        strict_1.default.equal(afterNextMove.snake.segments[0], expectedNextHead);
    });
    (0, testkit_1.it)('between apple events, movement remains exactly next_on_cycle of the currently locked cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const candidate = [...oldCycle.slice(5), ...oldCycle.slice(0, 5)];
        const calls = [];
        const repairer = {
            proposeCycle() {
                calls.push(1);
                return candidate;
            }
        };
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const movedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        let state = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState: movedState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        state = {
            ...state,
            appleNodeId: candidate[(candidate.indexOf(state.snake.segments[0]) + 5) % candidate.length]
        };
        for (let step = 0; step < 3; step += 1) {
            const activeCycle = state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
            const expectedNextHead = nextOnCycle(activeCycle, state.snake.segments[0]);
            const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
            const advanced = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
            state = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
                previousState: state,
                nextState: advanced,
                strategy: 'certified-hamiltonian',
                cycleRepairer: repairer
            });
            strict_1.default.equal(state.snake.segments[0], expectedNextHead);
        }
        strict_1.default.equal(calls.length, 1);
    });
    (0, testkit_1.it)('RectangleFlipCycleRepairer returns null if no valid flip exists', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const repairer = new cycle_repairer_1.RectangleFlipCycleRepairer({ maxFlipsChecked: 12, searchNeighborhood: null });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const candidate = repairer.proposeCycle(state, map.hamiltonianCycle);
        strict_1.default.equal(candidate, null);
        strict_1.default.deepEqual(repairer.lastDiagnostics, {
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
        });
    });
    (0, testkit_1.it)('invalid flip candidates are rejected', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const repairer = new InjectedRectangleFlipRepairer([[...map.hamiltonianCycle.slice(0, -1)]]);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        strict_1.default.equal(repairer.proposeCycle(state, map.hamiltonianCycle), null);
        strict_1.default.equal(repairer.lastDiagnostics.graphInvalidCandidates, 1);
        strict_1.default.equal(repairer.lastDiagnostics.acceptedCandidates, 0);
    });
    (0, testkit_1.it)('a valid flip candidate can be accepted', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const repairer = new InjectedRectangleFlipRepairer([ALTERNATE_RECT_4X4_CYCLE]);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const candidate = repairer.proposeCycle(state, map.hamiltonianCycle);
        strict_1.default.deepEqual(candidate, ALTERNATE_RECT_4X4_CYCLE);
    });
    (0, testkit_1.it)('accepted candidate passes validateHamiltonianCycle, bodyContiguous, and appleForward', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(state.snake.segments, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(state.snake.segments, state.appleNodeId, ALTERNATE_RECT_4X4_CYCLE), true);
    });
    (0, testkit_1.it)('a valid non-improving flip is not accepted unless config allows non-improving repairs', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const nonImprovingCandidate = [...map.hamiltonianCycle.slice(5), ...map.hamiltonianCycle.slice(0, 5)];
        const strictRepairer = new InjectedRectangleFlipRepairer([nonImprovingCandidate]);
        const permissiveRepairer = new InjectedRectangleFlipRepairer([nonImprovingCandidate], {
            allowNonImprovingRepairs: true
        });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        strict_1.default.equal(strictRepairer.proposeCycle(state, map.hamiltonianCycle), null);
        strict_1.default.equal(strictRepairer.lastDiagnostics.nonImprovingCandidates, 1);
        strict_1.default.equal(strictRepairer.lastDiagnostics.acceptedCandidates, 0);
        strict_1.default.deepEqual(permissiveRepairer.proposeCycle(state, map.hamiltonianCycle), nonImprovingCandidate);
        strict_1.default.equal(permissiveRepairer.lastDiagnostics.acceptedCandidates, 1);
    });
    (0, testkit_1.it)('search budget is respected', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const repairer = new cycle_repairer_1.RectangleFlipCycleRepairer({ maxFlipsChecked: 0, searchNeighborhood: null });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        strict_1.default.equal(repairer.proposeCycle(state, map.hamiltonianCycle), null);
        strict_1.default.equal(repairer.lastSearchStats.candidatesChecked, 0);
        strict_1.default.equal(repairer.lastDiagnostics.budgetExhausted, true);
    });
    (0, testkit_1.it)('certified-hamiltonian still follows exactly next_on_cycle of the locked cycle after a repair', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const repairer = new InjectedRectangleFlipRepairer([ALTERNATE_RECT_4X4_CYCLE]);
        const oldCycle = [...map.hamiltonianCycle];
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const nextState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[1]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[9],
            applesEaten: 1
        });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: repairer
        });
        const decision = (0, ai_controller_1.decideAiMove)(repaired, 'certified-hamiltonian');
        const afterMove = (0, game_engine_1.advanceGame)(repaired, decision.direction, 0, { next: () => 0 });
        strict_1.default.deepEqual(repaired.lockedHamiltonianCycle, ALTERNATE_RECT_4X4_CYCLE);
        strict_1.default.equal(afterMove.snake.segments[0], nextOnCycle(ALTERNATE_RECT_4X4_CYCLE, repaired.snake.segments[0]));
    });
    (0, testkit_1.it)('if the repairer returns null, the old cycle is kept', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const oldCycle = [...map.hamiltonianCycle];
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[1]
        });
        const nextState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: oldCycle,
            snake: {
                segments: [oldCycle[1]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: oldCycle[9],
            applesEaten: 1
        });
        const repaired = (0, cycle_repairer_1.applyCertifiedHamiltonianPostStepRepair)({
            previousState,
            nextState,
            strategy: 'certified-hamiltonian',
            cycleRepairer: new cycle_repairer_1.RectangleFlipCycleRepairer({ maxFlipsChecked: 12, searchNeighborhood: null })
        });
        strict_1.default.deepEqual(repaired.lockedHamiltonianCycle, oldCycle);
    });
});
