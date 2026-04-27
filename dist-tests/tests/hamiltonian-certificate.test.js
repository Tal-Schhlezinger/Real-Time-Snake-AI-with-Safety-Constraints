"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const game_engine_1 = require("../src/core/game-engine");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
(0, testkit_1.describe)('Hamiltonian certificate', () => {
    const cycle = ['a', 'b', 'c', 'd', 'e', 'f'];
    (0, testkit_1.it)('returns true for a body occupying consecutive cycle indices', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['c', 'b', 'd'], cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.BodyContiguous)(['c', 'b', 'd'], cycle), true);
    });
    (0, testkit_1.it)('returns true for a wraparound interval', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['a', 'f', 'e'], cycle), true);
    });
    (0, testkit_1.it)('returns false when there is a gap inside the occupied interval', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['b', 'd', 'e'], cycle), false);
    });
    (0, testkit_1.it)('returns false when the body is split into separated intervals', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['a', 'b', 'e'], cycle), false);
    });
    (0, testkit_1.it)('returns false when a body cell is not in the Hamiltonian cycle', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['a', 'x'], cycle), false);
    });
    (0, testkit_1.it)('returns false when the body contains a duplicate cell', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['a', 'a'], cycle), false);
    });
    (0, testkit_1.it)('returns true for a single-cell body', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['d'], cycle), true);
    });
    (0, testkit_1.it)('treats a full-board body as contiguous for the current full-board game rule', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['d', 'a', 'c', 'b', 'f', 'e'], cycle), true);
    });
    (0, testkit_1.it)('validLockedCertificate passes for a correct oriented interval tail -> ... -> head', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['d', 'c', 'b'], cycle), true);
    });
    (0, testkit_1.it)('bodyContiguous true but head in the middle fails validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['c', 'd', 'b'], cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['c', 'd', 'b'], cycle), false);
    });
    (0, testkit_1.it)('bodyContiguous true but reversed head/tail orientation fails validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['b', 'c', 'd'], cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['b', 'c', 'd'], cycle), false);
    });
    (0, testkit_1.it)('bodyContiguous true with correct endpoints but scrambled physical body order fails validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['d', 'b', 'c', 'a'], cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.distanceForwardOnCycle)('a', 'd', cycle), 3);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['d', 'b', 'c', 'a'], cycle), false);
    });
    (0, testkit_1.it)('split body intervals fail validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['e', 'd', 'b'], cycle), false);
    });
    (0, testkit_1.it)('duplicate body cells fail validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['d', 'c', 'c'], cycle), false);
    });
    (0, testkit_1.it)('missing cycle cells fail validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['d', 'x', 'b'], cycle), false);
    });
    (0, testkit_1.it)('single-cell bodies pass validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['d'], cycle), true);
    });
    (0, testkit_1.it)('next_on_cycle(head) occupied fails validLockedCertificate outside the full-board edge case', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(['b', 'a', 'c'], cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['b', 'a', 'c'], cycle), false);
    });
    (0, testkit_1.it)('full-board oriented bodies are allowed by validLockedCertificate', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(['e', 'd', 'c', 'b', 'a', 'f'], cycle), true);
    });
    (0, testkit_1.it)('returns true when the apple is ahead of the head on the free arc', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(['e', 'd', 'c'], 'a', cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.AppleForward)(['e', 'd', 'c'], 'a', cycle), true);
    });
    (0, testkit_1.it)('returns false when the apple lies beyond the occupied tail boundary', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(['d', 'c', 'e'], 'a', cycle), false);
    });
    (0, testkit_1.it)('returns false when the apple is on the body', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(['b', 'a'], 'a', cycle), false);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(['b', 'a'], 'b', cycle), false);
    });
    (0, testkit_1.it)('handles wraparound forward arcs', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(['f', 'e', 'd'], 'b', cycle), true);
    });
    (0, testkit_1.it)('returns false when the apple is missing', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(['c', 'b'], null, cycle), false);
    });
    (0, testkit_1.it)('distanceForwardOnCycle handles normal and wraparound cases', () => {
        strict_1.default.equal((0, hamiltonian_certificate_1.distanceForwardOnCycle)('b', 'e', cycle), 3);
        strict_1.default.equal((0, hamiltonian_certificate_1.distanceForwardOnCycle)('e', 'b', cycle), 3);
        strict_1.default.equal((0, hamiltonian_certificate_1.distanceForwardOnCycle)('f', 'b', cycle), 2);
        strict_1.default.equal((0, hamiltonian_certificate_1.distanceForwardOnCycle)('c', 'c', cycle), 0);
        strict_1.default.equal((0, hamiltonian_certificate_1.distanceForwardOnCycle)('c', 'x', cycle), null);
    });
    (0, testkit_1.it)('getCertifiedHamiltonianDebugInfo returns correct indices and counters', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[4], map.hamiltonianCycle[2], map.hamiltonianCycle[3]],
                direction: 'down',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9],
            stepsSinceLastApple: 2
        });
        const info = (0, hamiltonian_certificate_1.getCertifiedHamiltonianDebugInfo)(state);
        strict_1.default.equal(info.headIndex, 4);
        strict_1.default.equal(info.tailIndex, 3);
        strict_1.default.equal(info.appleIndex, 9);
        strict_1.default.equal(info.distanceHeadToApple, 5);
        strict_1.default.equal(info.snakeLength, 3);
        strict_1.default.equal(info.playableCellCount, map.graph.nodes.length);
        strict_1.default.equal(info.stepsSinceLastApple, 2);
        strict_1.default.equal((0, hamiltonian_certificate_1.cycleIndexOf)(map.hamiltonianCycle[4], map.hamiltonianCycle), 4);
    });
    (0, testkit_1.it)('in a deterministic certified-hamiltonian simulation, distanceHeadToApple decreases by 1 each move until apple is eaten', () => {
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
            appleNodeId: map.hamiltonianCycle[5],
            stepsSinceLastApple: 0
        });
        while (state.applesEaten === 0) {
            const before = (0, hamiltonian_certificate_1.getCertifiedHamiltonianDebugInfo)(state);
            const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
            const nextState = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
            if (nextState.applesEaten === state.applesEaten) {
                const after = (0, hamiltonian_certificate_1.getCertifiedHamiltonianDebugInfo)(nextState);
                strict_1.default.equal(after.distanceHeadToApple, (before.distanceHeadToApple ?? 0) - 1);
                strict_1.default.equal(after.stepsSinceLastApple, before.stepsSinceLastApple + 1);
            }
            else {
                strict_1.default.equal(nextState.applesEaten, state.applesEaten + 1);
                strict_1.default.equal(nextState.stepsSinceLastApple, 0);
            }
            state = nextState;
        }
    });
    (0, testkit_1.it)('in a deterministic certified-hamiltonian simulation, the apple is eventually eaten', () => {
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
            appleNodeId: map.hamiltonianCycle[6],
            stepsSinceLastApple: 0
        });
        const initialDistance = (0, hamiltonian_certificate_1.getCertifiedHamiltonianDebugInfo)(state).distanceHeadToApple;
        let steps = 0;
        while (state.applesEaten === 0 && steps <= map.graph.nodes.length) {
            const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
            state = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
            steps += 1;
        }
        strict_1.default.equal(state.applesEaten, 1);
        strict_1.default.equal(steps, initialDistance);
    });
    (0, testkit_1.it)('no non-eating loop occurs under locked-cycle following', () => {
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
            appleNodeId: map.hamiltonianCycle[7],
            stepsSinceLastApple: 0
        });
        const seen = new Set();
        while (state.applesEaten === 0) {
            const info = (0, hamiltonian_certificate_1.getCertifiedHamiltonianDebugInfo)(state);
            const key = `${info.headIndex}:${info.distanceHeadToApple}:${info.stepsSinceLastApple}`;
            strict_1.default.equal(seen.has(key), false);
            seen.add(key);
            const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
            state = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        }
        strict_1.default.equal(state.applesEaten, 1);
    });
});
