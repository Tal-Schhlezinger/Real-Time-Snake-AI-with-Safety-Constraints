"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const rectangle_path_cache_1 = require("../src/core/rectangle-path-cache");
const testkit_1 = require("./testkit");
function assertEveryPathIsValid(width, height, terminalA, terminalB, paths) {
    for (const path of paths) {
        strict_1.default.equal(path[0], terminalA);
        strict_1.default.equal(path[path.length - 1], terminalB);
        strict_1.default.equal(new Set(path).size, width * height);
        strict_1.default.equal((0, rectangle_path_cache_1.validateLocalHamiltonianPath)(width, height, path, terminalA, terminalB), true);
    }
}
(0, testkit_1.describe)('Rectangle path cache', () => {
    (0, testkit_1.it)('localIndex/localCoord round trip', () => {
        for (let y = 0; y < 4; y += 1) {
            for (let x = 0; x < 5; x += 1) {
                const index = (0, rectangle_path_cache_1.localIndex)(x, y, 5);
                strict_1.default.deepEqual((0, rectangle_path_cache_1.localCoord)(index, 5), { x, y });
            }
        }
    });
    (0, testkit_1.it)('valid path validates', () => {
        strict_1.default.equal((0, rectangle_path_cache_1.validateLocalHamiltonianPath)(2, 3, [0, 1, 3, 5, 4, 2], 0, 2), true);
    });
    (0, testkit_1.it)('path with duplicate cell fails validation', () => {
        strict_1.default.equal((0, rectangle_path_cache_1.validateLocalHamiltonianPath)(2, 3, [0, 1, 3, 5, 4, 4], 0, 4), false);
    });
    (0, testkit_1.it)('path missing a cell fails validation', () => {
        strict_1.default.equal((0, rectangle_path_cache_1.validateLocalHamiltonianPath)(2, 3, [0, 1, 3, 5, 4], 0, 4), false);
    });
    (0, testkit_1.it)('path with non-adjacent step fails validation', () => {
        strict_1.default.equal((0, rectangle_path_cache_1.validateLocalHamiltonianPath)(2, 3, [0, 3, 1, 5, 4, 2], 0, 2), false);
    });
    (0, testkit_1.it)('2x3 cache returns at least one Hamiltonian path for a possible terminal pair', () => {
        const paths = (0, rectangle_path_cache_1.getRectanglePaths)(2, 3, 0, 2);
        strict_1.default.ok(paths.length > 0);
        assertEveryPathIsValid(2, 3, 0, 2, paths);
    });
    (0, testkit_1.it)('impossible terminal pair returns an empty list', () => {
        const paths = (0, rectangle_path_cache_1.getRectanglePaths)(2, 2, 0, 3);
        strict_1.default.deepEqual(paths, []);
    });
    (0, testkit_1.it)('every returned path starts and ends at requested terminals and visits every cell exactly once', () => {
        const paths = (0, rectangle_path_cache_1.getRectanglePaths)(2, 4, 0, 6);
        strict_1.default.ok(paths.length > 0);
        assertEveryPathIsValid(2, 4, 0, 6, paths);
    });
    (0, testkit_1.it)('maxArea is respected', () => {
        const cache = (0, rectangle_path_cache_1.buildRectanglePathCache)({ maxArea: 5 });
        const paths = cache.getPaths(2, 3, 0, 2);
        strict_1.default.deepEqual(paths, []);
        strict_1.default.deepEqual(cache.getLastDiagnostics(), {
            width: 2,
            height: 3,
            terminalA: 0,
            terminalB: 2,
            area: 6,
            searchAttempted: false,
            unsupported: true,
            nodesExpanded: 0,
            budgetExhausted: false,
            pathsFound: 0
        });
    });
    (0, testkit_1.it)('maxPathsPerTerminalPair is respected', () => {
        const paths = (0, rectangle_path_cache_1.getRectanglePaths)(3, 3, 0, 8, { maxPathsPerTerminalPair: 2 });
        strict_1.default.equal(paths.length, 2);
        assertEveryPathIsValid(3, 3, 0, 8, paths);
    });
    (0, testkit_1.it)('output is deterministic across repeated calls', () => {
        const first = (0, rectangle_path_cache_1.getRectanglePaths)(3, 3, 0, 8, { maxPathsPerTerminalPair: 8 });
        const second = (0, rectangle_path_cache_1.getRectanglePaths)(3, 3, 0, 8, { maxPathsPerTerminalPair: 8 });
        const cache = (0, rectangle_path_cache_1.buildRectanglePathCache)({ maxPathsPerTerminalPair: 8 });
        const fromCacheFirst = cache.getPaths(3, 3, 0, 8);
        const fromCacheSecond = cache.getPaths(3, 3, 0, 8);
        strict_1.default.deepEqual(first, second);
        strict_1.default.deepEqual(fromCacheFirst, fromCacheSecond);
        strict_1.default.deepEqual(first, fromCacheFirst);
    });
});
