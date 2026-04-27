"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialGameState = createInitialGameState;
const coords_js_1 = require("./coords.js");
const apple_spawner_js_1 = require("./apple-spawner.js");
const certified_hamiltonian_error_js_1 = require("./certified-hamiltonian-error.js");
const certified_phase_controller_js_1 = require("./certified-phase-controller.js");
const cycle_library_js_1 = require("./cycle-library.js");
const hamiltonian_certificate_js_1 = require("./hamiltonian-certificate.js");
const map_validator_js_1 = require("./map-validator.js");
const snake_js_1 = require("./snake.js");
function firstCycleDirection(map, spawnNodeId) {
    const currentIndex = map.hamiltonianCycle.indexOf(spawnNodeId);
    const current = currentIndex === -1 ? map.hamiltonianCycle[0] : map.hamiltonianCycle[currentIndex];
    const next = map.hamiltonianCycle[(currentIndex + 1 + map.hamiltonianCycle.length) % map.hamiltonianCycle.length] ?? map.hamiltonianCycle[1];
    const edge = map.graph.edges.find((candidate) => candidate.from === current && candidate.to === next);
    return edge?.direction ?? 'right';
}
function createInitialGameState(map, mode, aiStrategy, random = { next: () => Math.random() }) {
    const spawnNodeId = (0, coords_js_1.nodeIdForCoord)(map.snakeSpawn);
    const snake = (0, snake_js_1.createSnake)(spawnNodeId, firstCycleDirection(map, spawnNodeId));
    const appleNodeId = (0, apple_spawner_js_1.spawnAppleNode)(map.graph, snake.segments, random);
    const nowIso = new Date().toISOString();
    const lockedHamiltonianCycle = aiStrategy === 'certified-hamiltonian' ? [...map.hamiltonianCycle] : null;
    if (lockedHamiltonianCycle && !(0, map_validator_js_1.validateHamiltonianCycle)(map.graph, lockedHamiltonianCycle)) {
        throw new certified_hamiltonian_error_js_1.CertifiedHamiltonianInvariantError('Certified Hamiltonian AI invariant failed: initial locked cycle does not form a valid Hamiltonian cycle for the current map graph.');
    }
    if (lockedHamiltonianCycle && !(0, hamiltonian_certificate_js_1.validLockedCertificate)(snake.segments, lockedHamiltonianCycle)) {
        throw new certified_hamiltonian_error_js_1.CertifiedHamiltonianInvariantError('Certified Hamiltonian AI invariant failed: initial locked cycle does not satisfy the locked Hamiltonian certificate.');
    }
    return {
        map,
        lockedHamiltonianCycle,
        lockedHamiltonianCycleId: aiStrategy === 'certified-hamiltonian' ? (0, cycle_library_js_1.createBaseCycleLibraryEntryId)(map.id) : null,
        certifiedPhase: aiStrategy === 'certified-hamiltonian' ? (0, certified_phase_controller_js_1.selectCertifiedPhase)({ map, snake }) : null,
        certifiedMode: aiStrategy === 'certified-hamiltonian' ? 'locked' : null,
        activeCertifiedTransitionPlan: null,
        snake,
        appleNodeId,
        applesEaten: 0,
        elapsedMs: 0,
        mode,
        aiStrategy,
        isPaused: false,
        isOver: false,
        outcome: null,
        deathReason: null,
        pendingWinCheck: appleNodeId === null,
        finalAppleTimeMs: 0,
        lastMove: null,
        aiPlannedPath: [],
        stepsSinceLastApple: 0,
        startedAtIso: nowIso
    };
}
