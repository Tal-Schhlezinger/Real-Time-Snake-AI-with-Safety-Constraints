"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const cycle_scoring_1 = require("../src/core/cycle-scoring");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
function reverseCycle(cycle) {
    return [...cycle].reverse();
}
function makeBaseFeatures(overrides = {}) {
    return {
        pathLen: 4,
        repairDistanceFromOldCycle: 4,
        maxDistToBody: 2,
        sumDistToBody: 8,
        meanDistToBody: 2,
        bodyAdjacency: 3,
        freeComponentCount: null,
        holeArea: null,
        cutRisk: null,
        futureMobilityMargin: null,
        arcNodeIds: ['a', 'b', 'c'],
        ...overrides
    };
}
(0, testkit_1.describe)('Cycle scoring', () => {
    (0, testkit_1.it)('same cycle has repairDistanceFromOldCycle = 0', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[4]
        });
        const features = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, map.hamiltonianCycle);
        strict_1.default.equal(features.repairDistanceFromOldCycle, 0);
    });
    (0, testkit_1.it)('different cycle has positive repair distance', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const reversed = reverseCycle(map.hamiltonianCycle);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[4]
        });
        const features = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, reversed);
        strict_1.default.ok(features.repairDistanceFromOldCycle > 0);
    });
    (0, testkit_1.it)('pathLen equals distanceForwardOnCycle(head, apple)', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const candidate = reverseCycle(map.hamiltonianCycle);
        const head = map.hamiltonianCycle[5];
        const apple = map.hamiltonianCycle[13];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [head, map.hamiltonianCycle[4], map.hamiltonianCycle[3]],
                direction: 'left',
                pendingGrowth: 0
            },
            appleNodeId: apple
        });
        const features = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, candidate);
        strict_1.default.equal(features.pathLen, (0, hamiltonian_certificate_1.distanceForwardOnCycle)(head, apple, candidate));
    });
    (0, testkit_1.it)('body-hugging arc has lower distance-to-body features than a far arc in a controlled test', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const farCycle = map.hamiltonianCycle;
        const huggingCycle = reverseCycle(map.hamiltonianCycle);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[5], map.hamiltonianCycle[4], map.hamiltonianCycle[3]],
                direction: 'left',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[13]
        });
        const farFeatures = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, farCycle);
        const huggingFeatures = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, huggingCycle);
        strict_1.default.ok((huggingFeatures.maxDistToBody ?? 0) <= (farFeatures.maxDistToBody ?? 0));
        strict_1.default.ok(huggingFeatures.sumDistToBody < farFeatures.sumDistToBody);
        strict_1.default.ok((huggingFeatures.meanDistToBody ?? 0) < (farFeatures.meanDistToBody ?? 0));
    });
    (0, testkit_1.it)('bodyAdjacency is higher for arcs adjacent to the body', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const farCycle = map.hamiltonianCycle;
        const huggingCycle = reverseCycle(map.hamiltonianCycle);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[5], map.hamiltonianCycle[4], map.hamiltonianCycle[3]],
                direction: 'left',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[13]
        });
        const farFeatures = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, farCycle);
        const huggingFeatures = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, huggingCycle);
        strict_1.default.ok(huggingFeatures.bodyAdjacency > farFeatures.bodyAdjacency);
    });
    (0, testkit_1.it)('scoreCycleFeatures responds to weight changes', () => {
        const shortButDisruptive = makeBaseFeatures({
            pathLen: 2,
            repairDistanceFromOldCycle: 20
        });
        const longButStable = makeBaseFeatures({
            pathLen: 6,
            repairDistanceFromOldCycle: 0
        });
        const pathFocusedWeights = {
            ...cycle_scoring_1.defaultCycleScoreWeights,
            pathLen: 10,
            repairDistanceFromOldCycle: 0.1
        };
        const repairFocusedWeights = {
            ...cycle_scoring_1.defaultCycleScoreWeights,
            pathLen: 0.1,
            repairDistanceFromOldCycle: 10
        };
        strict_1.default.ok((0, cycle_scoring_1.scoreCycleFeatures)(shortButDisruptive, pathFocusedWeights) < (0, cycle_scoring_1.scoreCycleFeatures)(longButStable, pathFocusedWeights));
        strict_1.default.ok((0, cycle_scoring_1.scoreCycleFeatures)(shortButDisruptive, repairFocusedWeights) > (0, cycle_scoring_1.scoreCycleFeatures)(longButStable, repairFocusedWeights));
        strict_1.default.ok((0, cycle_scoring_1.compareCandidateCycles)(shortButDisruptive, longButStable, pathFocusedWeights) < 0);
        strict_1.default.ok((0, cycle_scoring_1.compareCandidateCycles)(shortButDisruptive, longButStable, repairFocusedWeights) > 0);
    });
    (0, testkit_1.it)('scoring does not replace hard validation for invalid cycles', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const invalidCycle = map.hamiltonianCycle.slice(0, -1);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[4]
        });
        const features = (0, cycle_scoring_1.computeCycleFeatures)(state, map.hamiltonianCycle, invalidCycle);
        const score = (0, cycle_scoring_1.scoreCycleFeatures)(features);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, invalidCycle), false);
        strict_1.default.equal(Number.isFinite(score), true);
    });
});
