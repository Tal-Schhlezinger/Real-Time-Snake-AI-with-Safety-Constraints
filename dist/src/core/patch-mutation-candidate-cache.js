import { cycleEdgeSignature } from './cycle-library.js';
import { generateV2FourExitSpliceCandidatesFromRectangles, generateV2FourExitSpliceCandidates } from './multi-terminal-patch-diagnostics.js';
import { generateRectanglePatchMutationCandidatesFromRectangles } from './head-apple-rectangle-diagnostics.js';
import { generateRectanglePatchMutationCandidates } from './two-terminal-patch-mutation.js';
const CACHE_VERSION = 1;
const RECTANGLE_DETECTION_DEFAULTS = {
    maxWidth: 6,
    maxHeight: 6,
    maxArea: 20,
    maxPatchRectsScanned: Number.POSITIVE_INFINITY,
    focusNodeIds: [],
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
    entries = new Map();
    hits = 0;
    misses = 0;
    clear() {
        this.entries.clear();
        this.hits = 0;
        this.misses = 0;
    }
    get(key) {
        if (!this.entries.has(key)) {
            this.misses += 1;
            return null;
        }
        this.hits += 1;
        return this.entries.get(key);
    }
    set(key, value) {
        this.entries.set(key, value);
    }
    getStats() {
        return {
            hits: this.hits,
            misses: this.misses,
            entries: this.entries.size
        };
    }
}
export const defaultPatchMutationCandidateCache = new PatchMutationCandidateCache();
export function buildGraphSignature(graph) {
    const nodes = graph.nodes
        .map((node) => `${node.id}:${node.x},${node.y}`)
        .sort();
    const edges = graph.edges
        .map((edge) => `${edge.id}:${edge.from}->${edge.to}:${edge.direction}:${edge.kind}:${edge.viaPortalId ?? ''}`)
        .sort();
    return stableStringify({ nodes, edges });
}
export function buildV1PatchCandidateCacheKey(input) {
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
        patchRectangleSearchMode: options['patchRectangleSearchMode'] ?? 'broad',
        arcChunkSize: options['arcChunkSize'] ?? null,
        arcChunkStride: options['arcChunkStride'] ?? null,
        arcGrowShrinkRadius: options['arcGrowShrinkRadius'] ?? null,
        maxTargetedRectangles: normalizeMaybeNumber(options['maxTargetedRectangles']),
        fallbackToBroadIfNoCandidates: options['fallbackToBroadIfNoCandidates'] ?? null,
        explicitRectangles: normalizeRectangles(options['rectangles']),
        focusNodeIds: normalizeFocusNodeIds(options.focusNodeIds),
        focusPadding: options.focusPadding ?? RECTANGLE_DETECTION_DEFAULTS.focusPadding,
        pathCacheOptions: {
            maxArea: pathCacheOptions.maxArea ?? RECTANGLE_PATH_CACHE_DEFAULTS.maxArea,
            maxPathsPerTerminalPair: pathCacheOptions.maxPathsPerTerminalPair ?? RECTANGLE_PATH_CACHE_DEFAULTS.maxPathsPerTerminalPair,
            maxExpansions: pathCacheOptions.maxExpansions ?? RECTANGLE_PATH_CACHE_DEFAULTS.maxExpansions,
            includeReverseLookup: pathCacheOptions.includeReverseLookup ?? RECTANGLE_PATH_CACHE_DEFAULTS.includeReverseLookup
        }
    });
}
export function buildV2PatchCandidateCacheKey(input) {
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
        explicitRectangles: normalizeRectangles(options['rectangles']),
        maxV2SolverExpansions: options.maxSolverExpansionsPerPatch ?? SAME_PAIRING_4_EXIT_DEFAULTS.maxSolverExpansionsPerPatch,
        maxPathCoversPerPatch: options.maxCoversPerPatch ?? SAME_PAIRING_4_EXIT_DEFAULTS.maxCoversPerPatch,
        solveSixExit: options.solveSixExit ?? false,
        focusNodeIds: normalizeFocusNodeIds(options.focusNodeIds),
        focusPadding: options.focusPadding ?? RECTANGLE_DETECTION_DEFAULTS.focusPadding
    });
}
export function getOrCreateV1GraphCandidates(input) {
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
        ? { ...(input.options ?? {}), rectangles: input.rectangles }
        : input.options;
    const key = buildV1PatchCandidateCacheKey({ ...input, options });
    const cached = input.cache.get(key);
    if (cached) {
        return { key, result: cached, cacheHit: true };
    }
    const result = input.rectangles
        ? generateRectanglePatchMutationCandidatesFromRectangles(input.graph, input.cycle, input.rectangles, input.options ?? {})
        : generateRectanglePatchMutationCandidates(input.graph, input.cycle, input.options);
    input.cache.set(key, result);
    return { key, result, cacheHit: false };
}
export function getOrCreateV2GraphCandidates(input) {
    const options = input.rectangles
        ? { ...(input.options ?? {}), rectangles: input.rectangles }
        : input.options;
    const key = buildV2PatchCandidateCacheKey({ ...input, options });
    const cached = input.cache.get(key);
    if (cached) {
        return { key, result: cached, cacheHit: true };
    }
    const result = input.rectangles
        ? generateV2FourExitSpliceCandidatesFromRectangles(input.graph, input.cycle, input.rectangles, input.options)
        : generateV2FourExitSpliceCandidates(input.graph, input.cycle, input.options);
    input.cache.set(key, result);
    return { key, result, cacheHit: false };
}
function buildCandidateCacheKey(mode, parts) {
    return stableStringify({
        version: CACHE_VERSION,
        mode,
        ...parts
    });
}
function normalizeNumber(value) {
    return Number.isFinite(value) ? value : 'Infinity';
}
function normalizeMaybeNumber(value) {
    return typeof value === 'number' ? normalizeNumber(value) : null;
}
function normalizeFocusNodeIds(value) {
    return [...new Set(value ?? RECTANGLE_DETECTION_DEFAULTS.focusNodeIds)].sort();
}
function normalizeRectangles(value) {
    return (value ?? [])
        .map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`);
}
function stableStringify(value) {
    return JSON.stringify(sortForStableStringify(value));
}
function sortForStableStringify(value) {
    if (Array.isArray(value)) {
        return value.map(sortForStableStringify);
    }
    if (value && typeof value === 'object') {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortForStableStringify(value[key]);
        }
        return sorted;
    }
    return value;
}
