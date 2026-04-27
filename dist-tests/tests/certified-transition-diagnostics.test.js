"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const certified_cycle_controller_1 = require("../src/core/certified-cycle-controller");
const certified_transition_diagnostics_1 = require("../src/core/certified-transition-diagnostics");
const cycle_library_1 = require("../src/core/cycle-library");
const game_engine_1 = require("../src/core/game-engine");
const game_state_1 = require("../src/core/game-state");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function makeEntry(id, cycle, source = 'solver') {
    return {
        id,
        cycle,
        source,
        archetypeName: source === 'base' ? 'base' : 'test-target',
        minDistanceToAccepted: source === 'base' ? 0 : 1,
        minOrderDistanceToAccepted: source === 'base' ? 0 : 1
    };
}
function makeLibrary(mapId, entries) {
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
function stepUntilApple(state, library) {
    let current = state;
    const targetApples = current.applesEaten + 1;
    for (let step = 0; step < current.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
        const decision = (0, ai_controller_1.decideAiMove)(current, 'certified-hamiltonian');
        if (!decision) {
            return current;
        }
        const advanced = (0, game_engine_1.advanceGame)(current, decision.direction, 0, { next: () => 0 });
        current = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
(0, testkit_1.describe)('Certified transition diagnostics', () => {
    (0, testkit_1.it)('diagnostics do not change gameplay behavior', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map);
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const before = clone(state);
        const decisionBefore = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library);
        strict_1.default.deepEqual(state, before);
        strict_1.default.deepEqual((0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian'), decisionBefore);
    });
    (0, testkit_1.it)('at snake length 1 and 2, the current locked cycle has a successful transition path', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map);
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const afterFirstApple = stepUntilApple(initial, library);
        for (const state of [initial, afterFirstApple]) {
            const diagnostics = (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library);
            const currentTarget = diagnostics.targets.find((target) => target.isCurrentLockedCycle);
            strict_1.default.ok(currentTarget);
            strict_1.default.equal(currentTarget.successfulTransitionPaths > 0, true);
        }
    });
    (0, testkit_1.it)('controlled one-step apple path can certify a target cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const library = makeLibrary(map.id, [makeEntry('rect:base', map.hamiltonianCycle, 'base')]);
        const diagnostics = (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library, {
            maxPathLength: 1,
            maxPaths: 8,
            slack: 0
        });
        const target = diagnostics.targets[0];
        strict_1.default.ok(target);
        strict_1.default.equal(target.successfulTransitionPaths > 0, true);
        strict_1.default.equal(target.bestSuccessfulPathLength, 1);
        strict_1.default.deepEqual(target.bestSuccessfulPath, ['right']);
    });
    (0, testkit_1.it)('path reaches apple but post-apple validLockedCertificate failure is reported', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const reversed = [map.hamiltonianCycle[0], ...map.hamiltonianCycle.slice(1).reverse()];
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const library = makeLibrary(map.id, [makeEntry('rect:reversed', reversed)]);
        const diagnostics = (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library, {
            maxPathLength: 1,
            maxPaths: 8,
            slack: 0
        });
        const target = diagnostics.targets[0];
        strict_1.default.ok(target);
        strict_1.default.equal(target.safePathsToApple > 0, true);
        strict_1.default.equal(target.successfulTransitionPaths, 0);
        strict_1.default.equal(target.failureReasons.postAppleLockedCertificateFailed > 0, true);
        strict_1.default.equal(target.lockedCertificateFailures.length > 0, true);
    });
    (0, testkit_1.it)('collision-before-apple paths are rejected', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
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
        const paths = (0, certified_transition_diagnostics_1.generateCandidatePathsToApple)(state, { maxPaths: 8, slack: 2 });
        const diagnostics = (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library, { maxPaths: 8, slack: 2 });
        strict_1.default.equal(paths.paths.length > 0, true);
        strict_1.default.equal(diagnostics.targets[0].failureReasons.collisionBeforeApple > 0, true);
    });
    (0, testkit_1.it)('diagnostics are deterministic for fixed options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 6, height: 6 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 8 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const left = (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library, { maxPaths: 16, slack: 4 });
        const right = (0, certified_transition_diagnostics_1.analyzeCertifiedTransitionTargets)(state, library, { maxPaths: 16, slack: 4 });
        strict_1.default.deepEqual(left, right);
        strict_1.default.equal(left.bestTargetCycleId !== null, true);
        strict_1.default.equal((0, certified_cycle_controller_1.getCertifiedLockedCycle)(state).length, map.hamiltonianCycle.length);
    });
});
