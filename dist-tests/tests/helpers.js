"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeDraft = makeDraft;
exports.makeSavedMap = makeSavedMap;
exports.makeGameState = makeGameState;
const graph_1 = require("../src/core/graph");
const certified_phase_controller_1 = require("../src/core/certified-phase-controller");
function makeDraft(overrides) {
    return {
        id: overrides.id ?? 'test-map',
        name: overrides.name ?? 'Test Map',
        width: overrides.width ?? 4,
        height: overrides.height ?? 4,
        walls: overrides.walls ?? [],
        portals: overrides.portals ?? [],
        snakeSpawn: overrides.snakeSpawn ?? { x: 0, y: 0 },
        createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z'
    };
}
function makeSavedMap(draft, cycle) {
    const { graph } = (0, graph_1.buildGraphFromDraft)(draft);
    return {
        ...draft,
        snakeSpawn: draft.snakeSpawn ?? { x: 0, y: 0 },
        graph,
        hamiltonianCycle: cycle ?? graph.nodes.map((node) => node.id)
    };
}
function makeGameState(overrides) {
    if (!overrides.map) {
        throw new Error('map is required');
    }
    return {
        map: overrides.map,
        lockedHamiltonianCycle: overrides.lockedHamiltonianCycle ?? null,
        lockedHamiltonianCycleId: overrides.lockedHamiltonianCycleId ?? null,
        certifiedPhase: overrides.certifiedPhase ??
            (overrides.aiStrategy === 'certified-hamiltonian' ? (0, certified_phase_controller_1.selectCertifiedPhase)({
                map: overrides.map,
                snake: overrides.snake ?? { segments: [overrides.map.graph.nodes[0].id], direction: 'right', pendingGrowth: 0 }
            }) : null),
        certifiedMode: overrides.certifiedMode ?? (overrides.aiStrategy === 'certified-hamiltonian' ? 'locked' : null),
        activeCertifiedTransitionPlan: overrides.activeCertifiedTransitionPlan ?? null,
        snake: overrides.snake ?? { segments: [overrides.map.graph.nodes[0].id], direction: 'right', pendingGrowth: 0 },
        appleNodeId: overrides.appleNodeId ?? null,
        applesEaten: overrides.applesEaten ?? 0,
        elapsedMs: overrides.elapsedMs ?? 0,
        mode: overrides.mode ?? 'human',
        aiStrategy: overrides.aiStrategy ?? null,
        isPaused: overrides.isPaused ?? false,
        isOver: overrides.isOver ?? false,
        outcome: overrides.outcome ?? null,
        deathReason: overrides.deathReason ?? null,
        pendingWinCheck: overrides.pendingWinCheck ?? false,
        finalAppleTimeMs: overrides.finalAppleTimeMs ?? 0,
        lastMove: overrides.lastMove ?? null,
        aiPlannedPath: overrides.aiPlannedPath ?? [],
        stepsSinceLastApple: overrides.stepsSinceLastApple ?? 0,
        startedAtIso: overrides.startedAtIso ?? '2026-01-01T00:00:00.000Z'
    };
}
