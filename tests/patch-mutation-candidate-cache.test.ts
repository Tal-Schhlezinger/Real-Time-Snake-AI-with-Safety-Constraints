import assert from 'node:assert/strict';
import {
  buildGraphSignature,
  buildV1PatchCandidateCacheKey,
  buildV2PatchCandidateCacheKey,
  getOrCreateV1GraphCandidates,
  getOrCreateV2GraphCandidates,
  PatchMutationCandidateCache
} from '../src/core/patch-mutation-candidate-cache';
import { createInitialGameState } from '../src/core/game-state';
import { decideAiMove } from '../src/core/ai-controller';
import { advanceGame } from '../src/core/game-engine';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { evaluateCertifiedVariant } from '../src/core/certified-patch-mutation-evaluation';
import { classifyGeneratedPatchMutationCandidatesForSnake } from '../src/core/two-terminal-patch-mutation';
import type { GameState } from '../src/core/types';
import { describe, it } from './testkit';

function stepUntilNextApple(state: GameState): GameState {
  let current = state;
  const targetApples = state.applesEaten + 1;

  for (let step = 0; step < state.map.graph.nodes.length * 4 && !current.isOver; step += 1) {
    const decision = decideAiMove(current, 'certified-hamiltonian');
    assert.ok(decision);
    current = advanceGame(current, decision.direction, 0, { next: () => 0 });
    if (current.applesEaten >= targetApples) {
      return current;
    }
  }

  return current;
}

function stripCacheVolatileFields<T>(value: T): T {
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

  return JSON.parse(JSON.stringify(value, (key, nestedValue) =>
    timingAndCacheKeys.has(key) ? undefined : nestedValue
  )) as T;
}

function selectedSourceSequence(result: ReturnType<typeof evaluateCertifiedVariant>): unknown[] {
  return result.diagnostics.switchAttemptSummaries.map((summary) => ({
    source: summary.selectedCandidateSource,
    selectedCycleId: summary.selectedCycleId,
    selectedPathLen: summary.selectedPathLen,
    usedTransition: summary.selectedCandidateUsedTransitionPlan
  }));
}

describe('Patch mutation candidate cache', () => {
  it('uses a stable graph signature for the same graph and changes when the graph changes', () => {
    const map4 = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const map6 = createRectangularSavedMap({ id: 'rect-6x4', name: 'Rect 6x4', width: 6, height: 4 });

    assert.equal(buildGraphSignature(map4.graph), buildGraphSignature(map4.graph));
    assert.notEqual(buildGraphSignature(map4.graph), buildGraphSignature(map6.graph));
  });

  it('V1 cache keys include graph, cycle, generation limits, focus, and path-cache options', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const base = buildV1PatchCandidateCacheKey({
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

    assert.equal(
      base,
      buildV1PatchCandidateCacheKey({
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
      })
    );
    assert.notEqual(
      base,
      buildV1PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: [...map.hamiltonianCycle].reverse(),
        options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchRectsScanned: 20, maxPatchCandidates: 5 }
      })
    );
    assert.notEqual(
      base,
      buildV1PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: map.hamiltonianCycle,
        options: { maxWidth: 3, maxHeight: 4, maxArea: 16, maxPatchRectsScanned: 20, maxPatchCandidates: 5 }
      })
    );
    assert.notEqual(
      base,
      buildV1PatchCandidateCacheKey({
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
      })
    );
    assert.notEqual(
      base,
      buildV1PatchCandidateCacheKey({
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
      })
    );
    assert.notEqual(
      buildV1PatchCandidateCacheKey({
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
        } as never
      }),
      buildV1PatchCandidateCacheKey({
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
        } as never
      })
    );
  });

  it('V1 cache keys ignore state-only options that do not affect graph candidate generation', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const keyA = buildV1PatchCandidateCacheKey({
      mapId: map.id,
      graph: map.graph,
      cycle: map.hamiltonianCycle,
      options: { maxWidth: 4, maxHeight: 4, maxArea: 16, transitionOptions: { maxPaths: 1, slack: 0 } } as never
    });
    const keyB = buildV1PatchCandidateCacheKey({
      mapId: map.id,
      graph: map.graph,
      cycle: map.hamiltonianCycle,
      options: { maxWidth: 4, maxHeight: 4, maxArea: 16, transitionOptions: { maxPaths: 99, slack: 9 } } as never
    });

    assert.equal(keyA, keyB);
  });

  it('V2 cache keys include graph generation options and ignore transition-search options', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const base = buildV2PatchCandidateCacheKey({
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

    assert.notEqual(
      base,
      buildV2PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: map.hamiltonianCycle,
        options: { maxWidth: 4, maxHeight: 4, maxArea: 12, maxPatchArea4Exit: 16 }
      })
    );
    assert.notEqual(
      base,
      buildV2PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: map.hamiltonianCycle,
        options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 12 }
      })
    );
    assert.notEqual(
      base,
      buildV2PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: [...map.hamiltonianCycle].reverse(),
        options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 16 }
      })
    );
    assert.notEqual(
      base,
      buildV2PatchCandidateCacheKey({
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
        } as never
      })
    );
    assert.equal(
      buildV2PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: map.hamiltonianCycle,
        options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 16, transitionOptions: { maxPaths: 1 } } as never
      }),
      buildV2PatchCandidateCacheKey({
        mapId: map.id,
        graph: map.graph,
        cycle: map.hamiltonianCycle,
        options: { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchArea4Exit: 16, transitionOptions: { maxPaths: 64 } } as never
      })
    );
  });

  it('records V1 cache misses and hits while preserving candidate ordering', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const cache = new PatchMutationCandidateCache();
    const options = { maxWidth: 4, maxHeight: 4, maxArea: 16, maxPatchCandidates: 5 };
    const first = getOrCreateV1GraphCandidates({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });
    const second = getOrCreateV1GraphCandidates({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.deepEqual(
      second.result.candidates.map((candidate) => candidate.cycle.join('|')),
      first.result.candidates.map((candidate) => candidate.cycle.join('|'))
    );
    assert.deepEqual(cache.getStats(), { hits: 1, misses: 1, entries: 1 });
  });

  it('records V2 cache misses and hits while preserving candidate ordering', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const cache = new PatchMutationCandidateCache();
    const options = {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxPatchArea4Exit: 16,
      maxPatchRectsScanned: 50,
      maxV2Candidates: 5,
      maxCoversPerPatch: 8
    };
    const first = getOrCreateV2GraphCandidates({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });
    const second = getOrCreateV2GraphCandidates({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.deepEqual(
      second.result.candidates.map((candidate) => candidate.coverSignature),
      first.result.candidates.map((candidate) => candidate.coverSignature)
    );
    assert.deepEqual(cache.getStats(), { hits: 1, misses: 1, entries: 1 });
  });

  it('clear removes entries and resets cache stats', () => {
    const cache = new PatchMutationCandidateCache();

    cache.set('x', { value: 1 });
    assert.deepEqual(cache.getStats(), { hits: 0, misses: 0, entries: 1 });
    assert.deepEqual(cache.get('x'), { value: 1 });
    cache.clear();

    assert.deepEqual(cache.getStats(), { hits: 0, misses: 0, entries: 0 });
    assert.equal(cache.get('x'), null);
    assert.deepEqual(cache.getStats(), { hits: 0, misses: 1, entries: 0 });
  });

  it('cache hits still rerun locked-certificate and appleForward certification for the current state', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const cache = new PatchMutationCandidateCache();
    const generationOptions = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
    const first = getOrCreateV1GraphCandidates({
      cache,
      mapId: map.id,
      graph: map.graph,
      cycle: map.hamiltonianCycle,
      options: generationOptions
    });
    const initial = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    const initialClassification = classifyGeneratedPatchMutationCandidatesForSnake(
      initial,
      first.result,
      first.result.candidates,
      { ...generationOptions, transitionOptions: { maxPaths: 8, slack: 2 } }
    );

    let later = initial;
    later = stepUntilNextApple(later);
    later = stepUntilNextApple(later);
    later = stepUntilNextApple(later);

    const second = getOrCreateV1GraphCandidates({
      cache,
      mapId: map.id,
      graph: map.graph,
      cycle: map.hamiltonianCycle,
      options: generationOptions
    });
    const laterClassification = classifyGeneratedPatchMutationCandidatesForSnake(
      later,
      second.result,
      second.result.candidates,
      { ...generationOptions, transitionOptions: { maxPaths: 8, slack: 2 } }
    );

    assert.equal(second.cacheHit, true);
    assert.equal(initialClassification.aggregate.rejectedByLockedCertificate, 0);
    assert.equal(laterClassification.aggregate.rejectedByLockedCertificate > 0, true);
    assert.equal(laterClassification.aggregate.usableCandidates < initialClassification.aggregate.usableCandidates, true);
  });

  it('cache hits still rerun certified transition search for transition-backed candidates', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
    const cache = new PatchMutationCandidateCache();
    const generationOptions = { maxWidth: 4, maxHeight: 4, maxArea: 16 };
    let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    state = stepUntilNextApple(state);
    state = stepUntilNextApple(state);
    state = stepUntilNextApple(state);

    getOrCreateV1GraphCandidates({ cache, mapId: map.id, graph: map.graph, cycle: map.hamiltonianCycle, options: generationOptions });
    const second = getOrCreateV1GraphCandidates({
      cache,
      mapId: map.id,
      graph: map.graph,
      cycle: map.hamiltonianCycle,
      options: generationOptions
    });
    const result = classifyGeneratedPatchMutationCandidatesForSnake(
      state,
      second.result,
      second.result.candidates,
      { ...generationOptions, transitionOptions: { maxPaths: 64, slack: 6 } }
    );

    assert.equal(second.cacheHit, true);
    assert.equal(result.aggregate.transitionReachableCandidates > 0, true);
    assert.equal(result.profile.transitionSearchMs >= 0, true);
  });

  it('cache-enabled and cache-disabled evaluations produce the same certified decisions for fixed seeds', () => {
    const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
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
    const uncached = evaluateCertifiedVariant(map, 'certified-library-v1-v2-patch-mutation', {
      ...commonOptions,
      patchOptions: {
        ...commonOptions.patchOptions,
        enablePatchMutationCandidateCache: false
      }
    });
    const cached = evaluateCertifiedVariant(map, 'certified-library-v1-v2-patch-mutation', {
      ...commonOptions,
      patchOptions: {
        ...commonOptions.patchOptions,
        enablePatchMutationCandidateCache: true,
        patchMutationCandidateCache: new PatchMutationCandidateCache()
      }
    });

    assert.equal(cached.invariantFailures, 0);
    assert.equal(uncached.invariantFailures, 0);
    assert.deepEqual(selectedSourceSequence(cached), selectedSourceSequence(uncached));
    assert.deepEqual(stripCacheVolatileFields(cached), stripCacheVolatileFields(uncached));
  });
});
