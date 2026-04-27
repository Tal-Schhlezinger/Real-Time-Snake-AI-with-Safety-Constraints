"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const late_game_free_space_path_solver_1 = require("../src/core/late-game-free-space-path-solver");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function makeLateGameSolvableState() {
    const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const body = map.hamiltonianCycle.slice(0, 12).reverse();
    return (0, helpers_1.makeGameState)({
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
        appleNodeId: map.hamiltonianCycle[12]
    });
}
(0, testkit_1.describe)('Late-game free-space path solver', () => {
    (0, testkit_1.it)('known small solvable state succeeds', () => {
        const state = makeLateGameSolvableState();
        const result = (0, late_game_free_space_path_solver_1.solveLateGameFreeSpacePath)(state, { freeCountThreshold: 4 });
        strict_1.default.equal(result.success, true);
        strict_1.default.equal(result.freeCount, 4);
        strict_1.default.deepEqual(result.foundPath, [
            state.map.hamiltonianCycle[11],
            state.map.hamiltonianCycle[12],
            state.map.hamiltonianCycle[13],
            state.map.hamiltonianCycle[14],
            state.map.hamiltonianCycle[15],
            state.map.hamiltonianCycle[0]
        ]);
        strict_1.default.equal(result.appleIndexOnFoundPath, 1);
    });
    (0, testkit_1.it)('disconnected free region fails', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
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
        const result = (0, late_game_free_space_path_solver_1.solveLateGameFreeSpacePath)(state);
        strict_1.default.equal(result.success, false);
        strict_1.default.equal(result.searchAttempted, true);
        strict_1.default.equal(result.failureReason, 'disconnected-free-space');
    });
    (0, testkit_1.it)('budget exhaustion is reported', () => {
        const state = makeLateGameSolvableState();
        const result = new late_game_free_space_path_solver_1.LateGameFreeSpacePathSolver({
            freeCountThreshold: 4,
            maxExpansions: 0
        }).solve(state);
        strict_1.default.equal(result.success, false);
        strict_1.default.equal(result.searchAttempted, true);
        strict_1.default.equal(result.budgetExhausted, true);
        strict_1.default.equal(result.failureReason, 'budget-exhausted');
    });
    (0, testkit_1.it)('resulting cycle validates when successful', () => {
        const state = makeLateGameSolvableState();
        const result = (0, late_game_free_space_path_solver_1.solveLateGameFreeSpacePath)(state, { freeCountThreshold: 4 });
        strict_1.default.ok(result.cycle);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(state.map.graph, result.cycle), true);
        strict_1.default.deepEqual(result.resultingCycleValidity, {
            graphValid: true,
            lockedCertificateValid: true,
            appleForwardValid: true
        });
    });
    (0, testkit_1.it)('diagnostics do not change gameplay behavior', () => {
        const state = makeLateGameSolvableState();
        const before = clone(state);
        const decisionBefore = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        (0, late_game_free_space_path_solver_1.solveLateGameFreeSpacePath)(state, { freeCountThreshold: 4 });
        strict_1.default.deepEqual(state, before);
        strict_1.default.deepEqual((0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian'), decisionBefore);
    });
});
