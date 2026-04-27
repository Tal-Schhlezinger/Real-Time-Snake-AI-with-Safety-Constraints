"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const default_maps_1 = require("../src/data/default-maps");
const multi_terminal_patch_diagnostics_1 = require("../src/core/multi-terminal-patch-diagnostics");
const ai_controller_1 = require("../src/core/ai-controller");
const game_engine_1 = require("../src/core/game-engine");
const game_state_1 = require("../src/core/game-state");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const testkit_1 = require("./testkit");
const fourExitRect = { x: 0, y: 0, width: 3, height: 2 };
const alternativeCoverRect = { x: 0, y: 0, width: 3, height: 3 };
function getAlternativeCoverFixture() {
    const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
    const patch = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, alternativeCoverRect);
    const diagnostics = (0, multi_terminal_patch_diagnostics_1.generateSamePairing4ExitPathCovers)(patch, map.graph, {
        maxPatchArea4Exit: 9,
        maxCoversPerPatch: 8,
        maxSolverExpansionsPerPatch: 20_000
    });
    const cover = diagnostics.covers[0];
    strict_1.default.ok(cover);
    return { map, patch, cover };
}
function edgeKey(from, to) {
    return [from, to].sort().join('--');
}
function cycleEdgeSet(cycle) {
    const edges = new Set();
    for (let index = 0; index < cycle.length; index += 1) {
        edges.add(edgeKey(cycle[index], cycle[(index + 1) % cycle.length]));
    }
    return edges;
}
function pathCoverEdgeSet(cover) {
    const edges = new Set();
    for (const path of cover.paths) {
        for (let index = 0; index < path.length - 1; index += 1) {
            edges.add(edgeKey(path[index], path[index + 1]));
        }
    }
    return edges;
}
function withoutProfile(value) {
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => key === 'profile' ? undefined : nestedValue));
}
function stepUntilNextApple(state) {
    let current = state;
    const targetApples = current.applesEaten + 1;
    for (let step = 0; step < current.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
        const decision = (0, ai_controller_1.decideAiMove)(current, 'certified-hamiltonian');
        strict_1.default.ok(decision);
        current = (0, game_engine_1.advanceGame)(current, decision.direction, 0, { next: () => 0 });
        if (current.applesEaten >= targetApples) {
            return current;
        }
    }
    return current;
}
function makeV2MutationFeatures(overrides = {}) {
    return {
        candidateId: overrides.candidateId ?? 'candidate-a',
        patchId: overrides.patchId ?? 'rect-0-0-3x3',
        usabilityMode: overrides.usabilityMode ?? 'immediate-locked',
        currentLockedCyclePathLen: overrides.currentLockedCyclePathLen ?? 8,
        candidatePathLenToApple: overrides.candidatePathLenToApple ?? 4,
        transitionPathLength: overrides.transitionPathLength ?? null,
        pathLenImprovement: overrides.pathLenImprovement ?? 4,
        changedCycleEdges: overrides.changedCycleEdges ?? 6,
        rectangleArea: overrides.rectangleArea ?? 9,
        cycleScore: overrides.cycleScore ?? 10,
        cycleFeatures: overrides.cycleFeatures ?? null,
        finalV2MutationScore: overrides.finalV2MutationScore ?? 0
    };
}
(0, testkit_1.describe)('Multi-terminal rectangle patch diagnostics', () => {
    (0, testkit_1.it)('detects a controlled 4-exit rectangle and extracts exactly two terminal pairs', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, fourExitRect);
        strict_1.default.equal(result.fullRectangle, true);
        strict_1.default.equal(result.crossingCount, 4);
        strict_1.default.equal(result.repeatedTerminalCount, 0);
        strict_1.default.equal(result.rejectionReason, 'valid-four-exit-decomposition');
        strict_1.default.ok(result.fourExitDecomposition);
        strict_1.default.deepEqual(result.fourExitDecomposition.terminalPairs, [
            {
                terminalA: 'n-0-1',
                terminalB: 'n-2-0',
                originalPath: ['n-0-1', 'n-0-0', 'n-1-0', 'n-2-0']
            },
            {
                terminalA: 'n-1-1',
                terminalB: 'n-2-1',
                originalPath: ['n-1-1', 'n-2-1']
            }
        ]);
    });
    (0, testkit_1.it)('rejects repeated-terminal 4-exit patches outright', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, { x: 0, y: 0, width: 2, height: 2 });
        strict_1.default.equal(result.crossingCount, 4);
        strict_1.default.equal(result.repeatedTerminalCount, 1);
        strict_1.default.equal(result.fourExitDecomposition, null);
        strict_1.default.equal(result.rejectionReason, 'repeated-terminal');
    });
    (0, testkit_1.it)('uses only Hamiltonian cycle edges for internal degree, not board graph degree', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, fourExitRect);
        const boardOutDegree = map.graph.edges.filter((edge) => edge.from === 'n-1-1').length;
        strict_1.default.ok(result.fourExitDecomposition);
        strict_1.default.equal(result.fourExitDecomposition.internalDegreeByNode['n-1-1'], 1);
        strict_1.default.ok(boardOutDegree > 1);
    });
    (0, testkit_1.it)('requires the internal components to cover every patch vertex', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, fourExitRect);
        const covered = new Set(result.fourExitDecomposition?.terminalPairs.flatMap((pair) => pair.originalPath));
        strict_1.default.ok(result.fourExitDecomposition);
        strict_1.default.equal(result.fourExitDecomposition.coversAllPatchVertices, true);
        strict_1.default.equal(covered.size, result.vertexCount);
    });
    (0, testkit_1.it)('rejects malformed 4-exit decomposition inputs instead of producing terminal pairs', () => {
        const rectNodeSet = new Set(['a', 'b', 'c', 'd']);
        const terminals = ['a', 'b', 'c', 'd'];
        const crossingEdges = terminals.map((insideNode, cycleIndex) => ({
            from: `o-${insideNode}`,
            to: insideNode,
            insideNode,
            outsideNode: `o-${insideNode}`,
            cycleIndex
        }));
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeFourExitDecomposition)(rectNodeSet, terminals, crossingEdges, [
            { from: 'a', to: 'b', cycleIndex: 0 }
        ]);
        strict_1.default.equal(result.decomposition, null);
        strict_1.default.notEqual(result.rejectionReason, 'valid-four-exit-decomposition');
    });
    (0, testkit_1.it)('counts 6-exit and 8-exit rectangles without decomposing them', () => {
        const map = (0, default_maps_1.createDefaultMaps)()[0];
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatches)(map.graph, map.hamiltonianCycle, {
            maxWidth: 8,
            maxHeight: 6,
            maxArea: 30
        });
        const sixExitPatch = result.patches.find((patch) => patch.exitClass === 'six' && patch.repeatedTerminalCount === 0);
        const eightExitPatch = result.patches.find((patch) => patch.exitClass === 'eight' && patch.repeatedTerminalCount === 0);
        strict_1.default.ok(result.aggregate.sixExitRectangles > 0);
        strict_1.default.ok(result.aggregate.eightExitRectangles > 0);
        strict_1.default.ok(sixExitPatch);
        strict_1.default.ok(eightExitPatch);
        strict_1.default.equal(sixExitPatch.fourExitDecomposition, null);
        strict_1.default.equal(sixExitPatch.rejectionReason, 'six-exit-count-only');
        strict_1.default.equal(eightExitPatch.fourExitDecomposition, null);
        strict_1.default.equal(eightExitPatch.rejectionReason, 'eight-exit-count-only');
    });
    (0, testkit_1.it)('reports deterministic aggregate counters for fixed scan options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-6x6', name: 'Multi 6x6', width: 6, height: 6 });
        const options = { maxWidth: 5, maxHeight: 5, maxArea: 20 };
        strict_1.default.deepEqual((0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatches)(map.graph, map.hamiltonianCycle, options), (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatches)(map.graph, map.hamiltonianCycle, options));
    });
    (0, testkit_1.it)('does not mutate graph or cycle inputs', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
        const graphBefore = JSON.stringify(map.graph);
        const cycleBefore = JSON.stringify(map.hamiltonianCycle);
        (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatches)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16
        });
        strict_1.default.equal(JSON.stringify(map.graph), graphBefore);
        strict_1.default.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
    });
    (0, testkit_1.it)('rejects rectangles with missing cells as not full', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-4x4', name: 'Multi 4x4', width: 4, height: 4 });
        const graphWithMissingCell = {
            ...map.graph,
            nodes: map.graph.nodes.filter((node) => node.id !== 'n-1-1')
        };
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(graphWithMissingCell, map.hamiltonianCycle, {
            x: 0,
            y: 0,
            width: 2,
            height: 2
        });
        strict_1.default.equal(result.fullRectangle, false);
        strict_1.default.equal(result.rejectionReason, 'rectangle-not-full');
    });
    (0, testkit_1.it)('controlled 4-exit patch has an alternative same-pairing path cover', () => {
        const { map, patch } = getAlternativeCoverFixture();
        const diagnostics = (0, multi_terminal_patch_diagnostics_1.generateSamePairing4ExitPathCovers)(patch, map.graph, {
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 8,
            maxSolverExpansionsPerPatch: 20_000
        });
        strict_1.default.equal(diagnostics.attempted, true);
        strict_1.default.equal(diagnostics.rejectionReason, 'valid-alternative-cover');
        strict_1.default.ok(diagnostics.coversFound > 0);
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.validateSamePairingPathCover)(patch, map.graph, diagnostics.covers[0]), true);
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.sameAsOriginalCover)(patch, diagnostics.covers[0]), false);
    });
    (0, testkit_1.it)('wrong terminal pairing is rejected by path-cover validation', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const wrongPairing = {
            paths: [cover.paths[1], cover.paths[0]]
        };
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.validateSamePairingPathCover)(patch, map.graph, wrongPairing), false);
    });
    (0, testkit_1.it)('incomplete and missing-vertex covers are rejected', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const incomplete = {
            paths: [[...cover.paths[0].slice(0, -1), cover.paths[0][cover.paths[0].length - 1]], cover.paths[1]]
        };
        incomplete.paths[0].splice(1, 1);
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.validateSamePairingPathCover)(patch, map.graph, incomplete), false);
    });
    (0, testkit_1.it)('duplicate vertices across paths are rejected', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const duplicateAcrossPaths = {
            paths: [[cover.paths[0][0], cover.paths[1][0], ...cover.paths[0].slice(1)], cover.paths[1]]
        };
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.validateSamePairingPathCover)(patch, map.graph, duplicateAcrossPaths), false);
    });
    (0, testkit_1.it)('no-op cover matching the original decomposition is skipped', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
        const patch = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, alternativeCoverRect);
        const originalCover = {
            paths: [
                patch.fourExitDecomposition.terminalPairs[0].originalPath,
                patch.fourExitDecomposition.terminalPairs[1].originalPath
            ]
        };
        const diagnostics = (0, multi_terminal_patch_diagnostics_1.generateSamePairing4ExitPathCovers)(patch, map.graph, {
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 8,
            maxSolverExpansionsPerPatch: 20_000
        });
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.validateSamePairingPathCover)(patch, map.graph, originalCover), true);
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.sameAsOriginalCover)(patch, originalCover), true);
        strict_1.default.ok(diagnostics.noOpCoversSkipped > 0);
    });
    (0, testkit_1.it)('duplicate covers are deduplicated by signature', () => {
        const { map, patch } = getAlternativeCoverFixture();
        const diagnostics = (0, multi_terminal_patch_diagnostics_1.generateSamePairing4ExitPathCovers)(patch, map.graph, {
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 32,
            maxSolverExpansionsPerPatch: 50_000
        });
        const signatures = new Set(diagnostics.covers.map(multi_terminal_patch_diagnostics_1.pathCoverSignature));
        strict_1.default.equal(signatures.size, diagnostics.covers.length);
    });
    (0, testkit_1.it)('budget exhaustion is reported with a tiny expansion budget', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
        const patch = (0, multi_terminal_patch_diagnostics_1.analyzeMultiTerminalRectanglePatch)(map.graph, map.hamiltonianCycle, alternativeCoverRect);
        const diagnostics = (0, multi_terminal_patch_diagnostics_1.generateSamePairing4ExitPathCovers)(patch, map.graph, {
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 8,
            maxSolverExpansionsPerPatch: 1
        });
        strict_1.default.equal(diagnostics.attempted, true);
        strict_1.default.equal(diagnostics.budgetExhausted, true);
        strict_1.default.equal(diagnostics.rejectionReason, 'budget-exhausted');
    });
    (0, testkit_1.it)('6-exit and 8-exit patches remain count-only and produce no path-cover diagnostics', () => {
        const map = (0, default_maps_1.createDefaultMaps)()[0];
        const result = (0, multi_terminal_patch_diagnostics_1.analyzeSamePairing4ExitPathCovers)(map.graph, map.hamiltonianCycle, {
            maxWidth: 8,
            maxHeight: 6,
            maxArea: 30,
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 4,
            maxSolverExpansionsPerPatch: 1_000
        });
        strict_1.default.ok(result.patchScan.aggregate.sixExitRectangles > 0);
        strict_1.default.ok(result.patchScan.aggregate.eightExitRectangles > 0);
        strict_1.default.equal(result.patches.length, result.patchScan.aggregate.validFourExitDecompositions);
        strict_1.default.equal(result.patches.every((patch) => patch.terminalPairs.length === 2), true);
    });
    (0, testkit_1.it)('same-pairing path-cover diagnostics do not mutate graph or cycle inputs', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-cover-4x4', name: 'Multi Cover 4x4', width: 4, height: 4 });
        const graphBefore = JSON.stringify(map.graph);
        const cycleBefore = JSON.stringify(map.hamiltonianCycle);
        (0, multi_terminal_patch_diagnostics_1.analyzeSamePairing4ExitPathCovers)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9
        });
        strict_1.default.equal(JSON.stringify(map.graph), graphBefore);
        strict_1.default.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
    });
    (0, testkit_1.it)('same-pairing path-cover diagnostics are deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-cover-6x6', name: 'Multi Cover 6x6', width: 6, height: 6 });
        const options = {
            maxWidth: 5,
            maxHeight: 5,
            maxArea: 20,
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 4,
            maxSolverExpansionsPerPatch: 5_000
        };
        const first = (0, multi_terminal_patch_diagnostics_1.analyzeSamePairing4ExitPathCovers)(map.graph, map.hamiltonianCycle, options);
        const second = (0, multi_terminal_patch_diagnostics_1.analyzeSamePairing4ExitPathCovers)(map.graph, map.hamiltonianCycle, options);
        strict_1.default.equal(first.profile.detectionMs >= 0, true);
        strict_1.default.equal(first.profile.pathCoverSolvingMs >= 0, true);
        strict_1.default.deepEqual(withoutProfile(second), withoutProfile(first));
    });
    (0, testkit_1.it)('edge-set splice preserves outside edges', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const candidate = (0, multi_terminal_patch_diagnostics_1.spliceMultiTerminalSamePairingCoverByEdges)(map.graph, map.hamiltonianCycle, patch, cover);
        strict_1.default.ok(candidate);
        const originalEdges = cycleEdgeSet(map.hamiltonianCycle);
        const candidateEdges = cycleEdgeSet(candidate);
        const oldInternalEdges = new Set(patch.fourExitDecomposition.internalEdges.map((edge) => edgeKey(edge.from, edge.to)));
        for (const edge of originalEdges) {
            if (!oldInternalEdges.has(edge)) {
                strict_1.default.equal(candidateEdges.has(edge), true);
            }
        }
    });
    (0, testkit_1.it)('edge-set splice removes old internal edges not present in the replacement cover', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const candidate = (0, multi_terminal_patch_diagnostics_1.spliceMultiTerminalSamePairingCoverByEdges)(map.graph, map.hamiltonianCycle, patch, cover);
        strict_1.default.ok(candidate);
        const candidateEdges = cycleEdgeSet(candidate);
        const replacementEdges = pathCoverEdgeSet(cover);
        for (const edge of patch.fourExitDecomposition.internalEdges) {
            const key = edgeKey(edge.from, edge.to);
            if (!replacementEdges.has(key)) {
                strict_1.default.equal(candidateEdges.has(key), false);
            }
        }
    });
    (0, testkit_1.it)('edge-set splice adds replacement cover edges', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const candidate = (0, multi_terminal_patch_diagnostics_1.spliceMultiTerminalSamePairingCoverByEdges)(map.graph, map.hamiltonianCycle, patch, cover);
        strict_1.default.ok(candidate);
        const candidateEdges = cycleEdgeSet(candidate);
        for (const edge of pathCoverEdgeSet(cover)) {
            strict_1.default.equal(candidateEdges.has(edge), true);
        }
    });
    (0, testkit_1.it)('degree mismatch is rejected during cycle reconstruction', () => {
        const invalidEdges = [
            { a: 'a', b: 'b' },
            { a: 'b', b: 'c' }
        ];
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.reconstructCycleFromDegreeTwoEdges)(invalidEdges, 'a'), null);
    });
    (0, testkit_1.it)('subtour or multiple-cycle edge sets are rejected during reconstruction', () => {
        const subtourEdges = [
            { a: 'a', b: 'b' },
            { a: 'b', b: 'c' },
            { a: 'c', b: 'a' },
            { a: 'd', b: 'e' },
            { a: 'e', b: 'f' },
            { a: 'f', b: 'd' }
        ];
        strict_1.default.equal((0, multi_terminal_patch_diagnostics_1.reconstructCycleFromDegreeTwoEdges)(subtourEdges, 'a'), null);
    });
    (0, testkit_1.it)('reconstructed V2 splice candidate has the same node set as the old cycle', () => {
        const { map, patch, cover } = getAlternativeCoverFixture();
        const candidate = (0, multi_terminal_patch_diagnostics_1.spliceMultiTerminalSamePairingCoverByEdges)(map.graph, map.hamiltonianCycle, patch, cover);
        strict_1.default.ok(candidate);
        strict_1.default.deepEqual(new Set(candidate), new Set(map.hamiltonianCycle));
    });
    (0, testkit_1.it)('graph-valid V2 splice candidates pass validateHamiltonianCycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-splice-4x4', name: 'Multi Splice 4x4', width: 4, height: 4 });
        const result = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 8,
            maxSolverExpansionsPerPatch: 20_000
        });
        strict_1.default.ok(result.candidates.length > 0);
        strict_1.default.equal(result.aggregate.graphValidCandidates, result.candidates.length);
        strict_1.default.equal(result.candidates.every((candidate) => (0, map_validator_1.validateHamiltonianCycle)(map.graph, candidate.cycle)), true);
    });
    (0, testkit_1.it)('V2 splice candidates are deduplicated by global edge signature', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-splice-6x6', name: 'Multi Splice 6x6', width: 6, height: 6 });
        const result = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 6,
            maxHeight: 6,
            maxArea: 24,
            maxPatchArea4Exit: 24,
            maxCoversPerPatch: 64,
            maxSolverExpansionsPerPatch: 100_000
        });
        const signatures = new Set([...result.candidates.map((candidate) => [...cycleEdgeSet(candidate.cycle)].sort().join('|'))]);
        strict_1.default.equal(signatures.size, result.candidates.length);
        strict_1.default.equal(result.candidateDiagnostics.filter((diagnostic) => diagnostic.rejectionReason === 'duplicate-candidate').length, result.aggregate.duplicateCandidatesSkipped);
    });
    (0, testkit_1.it)('V2 splice diagnostics do not mutate graph or cycle inputs', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-splice-4x4', name: 'Multi Splice 4x4', width: 4, height: 4 });
        const graphBefore = JSON.stringify(map.graph);
        const cycleBefore = JSON.stringify(map.hamiltonianCycle);
        (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9
        });
        strict_1.default.equal(JSON.stringify(map.graph), graphBefore);
        strict_1.default.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
    });
    (0, testkit_1.it)('V2 splice diagnostics are deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-splice-6x6', name: 'Multi Splice 6x6', width: 6, height: 6 });
        const options = {
            maxWidth: 5,
            maxHeight: 5,
            maxArea: 20,
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 4,
            maxSolverExpansionsPerPatch: 5_000
        };
        const first = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, options);
        const second = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, options);
        strict_1.default.equal(first.profile.totalMs >= 0, true);
        strict_1.default.equal(first.profile.splicingValidationMs >= 0, true);
        strict_1.default.deepEqual(withoutProfile(second), withoutProfile(first));
    });
    (0, testkit_1.it)('graph-valid V2 candidate with validLockedCertificate and appleForward is immediate-locked', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const candidate = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9
        }).candidates[0];
        strict_1.default.ok(candidate);
        const classification = (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidateForSnake)(state, candidate);
        strict_1.default.equal(classification.graphValid, true);
        strict_1.default.equal(classification.immediateLocked, true);
        strict_1.default.equal(classification.usabilityMode, 'immediate-locked');
        strict_1.default.equal(classification.reason, 'immediate-locked');
    });
    (0, testkit_1.it)('graph-valid V2 candidate without immediate lock but with certified transition is transition-reachable', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const state = stepUntilNextApple(initial);
        const candidate = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9
        }).candidates[0];
        strict_1.default.ok(candidate);
        const classification = (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidateForSnake)(state, candidate, {
            transitionOptions: { maxPaths: 64, slack: 6 }
        });
        strict_1.default.equal(classification.graphValid, true);
        strict_1.default.equal(classification.immediateLocked, false);
        strict_1.default.equal(classification.transitionReachable, true);
        strict_1.default.equal(classification.usabilityMode, 'transition-valid');
        strict_1.default.equal(classification.reason, 'transition-valid');
    });
    (0, testkit_1.it)('graph-valid V2 candidate with neither immediate lock nor transition is unusable', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const invalidBodyState = {
            ...initial,
            appleNodeId: null,
            snake: {
                ...initial.snake,
                segments: ['n-0-0', 'n-2-2']
            }
        };
        const candidate = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9
        }).candidates[0];
        strict_1.default.ok(candidate);
        const classification = (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidateForSnake)(invalidBodyState, candidate);
        strict_1.default.equal(classification.graphValid, true);
        strict_1.default.equal(classification.usableForSnake, false);
        strict_1.default.equal(classification.usabilityMode, 'unusable');
        strict_1.default.equal(classification.reason, 'no-current-apple-for-transition');
    });
    (0, testkit_1.it)('appleForward failure blocks immediate-locked V2 use', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const state = {
            ...initial,
            appleNodeId: initial.snake.segments[0]
        };
        const candidate = (0, multi_terminal_patch_diagnostics_1.generateV2FourExitSpliceCandidates)(map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9
        }).candidates[0];
        strict_1.default.ok(candidate);
        const classification = (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidateForSnake)(state, candidate, {
            transitionOptions: { maxPaths: 4, slack: 0 }
        });
        strict_1.default.equal(classification.lockedCertificateValid, true);
        strict_1.default.equal(classification.appleForwardValid, false);
        strict_1.default.equal(classification.usableForSnake, false);
        strict_1.default.equal(classification.reason, 'immediate-locked-apple-forward-failed');
    });
    (0, testkit_1.it)('V2 scoring ranks improving candidates above non-improving candidates', () => {
        const improving = makeV2MutationFeatures({ candidateId: 'improving', pathLenImprovement: 3 });
        const nonImproving = makeV2MutationFeatures({ candidateId: 'flat', pathLenImprovement: 0 });
        strict_1.default.deepEqual([nonImproving, improving].sort(multi_terminal_patch_diagnostics_1.compareV2FourExitMutationFeaturesForRanking).map((feature) => feature.candidateId), ['improving', 'flat']);
    });
    (0, testkit_1.it)('V2 scoring prefers immediate-locked over transition-valid on equal improvement', () => {
        const immediate = makeV2MutationFeatures({
            candidateId: 'immediate',
            usabilityMode: 'immediate-locked',
            transitionPathLength: null,
            pathLenImprovement: 2
        });
        const transition = makeV2MutationFeatures({
            candidateId: 'transition',
            usabilityMode: 'transition-valid',
            candidatePathLenToApple: null,
            transitionPathLength: 2,
            pathLenImprovement: 2
        });
        strict_1.default.deepEqual([transition, immediate].sort(multi_terminal_patch_diagnostics_1.compareV2FourExitMutationFeaturesForRanking).map((feature) => feature.candidateId), ['immediate', 'transition']);
    });
    (0, testkit_1.it)('V2 Snake diagnostics do not mutate graph, cycle, or game state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-snake-4x4', name: 'Multi Snake 4x4', width: 4, height: 4 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const graphBefore = JSON.stringify(map.graph);
        const cycleBefore = JSON.stringify(map.hamiltonianCycle);
        const stateBefore = JSON.stringify(state);
        (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidatesForSnake)(state, map.graph, map.hamiltonianCycle, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 9,
            transitionOptions: { maxPaths: 8, slack: 2 }
        });
        strict_1.default.equal(JSON.stringify(map.graph), graphBefore);
        strict_1.default.equal(JSON.stringify(map.hamiltonianCycle), cycleBefore);
        strict_1.default.equal(JSON.stringify(state), stateBefore);
    });
    (0, testkit_1.it)('V2 Snake diagnostics are deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'multi-snake-6x6', name: 'Multi Snake 6x6', width: 6, height: 6 });
        const state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const options = {
            maxWidth: 5,
            maxHeight: 5,
            maxArea: 20,
            maxPatchArea4Exit: 9,
            maxCoversPerPatch: 4,
            maxSolverExpansionsPerPatch: 5_000,
            transitionOptions: { maxPaths: 8, slack: 2 }
        };
        const first = (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidatesForSnake)(state, map.graph, map.hamiltonianCycle, options);
        const second = (0, multi_terminal_patch_diagnostics_1.classifyV2FourExitSpliceCandidatesForSnake)(state, map.graph, map.hamiltonianCycle, options);
        strict_1.default.equal(first.profile.transitionSearchMs >= 0, true);
        strict_1.default.deepEqual(withoutProfile(second), withoutProfile(first));
    });
});
