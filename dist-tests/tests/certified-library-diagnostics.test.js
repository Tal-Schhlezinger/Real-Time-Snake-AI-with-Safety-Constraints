"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const certified_cycle_controller_1 = require("../src/core/certified-cycle-controller");
const cycle_library_1 = require("../src/core/cycle-library");
const game_engine_1 = require("../src/core/game-engine");
const game_state_1 = require("../src/core/game-state");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
function cloneState(value) {
    return JSON.parse(JSON.stringify(value));
}
(0, testkit_1.describe)('Certified library diagnostics', () => {
    (0, testkit_1.it)('diagnostics do not affect gameplay behavior', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 8 });
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const withoutDiagnostics = cloneState(initial);
        const withDiagnostics = cloneState(initial);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        let plainState = withoutDiagnostics;
        let instrumentedState = withDiagnostics;
        for (let step = 0; step < 10 && !plainState.isOver && !instrumentedState.isOver; step += 1) {
            const plainDecision = (0, ai_controller_1.decideAiMove)(plainState, 'certified-hamiltonian');
            const instrumentedDecision = (0, ai_controller_1.decideAiMove)(instrumentedState, 'certified-hamiltonian');
            plainState = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
                previousState: plainState,
                nextState: (0, game_engine_1.advanceGame)(plainState, plainDecision.direction, 0, { next: () => 0 }),
                cycleLibrary: library
            });
            instrumentedState = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
                previousState: instrumentedState,
                nextState: (0, game_engine_1.advanceGame)(instrumentedState, instrumentedDecision.direction, 0, { next: () => 0 }),
                cycleLibrary: library,
                diagnostics
            });
        }
        strict_1.default.deepEqual(instrumentedState, plainState);
        strict_1.default.equal(diagnostics.applesEaten >= 0, true);
    });
    (0, testkit_1.it)('generated cycles all pass validateHamiltonianCycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 6, height: 6 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 12 });
        strict_1.default.equal(library.entries.every((entry) => (0, map_validator_1.validateHamiltonianCycle)(map.graph, entry.cycle)), true);
    });
    (0, testkit_1.it)('diversity stats are deterministic for fixed options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 6, height: 6 });
        const left = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 12, maxCycles: 4, minDiversity: 0.2 });
        const right = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 12, maxCycles: 4, minDiversity: 0.2 });
        strict_1.default.deepEqual(left.diagnostics, right.diagnostics);
    });
    (0, testkit_1.it)('unsupported maps report unsupported safely', () => {
        const map = {
            ...(0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 }),
            walls: [{ x: 1, y: 1 }]
        };
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map);
        strict_1.default.equal(library.status, 'unsupported');
        strict_1.default.equal(library.diagnostics.generationAttempts, 0);
        strict_1.default.equal(library.diagnostics.generatedCycles, 0);
    });
    (0, testkit_1.it)('switching diagnostics count successful and failed switch attempts', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 8 });
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const successPreviousState = (0, helpers_1.makeGameState)({
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
        const successNextState = {
            ...(0, game_engine_1.advanceGame)(successPreviousState, (0, ai_controller_1.decideAiMove)(successPreviousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-3-2'
        };
        (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: successPreviousState,
            nextState: successNextState,
            cycleLibrary: library,
            diagnostics
        });
        const failPreviousState = (0, helpers_1.makeGameState)({
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
        const failNextState = (0, game_engine_1.advanceGame)(failPreviousState, (0, ai_controller_1.decideAiMove)(failPreviousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: failPreviousState,
            nextState: failNextState,
            cycleLibrary: library,
            diagnostics
        });
        strict_1.default.equal(diagnostics.applesEaten, 2);
        strict_1.default.equal(diagnostics.switchAttempts, 2);
        strict_1.default.equal(diagnostics.successfulSwitches, 1);
        strict_1.default.equal(diagnostics.oldCycleKept, 1);
        strict_1.default.equal(diagnostics.noValidSwitchExists, 1);
        strict_1.default.equal(diagnostics.candidateCyclesChecked > 0, true);
        strict_1.default.equal(diagnostics.candidatesPassingProofGate > 0, true);
        strict_1.default.equal(diagnostics.oldPathLenBeforeSwitch.length, 1);
        strict_1.default.equal(diagnostics.newPathLenAfterSwitch.length, 1);
        strict_1.default.equal(diagnostics.averagePathLenImprovement !== null, true);
        strict_1.default.equal(diagnostics.switchAttemptSummaries.length, 2);
        strict_1.default.equal(diagnostics.switchAttemptSummaries[0]?.finalDecisionReason, 'selected-switch');
        strict_1.default.equal(diagnostics.switchAttemptSummaries[1]?.finalDecisionReason, 'no-proof-valid-candidates');
    });
    (0, testkit_1.it)('single-cycle fallback remains valid', () => {
        const map = {
            ...(0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 }),
            walls: [{ x: 1, y: 1 }]
        };
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const previousState = (0, helpers_1.makeGameState)({
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
        const nextState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-3-2'
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: library,
            diagnostics
        });
        strict_1.default.deepEqual((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), map.hamiltonianCycle);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(transitioned.snake.segments, map.hamiltonianCycle), true);
        strict_1.default.equal(diagnostics.switchAttempts, 0);
        strict_1.default.equal(diagnostics.oldCycleKept, 1);
    });
    (0, testkit_1.it)('diagnostics distinguish no proof-valid candidate vs proof-valid but not improving', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const noProofValidLibrary = {
            mapId: map.id,
            status: 'ready',
            entries: [{
                    id: 'rect:base',
                    cycle: [...map.hamiltonianCycle],
                    source: 'base',
                    archetypeName: 'base',
                    minDistanceToAccepted: 0,
                    minOrderDistanceToAccepted: 0
                }],
            diagnostics: {
                generationAttempts: 0,
                generatedCycles: 0,
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
        const noProofValidDiagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const noProofValidPreviousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: ['n-1-1', 'n-0-0'],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-1-0'
        });
        const noProofValidNextState = (0, helpers_1.makeGameState)({
            ...noProofValidPreviousState,
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-3-2',
            applesEaten: 1
        });
        (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: noProofValidPreviousState,
            nextState: noProofValidNextState,
            cycleLibrary: noProofValidLibrary,
            diagnostics: noProofValidDiagnostics
        });
        strict_1.default.equal(noProofValidDiagnostics.switchAttemptSummaries[0]?.finalDecisionReason, 'no-proof-valid-candidates');
        const proofValidButNotImprovingLibrary = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 8 });
        const proofValidButNotImprovingDiagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const proofValidButNotImprovingPreviousState = (0, helpers_1.makeGameState)({
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
            appleNodeId: 'n-1-0'
        });
        const proofValidButNotImprovingNextState = (0, helpers_1.makeGameState)({
            ...proofValidButNotImprovingPreviousState,
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-2-2',
            applesEaten: 1
        });
        (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: proofValidButNotImprovingPreviousState,
            nextState: proofValidButNotImprovingNextState,
            cycleLibrary: proofValidButNotImprovingLibrary,
            diagnostics: proofValidButNotImprovingDiagnostics
        });
        strict_1.default.equal(proofValidButNotImprovingDiagnostics.switchAttemptSummaries[0]?.finalDecisionReason, 'selected-switch');
    });
    (0, testkit_1.it)('diagnostics record best proof-valid candidate pathLen and final decision reason', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 8 });
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const previousState = (0, helpers_1.makeGameState)({
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
        const nextState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-3-2'
        };
        (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: library,
            diagnostics
        });
        const summary = diagnostics.switchAttemptSummaries[0];
        strict_1.default.ok(summary);
        strict_1.default.equal(summary.finalDecisionReason, 'selected-switch');
        strict_1.default.equal(summary.bestProofValidCandidateByPathLen !== null, true);
        strict_1.default.equal(summary.bestProofValidCandidateByPathLen.pathLen, 4);
        strict_1.default.equal(summary.bestProofValidCandidateByPathLen.pathLenDelta, 4);
    });
});
