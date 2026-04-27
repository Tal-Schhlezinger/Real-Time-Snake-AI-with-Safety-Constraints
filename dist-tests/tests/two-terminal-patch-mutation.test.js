"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const coords_1 = require("../src/core/coords");
const ai_controller_1 = require("../src/core/ai-controller");
const game_engine_1 = require("../src/core/game-engine");
const game_state_1 = require("../src/core/game-state");
const graph_1 = require("../src/core/graph");
const rectangle_path_cache_1 = require("../src/core/rectangle-path-cache");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const two_terminal_patch_mutation_1 = require("../src/core/two-terminal-patch-mutation");
const map_validator_1 = require("../src/core/map-validator");
const testkit_1 = require("./testkit");
const syntheticOldCycle = ['a', 'p1', 'p2', 'p3', 'p4', 'b', 'o1', 'o2'];
const syntheticPatchNodes = new Set(['a', 'p1', 'p2', 'p3', 'p4', 'b']);
const syntheticOldInternalPath = ['a', 'p1', 'p2', 'p3', 'p4', 'b'];
const syntheticReplacementPath = ['a', 'p2', 'p4', 'p1', 'p3', 'b'];
function spliceSynthetic(replacementInternalPath = syntheticReplacementPath) {
    return (0, two_terminal_patch_mutation_1.spliceTwoTerminalPatchPath)({
        oldCycle: syntheticOldCycle,
        patchNodeSet: syntheticPatchNodes,
        terminalA: 'a',
        terminalB: 'b',
        oldInternalPath: syntheticOldInternalPath,
        replacementInternalPath
    });
}
function arraysEqual(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function withoutProfile(value) {
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => key === 'profile' ? undefined : nestedValue));
}
function stepUntilNextApple(state) {
    let current = state;
    const targetApples = state.applesEaten + 1;
    for (let step = 0; step < state.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
        const decision = (0, ai_controller_1.decideAiMove)(current, 'certified-hamiltonian');
        strict_1.default.ok(decision);
        current = (0, game_engine_1.advanceGame)(current, decision.direction, 0, { next: () => 0 });
        if (current.applesEaten >= targetApples) {
            return current;
        }
    }
    return current;
}
function makePatchMutationFeatures(overrides = {}) {
    const base = {
        candidateId: 'candidate-a',
        patchId: 'rect-0-0-2x2',
        usabilityMode: 'immediate-locked',
        pathLenToCurrentApple: 4,
        transitionPathLength: null,
        currentLockedCyclePathLen: 6,
        pathLenImprovement: 2,
        mutationSize: {
            changedCycleEdges: 4,
            rectangleArea: 4
        },
        cycleScore: 10,
        cycleFeatures: null
    };
    const merged = {
        ...base,
        ...overrides,
        mutationSize: {
            ...base.mutationSize,
            ...overrides.mutationSize
        }
    };
    return {
        ...merged,
        patchMutationScore: overrides.patchMutationScore ?? (0, two_terminal_patch_mutation_1.scorePatchMutationCandidate)(merged)
    };
}
(0, testkit_1.describe)('Two-terminal patch mutation splice helper', () => {
    (0, testkit_1.it)('splices a small artificial cycle when replacement uses the same terminals and patch nodes', () => {
        strict_1.default.deepEqual(spliceSynthetic(), ['a', 'p2', 'p4', 'p1', 'p3', 'b', 'o1', 'o2']);
    });
    (0, testkit_1.it)('candidate cycle has the same node set as oldCycle', () => {
        const candidate = spliceSynthetic();
        strict_1.default.ok(candidate);
        strict_1.default.equal((0, two_terminal_patch_mutation_1.sameNodeSet)(candidate, syntheticOldCycle), true);
    });
    (0, testkit_1.it)('candidate cycle has no duplicates', () => {
        const candidate = spliceSynthetic();
        strict_1.default.ok(candidate);
        strict_1.default.equal(new Set(candidate).size, candidate.length);
    });
    (0, testkit_1.it)('candidate preserves outside nodes in the same order', () => {
        const candidate = spliceSynthetic();
        strict_1.default.ok(candidate);
        strict_1.default.deepEqual(candidate.filter((nodeId) => !syntheticPatchNodes.has(nodeId)), syntheticOldCycle.filter((nodeId) => !syntheticPatchNodes.has(nodeId)));
    });
    (0, testkit_1.it)('candidate contains replacementInternalPath as the internal patch segment', () => {
        const candidate = spliceSynthetic();
        strict_1.default.ok(candidate);
        strict_1.default.deepEqual(candidate.slice(0, syntheticReplacementPath.length), syntheticReplacementPath);
    });
    (0, testkit_1.it)('replacement with missing patch node is rejected', () => {
        strict_1.default.equal(spliceSynthetic(['a', 'p2', 'p4', 'p1', 'b']), null);
    });
    (0, testkit_1.it)('replacement with duplicate patch node is rejected', () => {
        strict_1.default.equal(spliceSynthetic(['a', 'p2', 'p4', 'p1', 'p1', 'b']), null);
    });
    (0, testkit_1.it)('replacement with wrong terminal is rejected', () => {
        strict_1.default.equal(spliceSynthetic(['a', 'p2', 'p4', 'p1', 'b', 'p3']), null);
    });
    (0, testkit_1.it)('replacement with same path as old path returns null as a no-op', () => {
        strict_1.default.equal(spliceSynthetic(syntheticOldInternalPath), null);
    });
    (0, testkit_1.it)('reversed replacement orientation is supported by orienting it to the old internal segment', () => {
        const reversedReplacement = [...syntheticReplacementPath].reverse();
        strict_1.default.deepEqual(spliceSynthetic(reversedReplacement), ['a', 'p2', 'p4', 'p1', 'p3', 'b', 'o1', 'o2']);
    });
    (0, testkit_1.it)('pathUsesExactlyPatch rejects duplicates and missing patch vertices', () => {
        strict_1.default.equal((0, two_terminal_patch_mutation_1.pathUsesExactlyPatch)(syntheticReplacementPath, syntheticPatchNodes), true);
        strict_1.default.equal((0, two_terminal_patch_mutation_1.pathUsesExactlyPatch)(['a', 'p2', 'p4', 'p1', 'p1', 'b'], syntheticPatchNodes), false);
        strict_1.default.equal((0, two_terminal_patch_mutation_1.pathUsesExactlyPatch)(['a', 'p2', 'p4', 'p1', 'b'], syntheticPatchNodes), false);
    });
    (0, testkit_1.it)('extractCycleSegment returns the unique contiguous patch segment when it is unambiguous', () => {
        strict_1.default.deepEqual((0, two_terminal_patch_mutation_1.extractCycleSegment)(syntheticOldCycle, 'a', 'b', syntheticPatchNodes), syntheticOldInternalPath);
    });
    (0, testkit_1.it)('spliced cached rectangle path can validate as a Hamiltonian cycle on a small grid board', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const oldCycle = map.hamiltonianCycle;
        const terminalA = oldCycle[0];
        const terminalB = oldCycle[oldCycle.length - 1];
        const patchNodeSet = new Set(oldCycle);
        const terminalACoord = (0, coords_1.coordFromNodeId)(terminalA);
        const terminalBCoord = (0, coords_1.coordFromNodeId)(terminalB);
        const localTerminalA = (0, rectangle_path_cache_1.localIndex)(terminalACoord.x, terminalACoord.y, 4);
        const localTerminalB = (0, rectangle_path_cache_1.localIndex)(terminalBCoord.x, terminalBCoord.y, 4);
        const oldLocalPath = oldCycle.map((nodeId) => {
            const coord = (0, coords_1.coordFromNodeId)(nodeId);
            return (0, rectangle_path_cache_1.localIndex)(coord.x, coord.y, 4);
        });
        const replacementLocalPath = (0, rectangle_path_cache_1.getRectanglePaths)(4, 4, localTerminalA, localTerminalB, {
            maxPathsPerTerminalPair: 64
        }).find((path) => !arraysEqual(path.map(String), oldLocalPath.map(String)));
        strict_1.default.ok(replacementLocalPath);
        const replacementPath = replacementLocalPath.map((index) => {
            const x = index % 4;
            const y = Math.floor(index / 4);
            return (0, coords_1.nodeIdForCoord)({ x, y });
        });
        const candidate = (0, two_terminal_patch_mutation_1.spliceTwoTerminalPatchPath)({
            oldCycle,
            patchNodeSet,
            terminalA,
            terminalB,
            oldInternalPath: oldCycle,
            replacementInternalPath: replacementPath
        });
        strict_1.default.ok(candidate);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, candidate), true);
    });
});
(0, testkit_1.describe)('Rectangle two-terminal patch diagnostics', () => {
    (0, testkit_1.it)('enumerates rectangles deterministically within configured bounds', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        strict_1.default.deepEqual((0, two_terminal_patch_mutation_1.enumerateRectangles)(map.graph, { maxWidth: 2, maxHeight: 2, maxArea: 4 }).slice(0, 4), [
            { x: 0, y: 0, width: 1, height: 1 },
            { x: 0, y: 0, width: 2, height: 1 },
            { x: 0, y: 0, width: 1, height: 2 },
            { x: 0, y: 0, width: 2, height: 2 }
        ]);
    });
    (0, testkit_1.it)('finds a known two-terminal rectangle patch in a controlled cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const rect = { x: 0, y: 0, width: 4, height: 2 };
        const result = (0, two_terminal_patch_mutation_1.analyzeRectanglePatch)(map.graph, map.hamiltonianCycle, rect);
        strict_1.default.equal(result.fullRectangle, true);
        strict_1.default.equal(result.crossingCount, 2);
        strict_1.default.deepEqual(result.terminals, {
            terminalA: 'n-1-1',
            terminalB: 'n-0-1'
        });
        strict_1.default.equal(result.internalDegreePatternValid, true);
        strict_1.default.equal(result.internalPathConnected, true);
        strict_1.default.equal(result.internalPathVisitsAllVertices, true);
        strict_1.default.deepEqual(result.originalInsidePath, [
            'n-0-1',
            'n-0-0',
            'n-1-0',
            'n-2-0',
            'n-3-0',
            'n-3-1',
            'n-2-1',
            'n-1-1'
        ]);
    });
    (0, testkit_1.it)('rejects rectangles with crossing count 0 or 3+', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const wholeBoard = (0, two_terminal_patch_mutation_1.analyzeRectanglePatch)(map.graph, map.hamiltonianCycle, { x: 0, y: 0, width: 4, height: 4 });
        const fourCrossings = (0, two_terminal_patch_mutation_1.analyzeRectanglePatch)(map.graph, map.hamiltonianCycle, { x: 1, y: 0, width: 2, height: 2 });
        strict_1.default.equal(wholeBoard.crossingCount, 0);
        strict_1.default.equal(wholeBoard.rejectionReason, 'crossing-count-not-two');
        strict_1.default.equal(fourCrossings.crossingCount >= 3, true);
        strict_1.default.equal(fourCrossings.rejectionReason, 'crossing-count-not-two');
    });
    (0, testkit_1.it)('does not produce odd crossing counts for closed cycle rectangle membership', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const diagnostics = (0, two_terminal_patch_mutation_1.analyzeRectanglePatches)(map.graph, map.hamiltonianCycle, { maxWidth: 4, maxHeight: 4, maxArea: 16 });
        strict_1.default.equal(diagnostics.patches.some((patch) => patch.crossingCount % 2 === 1), false);
    });
    (0, testkit_1.it)('rejects a rectangle with a missing non-playable cell', () => {
        const graph = (0, graph_1.buildGraphFromDraft)({
            width: 3,
            height: 3,
            walls: [{ x: 1, y: 1 }],
            portals: []
        }).graph;
        const cycle = ['n-0-0', 'n-1-0', 'n-2-0', 'n-2-1', 'n-2-2', 'n-1-2', 'n-0-2', 'n-0-1'];
        const result = (0, two_terminal_patch_mutation_1.analyzeRectanglePatch)(graph, cycle, { x: 0, y: 0, width: 3, height: 3 });
        strict_1.default.equal((0, two_terminal_patch_mutation_1.isFullRectangleInBoard)(graph, { x: 0, y: 0, width: 3, height: 3 }), false);
        strict_1.default.equal(result.fullRectangle, false);
        strict_1.default.equal(result.vertexCount, 8);
        strict_1.default.equal(result.rejectionReason, 'rectangle-not-full');
    });
    (0, testkit_1.it)('identifies terminals from the two cut crossings', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const rectNodeSet = new Set(['n-0-0', 'n-1-0', 'n-2-0', 'n-3-0', 'n-0-1', 'n-1-1', 'n-2-1', 'n-3-1']);
        const crossings = (0, two_terminal_patch_mutation_1.getCycleCutCrossings)(map.hamiltonianCycle, rectNodeSet);
        strict_1.default.deepEqual(crossings.map((crossing) => crossing.insideNode), ['n-1-1', 'n-0-1']);
        strict_1.default.deepEqual(crossings.map((crossing) => crossing.outsideNode), ['n-1-2', 'n-0-2']);
    });
    (0, testkit_1.it)('verifies the original inside path visits every patch node exactly once', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const rectNodeSet = new Set(['n-0-0', 'n-1-0', 'n-2-0', 'n-3-0', 'n-0-1', 'n-1-1', 'n-2-1', 'n-3-1']);
        const insideEdges = (0, two_terminal_patch_mutation_1.extractInsideCycleEdges)(map.hamiltonianCycle, rectNodeSet);
        const segment = (0, two_terminal_patch_mutation_1.extractCycleSegment)(map.hamiltonianCycle, 'n-1-1', 'n-0-1', rectNodeSet);
        strict_1.default.equal(insideEdges.length, rectNodeSet.size - 1);
        strict_1.default.ok(segment);
        strict_1.default.equal((0, two_terminal_patch_mutation_1.pathUsesExactlyPatch)(segment, rectNodeSet), true);
    });
    (0, testkit_1.it)('reports alternativePathCount from RectanglePathCache', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const rect = { x: 0, y: 0, width: 4, height: 2 };
        const result = (0, two_terminal_patch_mutation_1.analyzeRectanglePatch)(map.graph, map.hamiltonianCycle, rect);
        const expectedAlternativeCount = (0, rectangle_path_cache_1.getRectanglePaths)(4, 2, (0, rectangle_path_cache_1.localIndex)(0, 1, 4), (0, rectangle_path_cache_1.localIndex)(1, 1, 4)).length - 1;
        strict_1.default.equal(result.cacheKey, '4x2:4->5');
        strict_1.default.equal(result.alternativePathCount, expectedAlternativeCount);
    });
    (0, testkit_1.it)('reports cache-miss when a theorem-compatible rectangle exceeds the path cache area limit', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const result = (0, two_terminal_patch_mutation_1.analyzeRectanglePatches)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 3,
            maxArea: 12,
            pathCacheOptions: { maxArea: 6 }
        }).patches.find((patch) => patch.rect.x === 0 && patch.rect.y === 0 && patch.rect.width === 4 && patch.rect.height === 3);
        strict_1.default.ok(result);
        strict_1.default.equal(result.rejectionReason, 'cache-miss');
        strict_1.default.equal(result.cacheKey, '4x3:8->11');
        strict_1.default.equal(result.alternativePathCount, null);
    });
    (0, testkit_1.it)('diagnostics do not mutate cycle or graph state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const graphBefore = JSON.parse(JSON.stringify(map.graph));
        const cycleBefore = [...map.hamiltonianCycle];
        (0, two_terminal_patch_mutation_1.analyzeRectanglePatches)(map.graph, map.hamiltonianCycle, { maxWidth: 4, maxHeight: 4, maxArea: 16 });
        strict_1.default.deepEqual(map.graph, graphBefore);
        strict_1.default.deepEqual(map.hamiltonianCycle, cycleBefore);
    });
    (0, testkit_1.it)('aggregate diagnostics output is deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const options = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
        strict_1.default.deepEqual((0, two_terminal_patch_mutation_1.analyzeRectanglePatches)(map.graph, map.hamiltonianCycle, options), (0, two_terminal_patch_mutation_1.analyzeRectanglePatches)(map.graph, map.hamiltonianCycle, options));
    });
});
(0, testkit_1.describe)('Rectangle patch splice candidate diagnostics', () => {
    (0, testkit_1.it)('splicing from detected patches preserves the old cycle node set', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const result = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.ok(result.candidates.length > 0);
        for (const candidate of result.candidates) {
            strict_1.default.equal((0, two_terminal_patch_mutation_1.sameNodeSet)(candidate.cycle, map.hamiltonianCycle), true);
        }
    });
    (0, testkit_1.it)('detected patch alternatives generate raw candidates', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const result = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.equal(result.aggregate.validTwoTerminalPatches > 0, true);
        strict_1.default.equal(result.aggregate.alternativesConsidered > 0, true);
        strict_1.default.equal(result.aggregate.rawCandidatesGenerated > 0, true);
    });
    (0, testkit_1.it)('every raw candidate is passed through validateHamiltonianCycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        let validationCalls = 0;
        const result = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            validateCycle: (graph, candidateCycle) => {
                validationCalls += 1;
                return (0, map_validator_1.validateHamiltonianCycle)(graph, candidateCycle);
            }
        });
        strict_1.default.equal(validationCalls, result.aggregate.rawCandidatesGenerated);
        strict_1.default.equal(validationCalls, result.candidateDiagnostics.filter((diagnostic) => diagnostic.rawCandidateGenerated).length);
    });
    (0, testkit_1.it)('graph-valid candidates are counted', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const result = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.equal(result.aggregate.graphValidCandidates > 0, true);
        strict_1.default.equal(result.aggregate.graphInvalidCandidates, 0);
        strict_1.default.equal(result.candidates.length, result.aggregate.graphValidCandidates);
    });
    (0, testkit_1.it)('duplicate candidates are deduplicated', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const result = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.equal(result.aggregate.duplicateCandidates > 0, true);
        strict_1.default.equal(result.candidateDiagnostics.filter((diagnostic) => diagnostic.rejectionReason === 'duplicate-candidate').length, result.aggregate.duplicateCandidates);
    });
    (0, testkit_1.it)('no-op alternatives are skipped', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const result = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.equal(result.aggregate.noOpAlternatives > 0, true);
        strict_1.default.equal(result.candidateDiagnostics.filter((diagnostic) => diagnostic.rejectionReason === 'no-op-alternative').length, result.aggregate.noOpAlternatives);
    });
    (0, testkit_1.it)('generation diagnostics do not mutate cycle or graph state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const graphBefore = JSON.parse(JSON.stringify(map.graph));
        const cycleBefore = [...map.hamiltonianCycle];
        (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.deepEqual(map.graph, graphBefore);
        strict_1.default.deepEqual(map.hamiltonianCycle, cycleBefore);
    });
    (0, testkit_1.it)('generation output is deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const options = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
        const first = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, options);
        const second = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, options);
        strict_1.default.equal(first.profile.generationMs >= 0, true);
        strict_1.default.deepEqual(withoutProfile(second), withoutProfile(first));
    });
});
(0, testkit_1.describe)('Rectangle patch mutation Snake certification classification', () => {
    (0, testkit_1.it)('graph-valid candidate with validLockedCertificate and appleForward is classified immediate-locked-valid', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const result = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidateForSnake)(state, { cycle: map.hamiltonianCycle });
        strict_1.default.equal(result.graphValid, true);
        strict_1.default.equal(result.immediateLockedCertificate, true);
        strict_1.default.equal(result.immediateAppleForward, true);
        strict_1.default.equal(result.usableForSnake, true);
        strict_1.default.equal(result.reason, 'immediate-locked-valid');
    });
    (0, testkit_1.it)('graph-valid candidate with validLockedCertificate but failing appleForward is not immediate-usable', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const state = {
            ...initial,
            appleNodeId: initial.snake.segments[0]
        };
        const result = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidateForSnake)(state, { cycle: map.hamiltonianCycle }, {
            transitionOptions: { maxPaths: 4, slack: 0 }
        });
        strict_1.default.equal(result.graphValid, true);
        strict_1.default.equal(result.immediateLockedCertificate, true);
        strict_1.default.equal(result.immediateAppleForward, false);
        strict_1.default.equal(result.usableForSnake, false);
        strict_1.default.equal(result.reason, 'immediate-locked-valid-but-apple-forward-failed');
    });
    (0, testkit_1.it)('graph-valid candidate without immediate certificate but with transition plan is classified transition-valid', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        let state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        state = stepUntilNextApple(state);
        state = stepUntilNextApple(state);
        state = stepUntilNextApple(state);
        const candidate = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        }).candidates[0];
        strict_1.default.ok(candidate);
        const result = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidateForSnake)(state, candidate, {
            transitionOptions: { maxPaths: 64, slack: 6 }
        });
        strict_1.default.equal(result.graphValid, true);
        strict_1.default.equal(result.immediateLockedCertificate, false);
        strict_1.default.equal(result.transitionPlanExists, true);
        strict_1.default.equal(result.transitionPathLength, 8);
        strict_1.default.equal(result.usableForSnake, true);
        strict_1.default.equal(result.reason, 'transition-valid');
    });
    (0, testkit_1.it)('graph-valid candidate with neither immediate certificate nor transition plan is rejected', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        let state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        state = stepUntilNextApple(state);
        state = stepUntilNextApple(state);
        const candidate = (0, two_terminal_patch_mutation_1.generateRectanglePatchMutationCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        }).candidates[0];
        strict_1.default.ok(candidate);
        const result = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidateForSnake)(state, candidate, {
            transitionOptions: { maxPaths: 64, slack: 6 }
        });
        strict_1.default.equal(result.graphValid, true);
        strict_1.default.equal(result.immediateLockedCertificate, false);
        strict_1.default.equal(result.transitionPlanExists, false);
        strict_1.default.equal(result.usableForSnake, false);
        strict_1.default.equal(result.reason, 'locked-invalid-transition-not-found');
    });
    (0, testkit_1.it)('graph-invalid candidate is never usable', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const invalidCycle = [...map.hamiltonianCycle];
        invalidCycle[1] = invalidCycle[0];
        const result = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidateForSnake)(state, { cycle: invalidCycle });
        strict_1.default.equal(result.graphValid, false);
        strict_1.default.equal(result.usableForSnake, false);
        strict_1.default.equal(result.reason, 'graph-invalid');
    });
    (0, testkit_1.it)('classification does not mutate gameplay state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const before = clone(state);
        (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidatesForSnake)(state, map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            transitionOptions: { maxPaths: 8, slack: 2 }
        });
        strict_1.default.deepEqual(state, before);
    });
    (0, testkit_1.it)('classification diagnostics are deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const options = {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            transitionOptions: { maxPaths: 8, slack: 2 }
        };
        const first = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidatesForSnake)(state, map.graph, map.hamiltonianCycle, options);
        const second = (0, two_terminal_patch_mutation_1.classifyPatchMutationCandidatesForSnake)(state, map.graph, map.hamiltonianCycle, options);
        strict_1.default.equal(first.mutationDiagnostics.profile.generationMs >= 0, true);
        strict_1.default.deepEqual(withoutProfile(second), withoutProfile(first));
    });
});
(0, testkit_1.describe)('Rectangle patch mutation scoring diagnostics', () => {
    (0, testkit_1.it)('usable improving candidate ranks above usable non-improving candidate', () => {
        const improving = makePatchMutationFeatures({ candidateId: 'improving', pathLenImprovement: 2 });
        const nonImproving = makePatchMutationFeatures({ candidateId: 'flat', pathLenImprovement: 0 });
        strict_1.default.deepEqual([nonImproving, improving].sort(two_terminal_patch_mutation_1.comparePatchMutationFeaturesForRanking).map((features) => features.candidateId), ['improving', 'flat']);
    });
    (0, testkit_1.it)('immediate-locked beats transition when improvement is equal', () => {
        const immediate = makePatchMutationFeatures({
            candidateId: 'immediate',
            usabilityMode: 'immediate-locked',
            pathLenImprovement: 2,
            transitionPathLength: null
        });
        const transition = makePatchMutationFeatures({
            candidateId: 'transition',
            usabilityMode: 'transition-valid',
            pathLenImprovement: 2,
            transitionPathLength: 3
        });
        strict_1.default.deepEqual([transition, immediate].sort(two_terminal_patch_mutation_1.comparePatchMutationFeaturesForRanking).map((features) => features.candidateId), ['immediate', 'transition']);
    });
    (0, testkit_1.it)('transition with shorter path ranks above longer transition', () => {
        const short = makePatchMutationFeatures({
            candidateId: 'short',
            usabilityMode: 'transition-valid',
            transitionPathLength: 3,
            pathLenImprovement: 2
        });
        const long = makePatchMutationFeatures({
            candidateId: 'long',
            usabilityMode: 'transition-valid',
            transitionPathLength: 5,
            pathLenImprovement: 2
        });
        strict_1.default.deepEqual([long, short].sort(two_terminal_patch_mutation_1.comparePatchMutationFeaturesForRanking).map((features) => features.candidateId), ['short', 'long']);
    });
    (0, testkit_1.it)('smaller mutation wins tie', () => {
        const small = makePatchMutationFeatures({
            candidateId: 'small',
            pathLenImprovement: 2,
            mutationSize: { changedCycleEdges: 4, rectangleArea: 4 }
        });
        const large = makePatchMutationFeatures({
            candidateId: 'large',
            pathLenImprovement: 2,
            mutationSize: { changedCycleEdges: 8, rectangleArea: 4 }
        });
        strict_1.default.deepEqual([large, small].sort(two_terminal_patch_mutation_1.comparePatchMutationFeaturesForRanking).map((features) => features.candidateId), ['small', 'large']);
    });
    (0, testkit_1.it)('invalid or unusable candidates are never ranked as selectable', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const result = (0, two_terminal_patch_mutation_1.rankPatchMutationCandidates)(state, map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            validateCycle: () => false
        });
        strict_1.default.equal(result.rankedCandidates.length, 0);
        strict_1.default.equal(result.aggregate.usableCandidates, 0);
        strict_1.default.equal(result.aggregate.bestCandidate, null);
    });
    (0, testkit_1.it)('scoring is deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const options = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
        strict_1.default.deepEqual(withoutProfile((0, two_terminal_patch_mutation_1.rankPatchMutationCandidates)(state, map.graph, map.hamiltonianCycle, options)), withoutProfile((0, two_terminal_patch_mutation_1.rankPatchMutationCandidates)(state, map.graph, map.hamiltonianCycle, options)));
    });
    (0, testkit_1.it)('ranking diagnostics do not mutate gameplay state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const before = clone(state);
        (0, two_terminal_patch_mutation_1.rankPatchMutationCandidates)(state, map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.deepEqual(state, before);
    });
});
