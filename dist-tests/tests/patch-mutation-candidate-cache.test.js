"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const patch_mutation_candidate_cache_1 = require("../src/core/patch-mutation-candidate-cache");
const game_state_1 = require("../src/core/game-state");
const ai_controller_1 = require("../src/core/ai-controller");
const game_engine_1 = require("../src/core/game-engine");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const certified_patch_mutation_evaluation_1 = require("../src/core/certified-patch-mutation-evaluation");
const two_terminal_patch_mutation_1 = require("../src/core/two-terminal-patch-mutation");
const testkit_1 = require("./testkit");
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
function stripCacheVolatileFields(value) {
    const timingAndCacheKeys = new Set([
        'patchGenerationMs',
        'v1GenerationMs',
        'v1CertificationMs',
        'v1TransitionSearchMs',
        'v1ScoringMs',
        'v2DetectionMs',
        'v2PathCoverSolvingMs',
        'v2SplicingValidationMs',
        'v2GenerationMs',
        'v2CertificationMs',
        'v2TransitionSearchMs',
        'v2ScoringMs',
        'v1CandidateCacheHits',
        'v1CandidateCacheMisses',
        'cachedV1GraphCandidates',
        'v2CandidateCacheHits',
        'v2CandidateCacheMisses',
        'cachedV2GraphCandidates',
        'profile'
    ]);
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => timingAndCacheKeys.has(key) ? undefined : nestedValue));
}
function selectedSourceSequence(result) {
    return result.diagnostics.switchAttemptSummaries.map((summary) => ({
        source: summary.selectedCandidateSource,
        selectedCycleId: summary.selectedCycleId,
        selectedPathLen: summary.selectedPathLen,
        usedTransition: summary.selectedCandidateUsedTransitionPlan
    }));
}
(0, testkit_1.describe)('Patch mutation candidate cache', () => {
    (0, testkit_1.it)('uses a stable graph signature for the same graph and changes when the graph changes', () => {
        const map4 = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const map6 = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-6x4', name: 'Rect 6x4', width: 6, height: 4 });
        strict_1.default.equal((0, patch_mutation_candidate_cache_1.buildGraphSignature)(map4.graph), (0, patch_mutation_candidate_cache_1.buildGraphSignature)(map4.graph));
        strict_1.default.notEqual((0, patch_mutation_candidate_cache_1.buildGraphSignature)(map4.graph), (0, patch_mutation_candidate_cache_1.buildGraphSignature)(map6.graph));
    });
    (0, testkit_1.it)('V1 cache keys include graph, cycle, generation limits, focus, and path-cache options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const base = (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                maxPatchRectsScanned: 20,
                maxPatchCandidates: 5,
                focusNodeIds: ['n-1-1'],
                focusPadding: 1,
                pathCacheOptions: { maxArea: 16, maxPathsPerTerminalPair: 8, maxExpansions: 200, includeReverseLookup: true }
            }
        });
        strict_1.default.equal(base, (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                maxPatchRectsScanned: 20,
                maxPatchCandidates: 5,
                focusNodeIds: ['n-1-1'],
                focusPadding: 1,
                pathCacheOptions: { maxArea: 16, maxPathsPerTerminalPair: 8, maxExpansions: 200, includeReverseLookup: true }
            }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: [...map.hamiltonianCycle].reverse(),
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchRectsScanned: 20, maxPatchCandidates: 5 }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 3, maxHeight: 4, maxArea: 16, maxPatchRectsScanned: 20, maxPatchCandidates: 5 }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                maxPatchRectsScanned: 20,
                maxPatchCandidates: 5,
                focusNodeIds: ['n-2-2'],
                focusPadding: 1
            }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                maxPatchRectsScanned: 20,
                maxPatchCandidates: 5,
                pathCacheOptions: { maxArea: 12, maxPathsPerTerminalPair: 8, maxExpansions: 200, includeReverseLookup: true }
            }
        }));
        strict_1.default.notEqual((0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                patchRectangleSearchMode: 'arc-chunk',
                arcChunkSize: 8,
                arcChunkStride: 4,
                arcGrowShrinkRadius: 1,
                maxTargetedRectangles: 2,
                rectangles: [
                    { x: 0, y: 0, width: 2, height: 2 },
                    { x: 1, y: 1, width: 2, height: 2 }
                ]
            }
        }), (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                patchRectangleSearchMode: 'arc-chunk',
                arcChunkSize: 8,
                arcChunkStride: 4,
                arcGrowShrinkRadius: 1,
                maxTargetedRectangles: 2,
                rectangles: [
                    { x: 1, y: 1, width: 2, height: 2 },
                    { x: 0, y: 0, width: 2, height: 2 }
                ]
            }
        }));
    });
    (0, testkit_1.it)('V1 cache keys ignore state-only options that do not affect graph candidate generation', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const keyA = (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, transitionOptions: { maxPaths: 1, slack: 0 } }
        });
        const keyB = (0, patch_mutation_candidate_cache_1.buildV1PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, transitionOptions: { maxPaths: 99, slack: 9 } }
        });
        strict_1.default.equal(keyA, keyB);
    });
    (0, testkit_1.it)('V2 cache keys include graph generation options and ignore transition-search options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const base = (0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                maxPatchArea4Exit: 16,
                maxPatchRectsScanned: 50,
                maxV2Candidates: 10,
                maxSolverExpansionsPerPatch: 1_000,
                maxCoversPerPatch: 4,
                focusNodeIds: ['n-1-1'],
                focusPadding: 1
            }
        });
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 4, maxHeight: 4, maxArea: 12, maxPatchArea4Exit: 16 }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 12 }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: [...map.hamiltonianCycle].reverse(),
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 16 }
        }));
        strict_1.default.notEqual(base, (0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: {
                maxWidth: 4,
                maxHeight: 4,
                maxArea: 16,
                maxPatchArea4Exit: 16,
                patchRectangleSearchMode: 'arc-chunk',
                arcChunkSize: 8,
                arcChunkStride: 4,
                arcGrowShrinkRadius: 1,
                maxTargetedRectangles: 12,
                rectangles: [{ x: 0, y: 0, width: 3, height: 3 }]
            }
        }));
        strict_1.default.equal((0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 16, transitionOptions: { maxPaths: 1 } }
        }), (0, patch_mutation_candidate_cache_1.buildV2PatchCandidateCacheKey)({
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 16, transitionOptions: { maxPaths: 64 } }
        }));
    });
    (0, testkit_1.it)('records V1 cache misses and hits while preserving candidate ordering', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const cache = new patch_mutation_candidate_cache_1.PatchMutationCandidateCache();
        const options = { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchCandidates: 5 };
        const first = (0, patch_mutation_candidate_cache_1.getOrCreateV1GraphCandidates)({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });
        const second = (0, patch_mutation_candidate_cache_1.getOrCreateV1GraphCandidates)({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });
        strict_1.default.equal(first.cacheHit, false);
        strict_1.default.equal(second.cacheHit, true);
        strict_1.default.deepEqual(second.result.candidates.map((candidate) => candidate.cycle.join('|')), first.result.candidates.map((candidate) => candidate.cycle.join('|')));
        strict_1.default.deepEqual(cache.getStats(), { hits: 1, misses: 1, entries: 1 });
    });
    (0, testkit_1.it)('records V2 cache misses and hits while preserving candidate ordering', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const cache = new patch_mutation_candidate_cache_1.PatchMutationCandidateCache();
        const options = {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxPatchArea4Exit: 16,
            maxPatchRectsScanned: 50,
            maxV2Candidates: 5,
            maxCoversPerPatch: 8
        };
        const first = (0, patch_mutation_candidate_cache_1.getOrCreateV2GraphCandidates)({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });
        const second = (0, patch_mutation_candidate_cache_1.getOrCreateV2GraphCandidates)({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });
        strict_1.default.equal(first.cacheHit, false);
        strict_1.default.equal(second.cacheHit, true);
        strict_1.default.deepEqual(second.result.candidates.map((candidate) => candidate.coverSignature), first.result.candidates.map((candidate) => candidate.coverSignature));
        strict_1.default.deepEqual(cache.getStats(), { hits: 1, misses: 1, entries: 1 });
    });
    (0, testkit_1.it)('clear removes entries and resets cache stats', () => {
        const cache = new patch_mutation_candidate_cache_1.PatchMutationCandidateCache();
        cache.set('x', { value: 1 });
        strict_1.default.deepEqual(cache.getStats(), { hits: 0, misses: 0, entries: 1 });
        strict_1.default.deepEqual(cache.get('x'), { value: 1 });
        cache.clear();
        strict_1.default.deepEqual(cache.getStats(), { hits: 0, misses: 0, entries: 0 });
        strict_1.default.equal(cache.get('x'), null);
        strict_1.default.deepEqual(cache.getStats(), { hits: 0, misses: 1, entries: 0 });
    });
    (0, testkit_1.it)('cache hits still rerun locked-certificate and appleForward certification for the current state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const cache = new patch_mutation_candidate_cache_1.PatchMutationCandidateCache();
        const generationOptions = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
        const first = (0, patch_mutation_candidate_cache_1.getOrCreateV1GraphCandidates)({
            cache,
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: generationOptions
        });
        const initial = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        const initialClassification = (0, two_terminal_patch_mutation_1.classifyGeneratedPatchMutationCandidatesForSnake)(initial, first.result, first.result.candidates, { ...generationOptions, transitionOptions: { maxPaths: 8, slack: 2 } });
        let later = initial;
        later = stepUntilNextApple(later);
        later = stepUntilNextApple(later);
        later = stepUntilNextApple(later);
        const second = (0, patch_mutation_candidate_cache_1.getOrCreateV1GraphCandidates)({
            cache,
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: generationOptions
        });
        const laterClassification = (0, two_terminal_patch_mutation_1.classifyGeneratedPatchMutationCandidatesForSnake)(later, second.result, second.result.candidates, { ...generationOptions, transitionOptions: { maxPaths: 8, slack: 2 } });
        strict_1.default.equal(second.cacheHit, true);
        strict_1.default.equal(initialClassification.aggregate.rejectedByLockedCertificate, 0);
        strict_1.default.equal(laterClassification.aggregate.rejectedByLockedCertificate > 0, true);
        strict_1.default.equal(laterClassification.aggregate.usableCandidates < initialClassification.aggregate.usableCandidates, true);
    });
    (0, testkit_1.it)('cache hits still rerun certified transition search for transition-backed candidates', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const cache = new patch_mutation_candidate_cache_1.PatchMutationCandidateCache();
        const generationOptions = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
        let state = (0, game_state_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
        state = stepUntilNextApple(state);
        state = stepUntilNextApple(state);
        state = stepUntilNextApple(state);
        (0, patch_mutation_candidate_cache_1.getOrCreateV1GraphCandidates)({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options: generationOptions });
        const second = (0, patch_mutation_candidate_cache_1.getOrCreateV1GraphCandidates)({
            cache,
            mapId: map.id,
            graph: map.graph,
            cycle: map.hamiltonianCycle,
            options: generationOptions
        });
        const result = (0, two_terminal_patch_mutation_1.classifyGeneratedPatchMutationCandidatesForSnake)(state, second.result, second.result.candidates, { ...generationOptions, transitionOptions: { maxPaths: 64, slack: 6 } });
        strict_1.default.equal(second.cacheHit, true);
        strict_1.default.equal(result.aggregate.transitionReachableCandidates > 0, true);
        strict_1.default.equal(result.profile.transitionSearchMs >= 0, true);
    });
    (0, testkit_1.it)('cache-enabled and cache-disabled evaluations produce the same certified decisions for fixed seeds', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
        const commonOptions = {
            maxSteps: 80,
            seed: 11,
            initialAppleSeed: 0.37,
            patchOptions: {
                enablePatchMutation: true,
                enableV2PatchMutation: true,
                maxV2FillRatio: 1,
                maxPatchWidth: 4,
                maxPatchHeight: 4,
                maxPatchArea: 16,
                maxV2PatchArea: 16,
                maxV2RectsScanned: 80,
                maxV2Candidates: 20,
                maxV2TransitionPathsPerCandidate: 8,
                maxV2TransitionSlack: 2
            }
        };
        const uncached = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-library-v1-v2-patch-mutation', {
            ...commonOptions,
            patchOptions: {
                ...commonOptions.patchOptions,
                enablePatchMutationCandidateCache: false
            }
        });
        const cached = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-library-v1-v2-patch-mutation', {
            ...commonOptions,
            patchOptions: {
                ...commonOptions.patchOptions,
                enablePatchMutationCandidateCache: true,
                patchMutationCandidateCache: new patch_mutation_candidate_cache_1.PatchMutationCandidateCache()
            }
        });
        strict_1.default.equal(cached.invariantFailures, 0);
        strict_1.default.equal(uncached.invariantFailures, 0);
        strict_1.default.deepEqual(selectedSourceSequence(cached), selectedSourceSequence(uncached));
        strict_1.default.deepEqual(stripCacheVolatileFields(cached), stripCacheVolatileFields(uncached));
    });
});
