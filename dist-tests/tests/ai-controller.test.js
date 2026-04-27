"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const game_engine_1 = require("../src/core/game-engine");
const ai_controller_1 = require("../src/core/ai-controller");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const coords_1 = require("../src/core/coords");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
function nextOnCycle(map, head) {
    const index = map.hamiltonianCycle.indexOf(head);
    if (index === -1) {
        throw new Error(`Head ${head} is not in the Hamiltonian cycle.`);
    }
    return map.hamiltonianCycle[(index + 1) % map.hamiltonianCycle.length];
}
(0, testkit_1.describe)('AI controller', () => {
    (0, testkit_1.it)('avoids an immediately fatal move when a safe move exists', () => {
        const map = (0, helpers_1.makeSavedMap)((0, helpers_1.makeDraft)({
            width: 4,
            height: 4,
            walls: [{ x: 2, y: 1 }],
            snakeSpawn: { x: 1, y: 1 }
        }));
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'greedy',
            snake: {
                segments: [
                    (0, coords_1.nodeIdForCoord)({ x: 1, y: 1 }),
                    (0, coords_1.nodeIdForCoord)({ x: 1, y: 2 }),
                    (0, coords_1.nodeIdForCoord)({ x: 0, y: 2 })
                ],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: (0, coords_1.nodeIdForCoord)({ x: 3, y: 1 })
        });
        const decision = (0, ai_controller_1.decideAiMove)(state, 'greedy');
        strict_1.default.notEqual(decision, null);
        strict_1.default.notEqual(decision?.direction, 'right');
        strict_1.default.equal(['up', 'left'].includes(decision?.direction ?? ''), true);
    });
    (0, testkit_1.it)('certified-hamiltonian always chooses the direction whose destination is next_on_cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const head = map.hamiltonianCycle[0];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [head],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[10]
        });
        const successor = nextOnCycle(map, head);
        const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        const nextState = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        strict_1.default.notEqual(decision, null);
        strict_1.default.equal(decision?.strategyUsed, 'certified-hamiltonian');
        strict_1.default.equal(nextState.snake.segments[0], successor);
    });
    (0, testkit_1.it)('certified-hamiltonian keeps choosing next_on_cycle for several consecutive states', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        let state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[12]
        });
        for (let step = 0; step < 6; step += 1) {
            const head = state.snake.segments[0];
            const successor = nextOnCycle(map, head);
            const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
            state = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
            strict_1.default.equal(state.snake.segments[0], successor);
        }
    });
    (0, testkit_1.it)('certified-hamiltonian ignores tempting safe non-cycle moves and still chooses next_on_cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const head = map.hamiltonianCycle[0];
        const temptingApple = (0, coords_1.nodeIdForCoord)({ x: 0, y: 1 });
        const state = (0, helpers_1.makeGameState)({
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
        const alternativeMoves = (0, game_engine_1.listPotentialMoves)(state).filter((move) => move.to !== successor);
        const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        const nextState = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        strict_1.default.equal(alternativeMoves.length > 0, true);
        strict_1.default.equal(alternativeMoves.some((move) => move.to === temptingApple), true);
        strict_1.default.equal(nextState.snake.segments[0], successor);
        strict_1.default.notEqual(nextState.snake.segments[0], temptingApple);
    });
    (0, testkit_1.it)('certified-hamiltonian uses validLockedCertificate before moving', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const bodySegments = [map.hamiltonianCycle[4], map.hamiltonianCycle[3], map.hamiltonianCycle[2]];
        const head = bodySegments[0];
        const successor = nextOnCycle(map, head);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: bodySegments,
                direction: 'down',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[12]
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(bodySegments, map.hamiltonianCycle), true);
        const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        const nextState = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        strict_1.default.equal(nextState.snake.segments[0], successor);
    });
    (0, testkit_1.it)('certified-hamiltonian throws when bodyContiguous is true but validLockedCertificate is false', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const wrongOrientationBody = [map.hamiltonianCycle[4], map.hamiltonianCycle[2], map.hamiltonianCycle[3]];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: wrongOrientationBody,
                direction: 'down',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[12]
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(wrongOrientationBody, map.hamiltonianCycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(wrongOrientationBody, map.hamiltonianCycle), false);
        strict_1.default.throws(() => (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian'), /Certified Hamiltonian AI invariant failed: snake body does not satisfy the locked Hamiltonian certificate\./);
    });
    (0, testkit_1.it)('certified-hamiltonian fails loudly if the cycle is missing the head node', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const head = map.hamiltonianCycle[0];
        const corruptedMap = {
            ...map,
            hamiltonianCycle: map.hamiltonianCycle.filter((nodeId) => nodeId !== head)
        };
        const state = (0, helpers_1.makeGameState)({
            map: corruptedMap,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [head],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[8]
        });
        strict_1.default.throws(() => (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian'), /Certified Hamiltonian AI invariant failed: locked cycle is not graph-valid\./);
    });
    (0, testkit_1.it)('certified-hamiltonian fails loudly if the cycle successor is not a legal outgoing edge', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const head = map.hamiltonianCycle[0];
        const invalidSuccessor = map.hamiltonianCycle[5];
        const corruptedMap = {
            ...map,
            hamiltonianCycle: [
                head,
                invalidSuccessor,
                ...map.hamiltonianCycle.filter((nodeId) => nodeId !== head && nodeId !== invalidSuccessor)
            ]
        };
        const state = (0, helpers_1.makeGameState)({
            map: corruptedMap,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [head],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[8]
        });
        strict_1.default.throws(() => (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian'), /Certified Hamiltonian AI invariant failed: locked cycle is not graph-valid\./);
    });
    (0, testkit_1.it)('casual hamiltonian mode keeps its fallback behavior when the cycle invariant fails', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const head = map.hamiltonianCycle[0];
        const invalidSuccessor = map.hamiltonianCycle[5];
        const corruptedMap = {
            ...map,
            hamiltonianCycle: [
                head,
                invalidSuccessor,
                ...map.hamiltonianCycle.filter((nodeId) => nodeId !== head && nodeId !== invalidSuccessor)
            ]
        };
        const state = (0, helpers_1.makeGameState)({
            map: corruptedMap,
            mode: 'ai',
            aiStrategy: 'hamiltonian',
            snake: {
                segments: [head],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[8]
        });
        const decision = (0, ai_controller_1.decideAiMove)(state, 'hamiltonian');
        strict_1.default.notEqual(decision, null);
        strict_1.default.equal(decision?.strategyUsed, 'greedy');
    });
    (0, testkit_1.it)('after one certified locked-cycle move, validLockedCertificate remains true', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: [map.hamiltonianCycle[6], map.hamiltonianCycle[5], map.hamiltonianCycle[4]],
                direction: 'down',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[12]
        });
        const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        const nextState = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(nextState.snake.segments, map.hamiltonianCycle), true);
    });
});
