"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const certified_hamiltonian_error_1 = require("../src/core/certified-hamiltonian-error");
const certified_cycle_controller_1 = require("../src/core/certified-cycle-controller");
const cycle_library_1 = require("../src/core/cycle-library");
const game_engine_1 = require("../src/core/game-engine");
const game_state_1 = require("../src/core/game-state");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const patch_mutation_scenarios_1 = require("../src/core/patch-mutation-scenarios");
const map_validator_1 = require("../src/core/map-validator");
const helpers_1 = require("./helpers");
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
function makeEntry(id, cycle, source = 'solver') {
    return {
        id,
        cycle,
        source,
        archetypeName: source === 'base' ? 'base' : 'test-candidate',
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
function nextOnCycle(cycle, nodeId) {
    const index = cycle.indexOf(nodeId);
    strict_1.default.notEqual(index, -1);
    return cycle[(index + 1) % cycle.length];
}
function makePostApplePlanningPair(scenario) {
    return {
        previousState: {
            ...scenario.state,
            applesEaten: scenario.state.applesEaten - 1
        },
        nextState: scenario.state
    };
}
function getPatchScenario(map, scenarioId) {
    const scenario = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
        seedValues: [0, 0.23, 0.47, 0.71],
        midGameFillRatios: [],
        maxSimulationSteps: 100
    }).find((candidate) => candidate.scenarioId === scenarioId);
    strict_1.default.ok(scenario);
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
function createSeededRandom(seed) {
    let state = Math.max(1, Math.floor(seed)) % 2_147_483_647;
    return {
        next() {
            state = (state * 48_271) % 2_147_483_647;
            return state / 2_147_483_647;
        }
    };
}
function summarizeLockedProofState(state, cycle) {
    const head = state.snake.segments[0] ?? null;
    const tail = state.snake.segments[state.snake.segments.length - 1] ?? null;
    const headIndex = head ? (0, hamiltonian_certificate_1.cycleIndexOf)(head, cycle) : null;
    const nextOnLockedCycle = headIndex === null ? null : cycle[(headIndex + 1) % cycle.length] ?? null;
    return {
        applesEaten: state.applesEaten,
        certifiedMode: state.certifiedMode,
        lockedCycleId: state.lockedHamiltonianCycleId,
        head,
        tail,
        snakeLength: state.snake.segments.length,
        apple: state.appleNodeId,
        graphValid: (0, map_validator_1.validateHamiltonianCycle)(state.map.graph, cycle),
        lockedCertificateValid: (0, hamiltonian_certificate_1.validLockedCertificate)(state.snake.segments, cycle),
        lockedCertificateFailure: (0, hamiltonian_certificate_1.explainLockedCertificateFailure)(state.snake.segments, cycle),
        forwardDistanceTailToHead: head && tail ? (0, hamiltonian_certificate_1.distanceForwardOnCycle)(tail, head, cycle) : null,
        expectedForwardDistance: state.snake.segments.length - 1,
        nextOnLockedCycle,
        nextOnLockedCycleOccupied: nextOnLockedCycle ? state.snake.segments.includes(nextOnLockedCycle) : null
    };
}
(0, testkit_1.describe)('Certified cycle controller', () => {
    (0, testkit_1.it)('initial certified state starts on the base locked cycle and library phase', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian');
        strict_1.default.deepEqual(state.lockedHamiltonianCycle, map.hamiltonianCycle);
        strict_1.default.equal(state.lockedHamiltonianCycleId, 'rect:base');
        strict_1.default.equal(state.certifiedPhase, 'library');
        strict_1.default.equal(Object.prototype.hasOwnProperty.call(state, 'pendingCertifiedSwitch'), false);
    });
    (0, testkit_1.it)('a graph-invalid locked cycle fails immediately in certified initialization even when the body certificate would pass', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const corruptedMap = {
            ...map,
            hamiltonianCycle: [
                map.hamiltonianCycle[0],
                map.hamiltonianCycle[2],
                ...map.hamiltonianCycle.filter((nodeId) => nodeId !== map.hamiltonianCycle[0] && nodeId !== map.hamiltonianCycle[2])
            ]
        };
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)([corruptedMap.hamiltonianCycle[0]], corruptedMap.hamiltonianCycle), true);
        strict_1.default.throws(() => (0, game_state_1.createInitialGameState)(corruptedMap, 'ai', 'certified-hamiltonian'), /Certified Hamiltonian AI invariant failed: initial locked cycle does not form a valid Hamiltonian cycle for the current map graph\./);
    });
    (0, testkit_1.it)('CanSwitchAndLock accepts a valid candidate for the real current state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const candidate = makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-3-2'
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(state.snake.segments, candidate.cycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(state.snake.segments, state.appleNodeId, candidate.cycle), true);
        strict_1.default.equal((0, certified_cycle_controller_1.CanSwitchAndLock)(state, candidate), true);
    });
    (0, testkit_1.it)('CanSwitchAndLock rejects invalid cycles', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-3-2'
        });
        strict_1.default.equal((0, certified_cycle_controller_1.CanSwitchAndLock)(state, makeEntry('rect:generated:bad', [...ALTERNATE_RECT_4X4_CYCLE.slice(0, -1)])), false);
    });
    (0, testkit_1.it)('a cycle-library candidate with bodyContiguous true but wrong orientation is rejected', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const wrongOrientationBody = [map.hamiltonianCycle[3], map.hamiltonianCycle[5], map.hamiltonianCycle[4]];
        const state = (0, helpers_1.makeGameState)({
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
            appleNodeId: map.hamiltonianCycle[10]
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(wrongOrientationBody, map.hamiltonianCycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(wrongOrientationBody, map.hamiltonianCycle), false);
        strict_1.default.equal((0, certified_cycle_controller_1.CanSwitchAndLock)(state, makeEntry('rect:base', [...map.hamiltonianCycle], 'base')), false);
    });
    (0, testkit_1.it)('selectBestSwitchableCycle prefers the shorter current-apple path', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-3-2'
        });
        const selected = (0, certified_cycle_controller_1.selectBestSwitchableCycle)(state, makeLibrary(map.id, [
            makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
            makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
        ]));
        strict_1.default.equal(selected?.id, 'rect:generated:alt');
    });
    (0, testkit_1.it)('selection keeps the current cycle when no candidate improves the current apple path', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-2-2'
        });
        const selected = (0, certified_cycle_controller_1.selectBestSwitchableCycle)(state, makeLibrary(map.id, [
            makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
            makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
        ]));
        strict_1.default.equal(selected, null);
    });
    (0, testkit_1.it)('no pre-apple pending switch is staged or committed', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const cycleLibrary = makeLibrary(map.id, [
            makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
            makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
        ]);
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            lockedHamiltonianCycleId: 'rect:base',
            snake: {
                segments: [map.hamiltonianCycle[1], map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-3-2'
        });
        strict_1.default.equal((0, certified_cycle_controller_1.selectBestSwitchableCycle)(previousState, cycleLibrary)?.id, 'rect:generated:alt');
        const advancedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary
        });
        strict_1.default.equal(previousState.applesEaten, advancedState.applesEaten);
        strict_1.default.deepEqual((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), map.hamiltonianCycle);
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
        strict_1.default.equal(Object.prototype.hasOwnProperty.call(transitioned, 'pendingCertifiedSwitch'), false);
    });
    (0, testkit_1.it)('post-apple cycle selection uses the real nextState body, not a simulated pre-apple body', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const alternateEntry = makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE);
        const cycleLibrary = makeLibrary(map.id, [
            makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
            alternateEntry
        ]);
        const previousState = (0, helpers_1.makeGameState)({
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
        strict_1.default.equal((0, certified_cycle_controller_1.CanSwitchAndLock)(previousState, alternateEntry), true);
        const advancedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary
        });
        strict_1.default.equal(previousState.applesEaten + 1, advancedState.applesEaten);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(advancedState.snake.segments, ALTERNATE_RECT_4X4_CYCLE), false);
        strict_1.default.deepEqual((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), map.hamiltonianCycle);
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
    });
    (0, testkit_1.it)('after an apple event, a valid better candidate can be locked immediately', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const cycleLibrary = makeLibrary(map.id, [
            makeEntry('rect:base', [...map.hamiltonianCycle], 'base'),
            makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)
        ]);
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-3-2'
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(advancedState.snake.segments, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(advancedState.snake.segments, advancedState.appleNodeId, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.deepEqual((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), ALTERNATE_RECT_4X4_CYCLE);
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect:generated:alt');
    });
    (0, testkit_1.it)('if no valid candidate exists after apple, the old locked cycle is kept when still valid', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const previousState = (0, helpers_1.makeGameState)({
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
        const advancedState = (0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 });
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary: makeLibrary(map.id, [makeEntry('rect:generated:alt', ALTERNATE_RECT_4X4_CYCLE)])
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(advancedState.snake.segments, map.hamiltonianCycle), true);
        strict_1.default.deepEqual((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), map.hamiltonianCycle);
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
    });
    (0, testkit_1.it)('a graph-invalid locked cycle fails in ensureValidLockedCycleOrThrow during certified post-step validation', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const corruptedCycle = [
            map.hamiltonianCycle[0],
            map.hamiltonianCycle[2],
            ...map.hamiltonianCycle.filter((nodeId) => nodeId !== map.hamiltonianCycle[0] && nodeId !== map.hamiltonianCycle[2])
        ];
        const previousState = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...corruptedCycle],
            lockedHamiltonianCycleId: 'rect:corrupted',
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: 'n-3-2'
        });
        const nextState = (0, helpers_1.makeGameState)({
            ...previousState,
            elapsedMs: 1
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(nextState.snake.segments, corruptedCycle), true);
        strict_1.default.throws(() => (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, [])
        }), /Certified Hamiltonian AI invariant failed: locked cycle rect:corrupted does not form a valid Hamiltonian cycle for the current map graph\./);
    });
    (0, testkit_1.it)('locked cycle assignment cannot bypass graph and locked-certificate validation', () => {
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
            appleNodeId: map.hamiltonianCycle[12]
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(state.snake.segments, map.hamiltonianCycle), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(state.snake.segments, map.hamiltonianCycle), false);
        strict_1.default.throws(() => (0, certified_cycle_controller_1.setCertifiedLockedCycleOrThrow)(state, map.hamiltonianCycle, 'rect:base'), /Certified Hamiltonian AI invariant failed: locked cycle rect:base does not satisfy the locked Hamiltonian certificate for the current body\./);
    });
    (0, testkit_1.it)('if the old locked cycle is invalid after apple and no candidate exists, certified mode fails loudly', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const previousState = (0, helpers_1.makeGameState)({
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
        const nextState = (0, helpers_1.makeGameState)({
            ...previousState,
            snake: {
                segments: ['n-2-1', 'n-3-1'],
                direction: 'left',
                pendingGrowth: 0
            },
            appleNodeId: 'n-0-0',
            applesEaten: 1
        });
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(nextState.snake.segments, ALTERNATE_RECT_4X4_CYCLE), false);
        strict_1.default.throws(() => (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, [])
        }), certified_hamiltonian_error_1.CertifiedHamiltonianInvariantError);
    });
    (0, testkit_1.it)('keeps existing certified behavior when patch mutation is disabled', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]);
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-2-2'
        };
        const withoutPatch = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary: library
        });
        const withDisabledPatch = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary: library,
            options: { enablePatchMutation: false }
        });
        strict_1.default.deepEqual(withDisabledPatch, withoutPatch);
        strict_1.default.equal(withDisabledPatch.lockedHamiltonianCycleId, 'rect:base');
    });
    (0, testkit_1.it)('keeps old behavior when patch mutation is enabled but no candidate is available', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-2-2'
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState: advancedState,
            cycleLibrary: null,
            diagnostics,
            options: {
                enablePatchMutation: true,
                maxPatchRectsScanned: 0
            }
        });
        strict_1.default.deepEqual((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), map.hamiltonianCycle);
        strict_1.default.equal(transitioned.certifiedMode, 'locked');
        strict_1.default.equal(diagnostics.patchMutationAttempted, 1);
        strict_1.default.equal(diagnostics.patchGraphValidCandidates, 0);
        strict_1.default.equal(diagnostics.oldCycleKept, 1);
    });
    (0, testkit_1.it)('selects an immediate-locked patch mutation candidate when it improves pathLen', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-2-2'
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId?.startsWith('v1-patch:'), true);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned)), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(transitioned.snake.segments, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned)), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(transitioned.snake.segments, transitioned.appleNodeId, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned)), true);
        strict_1.default.equal(diagnostics.patchSelectedCandidates, 1);
        strict_1.default.equal(diagnostics.selectedCandidateSource, 'v1-patch');
        const decision = (0, ai_controller_1.decideAiMove)(transitioned, 'certified-hamiltonian');
        const expectedDestination = nextOnCycle((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), transitioned.snake.segments[0]);
        strict_1.default.equal(transitioned.map.graph.edges.some((edge) => edge.from === transitioned.snake.segments[0] &&
            edge.to === expectedDestination &&
            edge.direction === decision.direction), true);
    });
    (0, testkit_1.it)('rejects non-improving patch mutation candidates by default', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-2-0'
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect:base');
        strict_1.default.equal(diagnostics.patchSelectedCandidates, 0);
        strict_1.default.equal(diagnostics.patchRejectedNoImprovement > 0, true);
    });
    (0, testkit_1.it)('can select an immediate-locked improving patch candidate without starting transition search', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-2-2'
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId?.startsWith('v1-patch:'), true);
        strict_1.default.equal(diagnostics.patchTransitionSearchesStarted, 0);
        strict_1.default.equal(diagnostics.patchImmediateLockedSelectedWithoutTransition, 0);
        strict_1.default.equal(diagnostics.patchNonImmediateCandidates, 0);
    });
    (0, testkit_1.it)('limits non-immediate patch candidates to the configured top-K transition searches', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const midGameScenario = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
            seedValues: [],
            midGameFillRatios: [0.4],
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        }).find((scenario) => scenario.kind === 'mid-game');
        strict_1.default.ok(midGameScenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: {
                ...midGameScenario.state,
                applesEaten: midGameScenario.state.applesEaten
            },
            nextState: {
                ...midGameScenario.state,
                applesEaten: midGameScenario.state.applesEaten + 1,
                certifiedMode: 'locked',
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
        strict_1.default.equal(diagnostics.patchNonImmediateCandidates > 1, true);
        strict_1.default.equal(diagnostics.patchTransitionCandidatesAfterPrefilter <= 1, true);
        strict_1.default.equal(diagnostics.patchTransitionSearchesStarted <= 1, true);
        strict_1.default.equal(diagnostics.patchTransitionCandidatesSkippedByPrefilter > 0, true);
        strict_1.default.equal(transitioned.certifiedMode === 'transition' || transitioned.lockedHamiltonianCycleId === 'rect:base', true);
    });
    (0, testkit_1.it)('does not use candidates skipped by the transition prefilter', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const midGameScenario = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
            seedValues: [],
            midGameFillRatios: [0.4],
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        }).find((scenario) => scenario.kind === 'mid-game');
        strict_1.default.ok(midGameScenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: {
                ...midGameScenario.state,
                applesEaten: midGameScenario.state.applesEaten
            },
            nextState: {
                ...midGameScenario.state,
                applesEaten: midGameScenario.state.applesEaten + 1,
                certifiedMode: 'locked',
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
        strict_1.default.equal(diagnostics.patchTransitionSearchesStarted, 0);
        strict_1.default.equal(diagnostics.patchTransitionCandidatesSkippedByPrefilter > 0, true);
        strict_1.default.equal(diagnostics.patchSelectedCandidates, 0);
        strict_1.default.equal(transitioned.certifiedMode, 'locked');
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, midGameScenario.state.lockedHamiltonianCycleId);
    });
    (0, testkit_1.it)('stages and follows a certified transition-backed patch mutation plan when it improves pathLen', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const midGameScenario = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
            seedValues: [],
            midGameFillRatios: [0.4],
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        }).find((scenario) => scenario.kind === 'mid-game');
        strict_1.default.ok(midGameScenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const nextState = {
            ...midGameScenario.state,
            applesEaten: midGameScenario.state.applesEaten + 1,
            certifiedMode: 'locked',
            activeCertifiedTransitionPlan: null
        };
        const previousState = {
            ...midGameScenario.state,
            applesEaten: midGameScenario.state.applesEaten
        };
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
        strict_1.default.equal(transitioned.certifiedMode, 'transition');
        strict_1.default.ok(transitioned.activeCertifiedTransitionPlan);
        strict_1.default.equal(diagnostics.patchSelectedCandidates, 1);
        strict_1.default.equal(diagnostics.selectedCandidateSource, 'v1-patch');
        const firstDecision = (0, ai_controller_1.decideAiMove)(transitioned, 'certified-hamiltonian');
        strict_1.default.equal(firstDecision.direction, transitioned.activeCertifiedTransitionPlan.directions[0]);
        const afterOneStep = (0, game_engine_1.advanceGame)(transitioned, firstDecision.direction, 0, { next: () => 0 });
        const progressed = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState: transitioned,
            nextState: afterOneStep,
            cycleLibrary: null,
            options: { enablePatchMutation: true }
        });
        if (progressed.certifiedMode === 'transition') {
            strict_1.default.equal(progressed.activeCertifiedTransitionPlan?.nextDirectionIndex, 1);
        }
        else {
            strict_1.default.equal(progressed.lockedHamiltonianCycleId?.startsWith('v1-patch:'), true);
            strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(progressed.snake.segments, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(progressed)), true);
        }
    });
    (0, testkit_1.it)('with transition prefilter disabled, certified patch behavior matches the current behavior', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const midGameScenario = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
            seedValues: [],
            midGameFillRatios: [0.4],
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        }).find((scenario) => scenario.kind === 'mid-game');
        strict_1.default.ok(midGameScenario);
        const previousState = {
            ...midGameScenario.state,
            applesEaten: midGameScenario.state.applesEaten
        };
        const nextState = {
            ...midGameScenario.state,
            applesEaten: midGameScenario.state.applesEaten + 1,
            certifiedMode: 'locked',
            activeCertifiedTransitionPlan: null
        };
        const baseOptions = {
            enablePatchMutation: true,
            maxPatchWidth: 4,
            maxPatchHeight: 4,
            maxPatchArea: 16,
            patchRectangleSearchMode: 'broad',
            maxTransitionPathsPerCandidate: 64,
            maxTransitionSlack: 6
        };
        const omitted = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
            options: baseOptions
        });
        const explicitNone = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, [makeEntry('rect:base', [...map.hamiltonianCycle], 'base')]),
            options: {
                ...baseOptions,
                transitionPrefilterMode: 'none'
            }
        });
        strict_1.default.deepEqual(explicitNone.activeCertifiedTransitionPlan, omitted.activeCertifiedTransitionPlan);
        strict_1.default.equal(explicitNone.certifiedMode, omitted.certifiedMode);
        strict_1.default.deepEqual(explicitNone.lockedHamiltonianCycle, omitted.lockedHamiltonianCycle);
        strict_1.default.equal(explicitNone.lockedHamiltonianCycleId, omitted.lockedHamiltonianCycleId);
    });
    (0, testkit_1.it)('respects patch mutation budget limits', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
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
        const advancedState = {
            ...(0, game_engine_1.advanceGame)(previousState, (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian').direction, 0, { next: () => 0 }),
            appleNodeId: 'n-2-2'
        };
        (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
        strict_1.default.equal(diagnostics.patchGraphValidCandidates <= 1, true);
        strict_1.default.equal(diagnostics.patchRejectedBudget, 1);
    });
    (0, testkit_1.it)('regresses the reproduced 6x6 V1-only lock failure and keeps every locked post-step certificate valid', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-6x6', name: 'Eval 6x6', width: 6, height: 6 });
        const random = createSeededRandom(202);
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxCycles: 10, maxAttempts: 64, minDiversity: 0.2 });
        const libraryEntriesById = new Map(library.entries.map((entry) => [entry.id, entry]));
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const lockEvents = [];
        let state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0.37 });
        try {
            for (let step = 0; step < 220 && !state.isOver; step += 1) {
                const previousState = state;
                const previousCycle = (0, certified_cycle_controller_1.getCertifiedLockedCycle)(previousState);
                if (previousState.certifiedMode === 'transition') {
                    strict_1.default.ok(previousState.activeCertifiedTransitionPlan);
                    strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(previousState.map.graph, previousState.activeCertifiedTransitionPlan.targetCycle), true);
                }
                else {
                    strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(previousState.map.graph, previousCycle), true);
                    strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(previousState.snake.segments, previousCycle), true);
                    const libraryEntry = previousState.lockedHamiltonianCycleId
                        ? libraryEntriesById.get(previousState.lockedHamiltonianCycleId)
                        : null;
                    if (libraryEntry) {
                        strict_1.default.deepEqual(previousCycle, libraryEntry.cycle);
                    }
                }
                const decision = (0, ai_controller_1.decideAiMove)(previousState, 'certified-hamiltonian');
                strict_1.default.ok(decision);
                const advancedState = (0, game_engine_1.advanceGame)(previousState, decision.direction, 0, random);
                state = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
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
                if (previousState.lockedHamiltonianCycleId !== state.lockedHamiltonianCycleId ||
                    previousState.applesEaten !== state.applesEaten ||
                    previousState.certifiedMode !== state.certifiedMode) {
                    const lockedCycle = (0, certified_cycle_controller_1.getCertifiedLockedCycle)(state);
                    lockEvents.push({
                        step,
                        selectedCandidateSource: diagnostics.switchAttemptSummaries.at(-1)?.selectedCandidateSource ?? null,
                        previousLockedCycleId: previousState.lockedHamiltonianCycleId,
                        newLockedCycleId: state.lockedHamiltonianCycleId,
                        state: summarizeLockedProofState(state, lockedCycle)
                    });
                }
                if (!state.isOver && state.certifiedMode === 'locked') {
                    const lockedCycle = (0, certified_cycle_controller_1.getCertifiedLockedCycle)(state);
                    strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(state.map.graph, lockedCycle), true);
                    strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(state.snake.segments, lockedCycle), true);
                }
            }
        }
        catch (error) {
            strict_1.default.fail(JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                currentState: summarizeLockedProofState(state, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(state)),
                lockEvents
            }, null, 2));
        }
        strict_1.default.equal(diagnostics.v2PatchAttempted, 0);
        strict_1.default.equal(state.applesEaten >= 25, true);
    });
    (0, testkit_1.it)('keeps behavior unchanged when V2 patch mutation is disabled', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
        const scenario = getPatchScenario(map, 'rect-4:seed-0_23');
        const { previousState, nextState } = makePostApplePlanningPair(scenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, []),
            diagnostics,
            options: {
                enablePatchMutation: false,
                enableV2PatchMutation: false
            }
        });
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
        strict_1.default.equal(diagnostics.v2PatchAttempted, 0);
        strict_1.default.equal(diagnostics.v2SelectedCandidates, 0);
    });
    (0, testkit_1.it)('selects an immediate-locked V2 patch mutation candidate when it improves pathLen', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-6', name: 'Rect 6', width: 6, height: 6 });
        const scenario = getPatchScenario(map, 'rect-6:initial-far');
        const { previousState, nextState } = makePostApplePlanningPair(scenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, []),
            diagnostics,
            options: V2_TEST_OPTIONS
        });
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId?.startsWith('v2-patch:'), true);
        strict_1.default.equal(transitioned.certifiedMode, 'locked');
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned)), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.validLockedCertificate)(transitioned.snake.segments, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned)), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(transitioned.snake.segments, transitioned.appleNodeId, (0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned)), true);
        strict_1.default.equal(diagnostics.selectedCandidateSource, 'v2-patch');
        strict_1.default.equal(diagnostics.v2SelectedCandidates, 1);
        strict_1.default.equal(diagnostics.v2ImmediateLockedSelections, 1);
        const decision = (0, ai_controller_1.decideAiMove)(transitioned, 'certified-hamiltonian');
        const expectedDestination = nextOnCycle((0, certified_cycle_controller_1.getCertifiedLockedCycle)(transitioned), transitioned.snake.segments[0]);
        strict_1.default.equal(transitioned.map.graph.edges.some((edge) => edge.from === transitioned.snake.segments[0] &&
            edge.to === expectedDestination &&
            edge.direction === decision.direction), true);
    });
    (0, testkit_1.it)('stages a certified transition-backed V2 patch mutation plan when it improves pathLen', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
        const scenario = getPatchScenario(map, 'rect-4:manual-far');
        const { previousState, nextState } = makePostApplePlanningPair(scenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, []),
            diagnostics,
            options: V2_TEST_OPTIONS
        });
        strict_1.default.equal(transitioned.certifiedMode, 'transition');
        strict_1.default.equal(transitioned.activeCertifiedTransitionPlan?.source, 'v2-patch');
        strict_1.default.equal(transitioned.activeCertifiedTransitionPlan?.targetCycleId.startsWith('v2-patch:'), true);
        strict_1.default.equal(diagnostics.selectedCandidateSource, 'v2-patch');
        strict_1.default.equal(diagnostics.v2SelectedCandidates, 1);
        strict_1.default.equal(diagnostics.v2TransitionSelections, 1);
        const firstDecision = (0, ai_controller_1.decideAiMove)(transitioned, 'certified-hamiltonian');
        strict_1.default.equal(firstDecision.direction, transitioned.activeCertifiedTransitionPlan?.directions[0]);
    });
    (0, testkit_1.it)('rejects non-improving V2 patch mutation candidates by default', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
        const scenario = getPatchScenario(map, 'rect-4:initial-near');
        const { previousState, nextState } = makePostApplePlanningPair(scenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, []),
            diagnostics,
            options: V2_TEST_OPTIONS
        });
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
        strict_1.default.equal(diagnostics.v2PatchAttempted, 1);
        strict_1.default.equal(diagnostics.v2SnakeUsableCandidates > 0, true);
        strict_1.default.equal(diagnostics.v2ImprovingCandidates, 0);
        strict_1.default.equal(diagnostics.v2SelectedCandidates, 0);
        strict_1.default.equal(diagnostics.v2RejectedNoImprovement > 0, true);
    });
    (0, testkit_1.it)('skips V2 patch mutation above the configured fill-ratio threshold', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
        const scenario = getPatchScenario(map, 'rect-4:seed-0_23');
        const { previousState, nextState } = makePostApplePlanningPair(scenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, []),
            diagnostics,
            options: {
                ...V2_TEST_OPTIONS,
                maxV2FillRatio: 0.01
            }
        });
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
        strict_1.default.equal(diagnostics.v2PatchAttempted, 0);
        strict_1.default.equal(diagnostics.v2SelectedCandidates, 0);
    });
    (0, testkit_1.it)('respects V2 patch mutation candidate budget limits', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4', name: 'Rect 4', width: 4, height: 4 });
        const scenario = getPatchScenario(map, 'rect-4:seed-0_23');
        const { previousState, nextState } = makePostApplePlanningPair(scenario);
        const diagnostics = (0, certified_cycle_controller_1.createCertifiedRuntimeSwitchingDiagnostics)();
        const transitioned = (0, certified_cycle_controller_1.applyCertifiedPostAppleTransition)({
            previousState,
            nextState,
            cycleLibrary: makeLibrary(map.id, []),
            diagnostics,
            options: {
                ...V2_TEST_OPTIONS,
                maxV2Candidates: 0
            }
        });
        strict_1.default.equal(transitioned.lockedHamiltonianCycleId, 'rect-4:base');
        strict_1.default.equal(diagnostics.v2PatchAttempted, 1);
        strict_1.default.equal(diagnostics.v2GraphValidCandidates > 0, true);
        strict_1.default.equal(diagnostics.v2SnakeUsableCandidates, 0);
        strict_1.default.equal(diagnostics.v2SelectedCandidates, 0);
        strict_1.default.equal(diagnostics.v2RejectedBudget, 1);
    });
});
