import { cycleEdgeSignature } from './cycle-library.js';
import {
  generateV2FourExitSpliceCandidatesFromRectangles,
  generateV2FourExitSpliceCandidates,
  type SamePairing4ExitPathCoverOptions,
  type V2FourExitSpliceGenerationResult
} from './multi-terminal-patch-diagnostics.js';
import { generateRectanglePatchMutationCandidatesFromRectangles } from './head-apple-rectangle-diagnostics.js';
import {
  generateRectanglePatchMutationCandidates,
  type RectanglePatchRect,
  type RectanglePatchMutationGenerationOptions,
  type RectanglePatchMutationGenerationResult
} from './two-terminal-patch-mutation.js';
import type { GraphSnapshot, HamiltonianCycle, NodeId } from './types.js';

type CacheMode = 'v1' | 'v2';

export type PatchMutationCandidateCacheStats = {
  hits: number;
  misses: number;
  entries: number;
};

export type PatchMutationCandidateCacheLookup<T> = {
  key: string;
  result: T;
  cacheHit: boolean;
};

type V2CandidateCacheKeyOptions = SamePairing4ExitPathCoverOptions & {
  maxV2Candidates?: number;
  solveSixExit?: boolean;
  patchRectangleSearchMode?: string;
  arcChunkSize?: number;
  arcChunkStride?: number;
  arcGrowShrinkRadius?: number;
  maxTargetedRectangles?: number;
  fallbackToBroadIfNoCandidates?: boolean;
};

const CACHE_VERSION = 1;

const RECTANGLE_DETECTION_DEFAULTS = {
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 20,
  maxPatchRectsScanned: Number.POSITIVE_INFINITY,
  focusNodeIds: [] as NodeId[],
  focusPadding: 0
};

const RECTANGLE_PATH_CACHE_DEFAULTS = {
  maxArea: 20,
  maxPathsPerTerminalPair: 64,
  maxExpansions: 100_000,
  includeReverseLookup: true
};

const SAME_PAIRING_4_EXIT_DEFAULTS = {
  maxPatchArea4Exit: 24,
  maxCoversPerPatch: 64,
  maxSolverExpansionsPerPatch: 100_000
};

export class PatchMutationCandidateCache {
  private readonly entries = new Map<string, unknown>();
  private hits = 0;
  private misses = 0;

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get<T>(key: string): T | null {
    if (!this.entries.has(key)) {
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    return this.entries.get(key) as T;
  }

  set<T>(key: string, value: T): void {
    this.entries.set(key, value);
  }

  getStats(): PatchMutationCandidateCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.entries.size
    };
  }
}

export const defaultPatchMutationCandidateCache = new PatchMutationCandidateCache();

export function buildGraphSignature(graph: GraphSnapshot): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${node.x},${node.y}`)
    .sort();
  const edges = graph.edges
    .map((edge) => `${edge.id}:${edge.from}->${edge.to}:${edge.direction}:${edge.kind}:${edge.viaPortalId ?? ''}`)
    .sort();

  return stableStringify({ nodes, edges });
}

export function buildV1PatchCandidateCacheKey(input: {
  mapId?: string | null;
  graph: GraphSnapshot;
  cycle: HamiltonianCycle;
  options?: RectanglePatchMutationGenerationOptions;
}): string {
  const options = input.options ?? {};
  const pathCacheOptions = options.pathCacheOptions ?? {};

  return buildCandidateCacheKey('v1', {
    mapId: input.mapId ?? null,
    graphSignature: buildGraphSignature(input.graph),
    lockedCycleSignature: cycleEdgeSignature(input.cycle),
    maxPatchWidth: options.maxWidth ?? RECTANGLE_DETECTION_DEFAULTS.maxWidth,
    maxPatchHeight: options.maxHeight ?? RECTANGLE_DETECTION_DEFAULTS.maxHeight,
    maxPatchArea: options.maxArea ?? RECTANGLE_DETECTION_DEFAULTS.maxArea,
    maxPatchRectsScanned: normalizeNumber(options.maxPatchRectsScanned ?? RECTANGLE_DETECTION_DEFAULTS.maxPatchRectsScanned),
    maxPatchCandidates: normalizeNumber(options.maxPatchCandidates ?? Number.POSITIVE_INFINITY),
    patchRectangleSearchMode: (options as Record<string, unknown>)['patchRectangleSearchMode'] ?? 'broad',
    arcChunkSize: (options as Record<string, unknown>)['arcChunkSize'] ?? null,
    arcChunkStride: (options as Record<string, unknown>)['arcChunkStride'] ?? null,
    arcGrowShrinkRadius: (options as Record<string, unknown>)['arcGrowShrinkRadius'] ?? null,
    maxTargetedRectangles: normalizeMaybeNumber((options as Record<string, unknown>)['maxTargetedRectangles']),
    fallbackToBroadIfNoCandidates: (options as Record<string, unknown>)['fallbackToBroadIfNoCandidates'] ?? null,
    explicitRectangles: normalizeRectangles((options as Record<string, unknown>)['rectangles'] as RectanglePatchRect[] | undefined),
    focusNodeIds: normalizeFocusNodeIds(options.focusNodeIds),
    focusPadding: options.focusPadding ?? RECTANGLE_DETECTION_DEFAULTS.focusPadding,
    pathCacheOptions: {
      maxArea: pathCacheOptions.maxArea ?? RECTANGLE_PATH_CACHE_DEFAULTS.maxArea,
      maxPathsPerTerminalPair:
        pathCacheOptions.maxPathsPerTerminalPair ?? RECTANGLE_PATH_CACHE_DEFAULTS.maxPathsPerTerminalPair,
      maxExpansions: pathCacheOptions.maxExpansions ?? RECTANGLE_PATH_CACHE_DEFAULTS.maxExpansions,
      includeReverseLookup: pathCacheOptions.includeReverseLookup ?? RECTANGLE_PATH_CACHE_DEFAULTS.includeReverseLookup
    }
  });
}

export function buildV2PatchCandidateCacheKey(input: {
  mapId?: string | null;
  graph: GraphSnapshot;
  cycle: HamiltonianCycle;
  options?: V2CandidateCacheKeyOptions;
}): string {
  const options = input.options ?? {};

  return buildCandidateCacheKey('v2', {
    mapId: input.mapId ?? null,
    graphSignature: buildGraphSignature(input.graph),
    lockedCycleSignature: cycleEdgeSignature(input.cycle),
    maxWidth: options.maxWidth ?? RECTANGLE_DETECTION_DEFAULTS.maxWidth,
    maxHeight: options.maxHeight ?? RECTANGLE_DETECTION_DEFAULTS.maxHeight,
    maxArea: options.maxArea ?? RECTANGLE_DETECTION_DEFAULTS.maxArea,
    maxV2PatchArea: options.maxPatchArea4Exit ?? SAME_PAIRING_4_EXIT_DEFAULTS.maxPatchArea4Exit,
    maxV2RectsScanned: normalizeNumber(options.maxPatchRectsScanned ?? RECTANGLE_DETECTION_DEFAULTS.maxPatchRectsScanned),
    maxV2Candidates: normalizeNumber(options.maxV2Candidates ?? Number.POSITIVE_INFINITY),
    patchRectangleSearchMode: options.patchRectangleSearchMode ?? 'broad',
    arcChunkSize: options.arcChunkSize ?? null,
    arcChunkStride: options.arcChunkStride ?? null,
    arcGrowShrinkRadius: options.arcGrowShrinkRadius ?? null,
    maxTargetedRectangles: normalizeMaybeNumber(options.maxTargetedRectangles),
    fallbackToBroadIfNoCandidates: options.fallbackToBroadIfNoCandidates ?? null,
    explicitRectangles: normalizeRectangles((options as Record<string, unknown>)['rectangles'] as RectanglePatchRect[] | undefined),
    maxV2SolverExpansions:
      options.maxSolverExpansionsPerPatch ?? SAME_PAIRING_4_EXIT_DEFAULTS.maxSolverExpansionsPerPatch,
    maxPathCoversPerPatch: options.maxCoversPerPatch ?? SAME_PAIRING_4_EXIT_DEFAULTS.maxCoversPerPatch,
    solveSixExit: options.solveSixExit ?? false,
    focusNodeIds: normalizeFocusNodeIds(options.focusNodeIds),
    focusPadding: options.focusPadding ?? RECTANGLE_DETECTION_DEFAULTS.focusPadding
  });
}

export function getOrCreateV1GraphCandidates(input: {
  cache: PatchMutationCandidateCache;
  mapId?: string | null;
  graph: GraphSnapshot;
  cycle: HamiltonianCycle;
  options?: RectanglePatchMutationGenerationOptions;
  rectangles?: readonly RectanglePatchRect[];
}): PatchMutationCandidateCacheLookup<RectanglePatchMutationGenerationResult> {
  if (input.options?.validateCycle) {
    return {
      key: 'uncached:v1:custom-validateCycle',
      result: input.rectangles
        ? generateRectanglePatchMutationCandidatesFromRectangles(input.graph, input.cycle, input.rectangles, input.options ?? {})
        : generateRectanglePatchMutationCandidates(input.graph, input.cycle, input.options),
      cacheHit: false
    };
  }

  const options = input.rectangles
    ? ({ ...(input.options ?? {}), rectangles: input.rectangles } as RectanglePatchMutationGenerationOptions)
    : input.options;
  const key = buildV1PatchCandidateCacheKey({ ...input, options });
  const cached = input.cache.get<RectanglePatchMutationGenerationResult>(key);
  if (cached) {
    return { key, result: cached, cacheHit: true };
  }

  const result = input.rectangles
    ? generateRectanglePatchMutationCandidatesFromRectangles(input.graph, input.cycle, input.rectangles, input.options ?? {})
    : generateRectanglePatchMutationCandidates(input.graph, input.cycle, input.options);
  input.cache.set(key, result);
  return { key, result, cacheHit: false };
}

export function getOrCreateV2GraphCandidates(input: {
  cache: PatchMutationCandidateCache;
  mapId?: string | null;
  graph: GraphSnapshot;
  cycle: HamiltonianCycle;
  options?: V2CandidateCacheKeyOptions;
  rectangles?: readonly RectanglePatchRect[];
}): PatchMutationCandidateCacheLookup<V2FourExitSpliceGenerationResult> {
  const options = input.rectangles
    ? ({ ...(input.options ?? {}), rectangles: input.rectangles } as V2CandidateCacheKeyOptions)
    : input.options;
  const key = buildV2PatchCandidateCacheKey({ ...input, options });
  const cached = input.cache.get<V2FourExitSpliceGenerationResult>(key);
  if (cached) {
    return { key, result: cached, cacheHit: true };
  }

  const result = input.rectangles
    ? generateV2FourExitSpliceCandidatesFromRectangles(input.graph, input.cycle, input.rectangles, input.options)
    : generateV2FourExitSpliceCandidates(input.graph, input.cycle, input.options);
  input.cache.set(key, result);
  return { key, result, cacheHit: false };
}

function buildCandidateCacheKey(mode: CacheMode, parts: Record<string, unknown>): string {
  return stableStringify({
    version: CACHE_VERSION,
    mode,
    ...parts
  });
}

function normalizeNumber(value: number): number | string {
  return Number.isFinite(value) ? value : 'Infinity';
}

function normalizeMaybeNumber(value: unknown): number | string | null {
  return typeof value === 'number' ? normalizeNumber(value) : null;
}

function normalizeFocusNodeIds(value: readonly NodeId[] | undefined): NodeId[] {
  return [...new Set(value ?? RECTANGLE_DETECTION_DEFAULTS.focusNodeIds)].sort();
}

function normalizeRectangles(value: readonly RectanglePatchRect[] | undefined): string[] {
  return (value ?? [])
    .map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableStringify);
  }

  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortForStableStringify((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}
