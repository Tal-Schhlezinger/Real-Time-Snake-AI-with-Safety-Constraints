"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const graph_1 = require("../src/core/graph");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const coords_1 = require("../src/core/coords");
const helpers_1 = require("./helpers");
(0, testkit_1.describe)('graph generation and map validation', () => {
    (0, testkit_1.it)('builds graph nodes and portal edges from the grid', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 5,
            height: 4,
            walls: [{ x: 2, y: 0 }],
            portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } }],
            snakeSpawn: { x: 0, y: 0 }
        });
        const result = (0, graph_1.buildGraphFromDraft)(draft);
        const nodeIds = result.graph.nodes.map((node) => node.id);
        const portalEdge = result.graph.edges.find((edge) => edge.from === (0, coords_1.nodeIdForCoord)({ x: 0, y: 1 }) && edge.direction === 'right');
        strict_1.default.equal(nodeIds.includes((0, coords_1.nodeIdForCoord)({ x: 1, y: 1 })), false);
        strict_1.default.equal(nodeIds.includes((0, coords_1.nodeIdForCoord)({ x: 3, y: 1 })), false);
        strict_1.default.equal(nodeIds.includes((0, coords_1.nodeIdForCoord)({ x: 2, y: 0 })), false);
        strict_1.default.equal(portalEdge?.to, (0, coords_1.nodeIdForCoord)({ x: 4, y: 1 }));
        strict_1.default.equal(portalEdge?.kind, 'portal');
    });
    (0, testkit_1.it)('rejects a saved map when the saved graph no longer matches the grid', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const corrupted = {
            ...map,
            graph: {
                nodes: map.graph.nodes.slice(0, -1),
                edges: map.graph.edges
            }
        };
        const result = (0, map_validator_1.validateLoadedMap)(corrupted);
        strict_1.default.equal(result.isValid, false);
        strict_1.default.equal(result.reasons.some((reason) => reason.code === 'graph-grid-mismatch'), true);
    });
    (0, testkit_1.it)('accepts a valid Hamiltonian-cycle map', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 4,
            height: 4,
            snakeSpawn: { x: 0, y: 0 }
        });
        const result = (0, map_validator_1.validateDraftMap)(draft, { timeLimitMs: 2_000 });
        strict_1.default.equal(result.isValid, true);
        strict_1.default.equal(result.cycle.length, result.graph.nodes.length);
    });
    (0, testkit_1.it)('rejects a disconnected playable graph', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 4,
            height: 4,
            walls: [
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 1, y: 2 },
                { x: 1, y: 3 }
            ],
            snakeSpawn: { x: 0, y: 0 }
        });
        const result = (0, map_validator_1.validateDraftMap)(draft, { timeLimitMs: 2_000 });
        strict_1.default.equal(result.isValid, false);
        strict_1.default.equal(result.reasons.some((reason) => reason.code === 'disconnected-playable-graph'), true);
    });
    (0, testkit_1.it)('rejects a map with a dead-end cell', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 4,
            height: 4,
            walls: [
                { x: 0, y: 1 },
                { x: 1, y: 0 },
                { x: 2, y: 1 }
            ],
            snakeSpawn: { x: 1, y: 1 }
        });
        const result = (0, map_validator_1.validateDraftMap)(draft, { timeLimitMs: 2_000 });
        strict_1.default.equal(result.isValid, false);
        strict_1.default.equal(result.reasons.some((reason) => reason.code === 'dead-end-cell'), true);
    });
    (0, testkit_1.it)('rejects a map with a bridge / cut edge when applicable', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 6,
            height: 2,
            walls: [
                { x: 2, y: 1 },
                { x: 3, y: 1 }
            ],
            snakeSpawn: { x: 0, y: 0 }
        });
        const result = (0, map_validator_1.validateDraftMap)(draft, { timeLimitMs: 2_000 });
        strict_1.default.equal(result.isValid, false);
        strict_1.default.equal(result.reasons.some((reason) => reason.code === 'bridge-edge'), true);
    });
    (0, testkit_1.it)('rejects a connected non-Hamiltonian map', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 3,
            height: 3,
            snakeSpawn: { x: 0, y: 0 }
        });
        const result = (0, map_validator_1.validateDraftMap)(draft, { timeLimitMs: 2_000 });
        strict_1.default.equal(result.isValid, false);
        strict_1.default.equal(result.reasons.some((reason) => reason.code === 'no-hamiltonian-cycle'), true);
    });
    (0, testkit_1.it)('stores a Hamiltonian cycle that visits every playable node exactly once and uses only legal edges', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        strict_1.default.equal(new Set(map.hamiltonianCycle).size, map.graph.nodes.length);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, map.hamiltonianCycle), true);
    });
});
