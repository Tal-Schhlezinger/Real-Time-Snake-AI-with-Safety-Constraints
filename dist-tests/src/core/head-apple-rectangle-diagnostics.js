"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeHeadAppleRectangleGrowSearch = analyzeHeadAppleRectangleGrowSearch;
exports.generateTargetedRectangles = generateTargetedRectangles;
exports.generateRectanglePatchMutationCandidatesFromRectangles = generateRectanglePatchMutationCandidatesFromRectangles;
const hamiltonian_certificate_js_1 = require("./hamiltonian-certificate.js");
const map_validator_js_1 = require("./map-validator.js");
const multi_terminal_patch_diagnostics_js_1 = require("./multi-terminal-patch-diagnostics.js");
const rectangle_path_cache_js_1 = require("./rectangle-path-cache.js");
const two_terminal_patch_mutation_js_1 = require("./two-terminal-patch-mutation.js");
const cycle_library_js_1 = require("./cycle-library.js");
const DEFAULT_MODES = ['broad-scan', 'head-apple', 'arc-chunk', 'combined-targeted'];
const DEFAULT_MAX_TARGET_RECTANGLES = 64;
const DEFAULT_MAX_EXIT_DIAGNOSTICS = 12;
const DEFAULT_ARC_CHUNK_SIZE = 8;
const DEFAULT_ARC_CHUNK_STRIDE = 4;
function analyzeHeadAppleRectangleGrowSearch(state, options = {}) {
    const cycle = getLockedCycle(state);
    const arc = getHeadToAppleArc(state, cycle);
    const arcSet = new Set(arc);
    const modes = options.modes ?? DEFAULT_MODES;
    const modeDiagnostics = modes.map((mode) => analyzeMode(state, cycle, arc, arcSet, mode, options));
    const bestCandidateMode = [...modeDiagnostics].sort(compareByBestImprovement)[0]?.mode ?? modes[0] ?? 'broad-scan';
    const bestEfficiencyMode = [...modeDiagnostics].sort(compareByEfficiency)[0]?.mode ?? bestCandidateMode;
    return {
        mapId: state.map.id,
        mapName: state.map.name,
        boardSize: `${state.map.width}x${state.map.height}`,
        head: state.snake.segments[0] ?? null,
        apple: state.appleNodeId,
        currentLockedCyclePathLen: currentLockedCyclePathLen(state, cycle),
        modes: modeDiagnostics,
        recommendation: {
            bestCandidateMode,
            bestEfficiencyMode,
            heuristic: 'Prefer combined-targeted when it preserves best improvement with fewer rectangles; otherwise fall back to broad scan for diagnostics.'
        }
    };
}
function generateTargetedRectangles(state, mode, options = {}) {
    const cycle = getLockedCycle(state);
    const arc = getHeadToAppleArc(state, cycle);
    const graph = state.map.graph;
    const maxTargetRectangles = options.maxTargetRectangles ?? DEFAULT_MAX_TARGET_RECTANGLES;
    const all = [];
    if (mode === 'broad-scan') {
        return (0, two_terminal_patch_mutation_js_1.enumerateRectangles)(graph, options).slice(0, maxTargetRectangles);
    }
    if (mode === 'head-apple' || mode === 'combined-targeted') {
        const endpoints = [state.snake.segments[0], state.appleNodeId].filter((nodeId) => Boolean(nodeId));
        const rect = boundingRectForNodes(graph, endpoints);
        if (rect) {
            all.push(...oneStepRectangleNeighborhood(graph, rect, options));
        }
    }
    if (mode === 'arc-chunk' || mode === 'combined-targeted') {
        const chunkSize = options.arcChunkSize ?? DEFAULT_ARC_CHUNK_SIZE;
        const stride = options.arcChunkStride ?? DEFAULT_ARC_CHUNK_STRIDE;
        for (let start = 0; start < arc.length; start += Math.max(1, stride)) {
            const chunk = arc.slice(start, start + chunkSize);
            const rect = boundingRectForNodes(graph, chunk);
            if (rect) {
                all.push(...oneStepRectangleNeighborhood(graph, rect, options));
            }
            if (start + chunkSize >= arc.length) {
                break;
            }
        }
    }
    const arcSet = new Set(arc);
    return uniqueRectangles(all)
        .filter((rect) => rect.width * rect.height <= (options.maxArea ?? Number.POSITIVE_INFINITY))
        .filter((rect) => rect.width <= (options.maxWidth ?? Number.POSITIVE_INFINITY))
        .filter((rect) => rect.height <= (options.maxHeight ?? Number.POSITIVE_INFINITY))
        .sort((a, b) => scoreRectangleForTargeting(state, cycle, arcSet, b) - scoreRectangleForTargeting(state, cycle, arcSet, a) || rectKey(a).localeCompare(rectKey(b)))
        .slice(0, maxTargetRectangles);
}
function analyzeMode(state, cycle, arc, arcSet, mode, options) {
    const startedAt = performance.now();
    const rectangles = generateTargetedRectangles(state, mode, options);
    const maxPatchCandidates = options.maxPatchCandidates ?? Number.POSITIVE_INFINITY;
    const includeV1 = options.includeV1 ?? true;
    const includeV2 = options.includeV2 ?? true;
    const v1Generation = includeV1
        ? generateRectanglePatchMutationCandidatesFromRectangles(state.map.graph, cycle, rectangles, options)
        : emptyV1Generation();
    const v1Classification = (0, two_terminal_patch_mutation_js_1.classifyGeneratedPatchMutationCandidatesForSnake)(state, v1Generation, v1Generation.candidates, options);
    const v1Ranking = (0, two_terminal_patch_mutation_js_1.rankGeneratedPatchMutationCandidates)(state, cycle, v1Classification);
    const v2Generation = includeV2
        ? (0, multi_terminal_patch_diagnostics_js_1.generateV2FourExitSpliceCandidatesFromRectangles)(state.map.graph, cycle, rectangles, options)
        : null;
    const v2Classification = v2Generation
        ? (0, multi_terminal_patch_diagnostics_js_1.classifyGeneratedV2FourExitSpliceCandidatesForSnake)(state, v2Generation.candidates.slice(0, maxPatchCandidates), cycle, options)
        : null;
    const bestV1 = v1Ranking.rankedCandidates[0] ?? null;
    const bestV2 = v2Classification?.rankedCandidates[0] ?? null;
    const bestImprovement = maxNullable([
        v1Ranking.aggregate.bestImprovement,
        v2Classification?.aggregate.bestImprovement ?? null
    ]);
    const bestRectangle = chooseBestRectangle(bestV1?.candidate.rect ?? null, bestV2?.candidate.rect ?? null, bestImprovement, v1Ranking.aggregate.bestImprovement, v2Classification?.aggregate.bestImprovement ?? null);
    const exitDiagnostics = rectangles
        .slice(0, options.maxExitDiagnostics ?? DEFAULT_MAX_EXIT_DIAGNOSTICS)
        .map((rect) => describeTargetedRectangle(state, cycle, arcSet, rect, mode, options));
    return {
        mode,
        rectanglesGenerated: rectangles.length,
        rectanglesEvaluated: rectangles.length,
        exitDiagnostics,
        v1ValidPatches: v1Generation.aggregate.validTwoTerminalPatches,
        v2ValidPatches: v2Generation?.aggregate.validFourExitDecompositions ?? 0,
        graphValidCandidates: v1Generation.aggregate.graphValidCandidates + (v2Generation?.aggregate.graphValidCandidates ?? 0),
        snakeUsableCandidates: v1Classification.aggregate.usableCandidates + (v2Classification?.aggregate.snakeUsableCandidates ?? 0),
        improvingCandidates: v1Ranking.aggregate.improvingCandidates + (v2Classification?.aggregate.improvingCandidates ?? 0),
        bestImprovement,
        bestRectangle,
        postApplePlanningMs: performance.now() - startedAt,
        transitionSearchMs: v1Ranking.profile.transitionSearchMs + (v2Classification?.profile.transitionSearchMs ?? 0),
        certificationMs: v1Ranking.profile.certificationMs + (v2Classification?.profile.certificationMs ?? 0),
        scoringMs: v1Ranking.profile.scoringMs + (v2Classification?.profile.scoringMs ?? 0),
        avgStepsPerAppleShortEval: null,
        invariantFailures: 0
    };
}
function generateRectanglePatchMutationCandidatesFromRectangles(graph, cycle, rectangles, options) {
    const startedAt = Date.now();
    const pathCache = (0, rectangle_path_cache_js_1.buildRectanglePathCache)(options.pathCacheOptions);
    const patchDiagnostics = rectangles.map((rect) => (0, two_terminal_patch_mutation_js_1.analyzeRectanglePatch)(graph, cycle, rect, pathCache));
    const candidates = [];
    const candidateDiagnostics = [];
    const aggregate = {
        patchesScanned: patchDiagnostics.length,
        validTwoTerminalPatches: 0,
        alternativesConsidered: 0,
        noOpAlternatives: 0,
        rawCandidatesGenerated: 0,
        duplicateCandidates: 0,
        graphValidCandidates: 0,
        graphInvalidCandidates: 0,
        budgetExhausted: false
    };
    const seenCandidateSignatures = new Set();
    const maxPatchCandidates = options.maxPatchCandidates ?? Number.POSITIVE_INFINITY;
    patchLoop: for (const patch of patchDiagnostics) {
        if (patch.rejectionReason !== 'valid-patch' ||
            !patch.terminals ||
            !patch.originalInsidePath ||
            patch.alternativePathCount === null) {
            continue;
        }
        aggregate.validTwoTerminalPatches += 1;
        const patchNodeSet = buildRectNodeSet(graph, patch.rect);
        const originalLocalPath = patch.originalInsidePath.map((nodeId) => localIndexForRectNode(graph, patch.rect, nodeId));
        const startLocalIndex = originalLocalPath[0];
        const endLocalIndex = originalLocalPath[originalLocalPath.length - 1];
        const cachedPaths = pathCache.getPaths(patch.rect.width, patch.rect.height, startLocalIndex, endLocalIndex);
        for (const localReplacementPath of cachedPaths) {
            if (candidates.length >= maxPatchCandidates) {
                aggregate.budgetExhausted = true;
                break patchLoop;
            }
            aggregate.alternativesConsidered += 1;
            const replacementInsidePath = globalPathFromLocalPath(graph, patch.rect, localReplacementPath);
            if (!replacementInsidePath ||
                arraysEqual(localReplacementPath, originalLocalPath) ||
                arraysEqual([...localReplacementPath].reverse(), originalLocalPath)) {
                aggregate.noOpAlternatives += 1;
                continue;
            }
            const candidateCycle = (0, two_terminal_patch_mutation_js_1.spliceTwoTerminalPatchPath)({
                oldCycle: cycle,
                patchNodeSet,
                terminalA: patch.terminals.terminalA,
                terminalB: patch.terminals.terminalB,
                oldInternalPath: patch.originalInsidePath,
                replacementInternalPath: replacementInsidePath
            });
            if (!candidateCycle) {
                continue;
            }
            aggregate.rawCandidatesGenerated += 1;
            const graphValid = (0, map_validator_js_1.validateHamiltonianCycle)(graph, candidateCycle);
            if (!graphValid) {
                aggregate.graphInvalidCandidates += 1;
                continue;
            }
            const signature = (0, cycle_library_js_1.cycleEdgeSignature)(candidateCycle);
            if (seenCandidateSignatures.has(signature)) {
                aggregate.duplicateCandidates += 1;
                continue;
            }
            seenCandidateSignatures.add(signature);
            aggregate.graphValidCandidates += 1;
            candidates.push({
                cycle: candidateCycle,
                rect: patch.rect,
                terminals: patch.terminals,
                originalInsidePath: patch.originalInsidePath,
                replacementInsidePath
            });
        }
    }
    return {
        aggregate,
        patchDiagnostics,
        candidateDiagnostics,
        candidates,
        profile: {
            generationMs: Date.now() - startedAt
        }
    };
}
function describeTargetedRectangle(state, cycle, arcSet, rect, source, options) {
    const graph = state.map.graph;
    const rectNodeSet = buildRectNodeSet(graph, rect);
    const exitCount = (0, two_terminal_patch_mutation_js_1.getCycleCutCrossings)(cycle, rectNodeSet).length;
    const arcNodeCount = [...arcSet].filter((nodeId) => rectNodeSet.has(nodeId)).length;
    const v1 = (0, two_terminal_patch_mutation_js_1.analyzeRectanglePatch)(graph, cycle, rect, (0, rectangle_path_cache_js_1.buildRectanglePathCache)(options.pathCacheOptions));
    const v2 = (0, multi_terminal_patch_diagnostics_js_1.generateV2FourExitSpliceCandidatesFromRectangles)(graph, cycle, [rect], options);
    return {
        rect,
        source,
        score: scoreRectangleForTargeting(state, cycle, arcSet, rect),
        exitCount,
        closestTargetExitCount: closestTargetExitCount(exitCount),
        arcNodeCount,
        arcCoverageRatio: arcSet.size > 0 ? arcNodeCount / arcSet.size : 0,
        containsHead: Boolean(state.snake.segments[0] && rectNodeSet.has(state.snake.segments[0])),
        containsApple: Boolean(state.appleNodeId && rectNodeSet.has(state.appleNodeId)),
        sideExitCounts: sideExitCounts(graph, cycle, rect),
        hasV1Alternatives: v1.rejectionReason === 'valid-patch' && (v1.alternativePathCount ?? 0) > 0,
        hasV2Covers: v2.pathCoverDiagnostics.aggregate.pathCoversFound > 0
    };
}
function sideExitCounts(graph, cycle, rect) {
    return {
        expandLeft: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'expandLeft')),
        expandRight: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'expandRight')),
        expandUp: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'expandUp')),
        expandDown: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'expandDown')),
        shrinkLeft: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'shrinkLeft')),
        shrinkRight: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'shrinkRight')),
        shrinkUp: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'shrinkUp')),
        shrinkDown: exitCountForMaybeRect(graph, cycle, adjustRect(graph, rect, 'shrinkDown'))
    };
}
function oneStepRectangleNeighborhood(graph, rect, options) {
    const radius = Math.max(1, Math.floor(options.arcGrowShrinkRadius ?? 1));
    let frontier = [rect];
    const candidates = [rect];
    for (let step = 0; step < radius; step += 1) {
        const nextFrontier = frontier.flatMap((current) => [
            adjustRect(graph, current, 'expandLeft'),
            adjustRect(graph, current, 'expandRight'),
            adjustRect(graph, current, 'expandUp'),
            adjustRect(graph, current, 'expandDown'),
            adjustRect(graph, current, 'shrinkLeft'),
            adjustRect(graph, current, 'shrinkRight'),
            adjustRect(graph, current, 'shrinkUp'),
            adjustRect(graph, current, 'shrinkDown')
        ].filter((candidate) => Boolean(candidate)));
        candidates.push(...nextFrontier);
        frontier = uniqueRectangles(nextFrontier);
    }
    return uniqueRectangles(candidates)
        .filter((candidate) => candidate.width * candidate.height <= (options.maxArea ?? Number.POSITIVE_INFINITY))
        .filter((candidate) => candidate.width <= (options.maxWidth ?? Number.POSITIVE_INFINITY))
        .filter((candidate) => candidate.height <= (options.maxHeight ?? Number.POSITIVE_INFINITY));
}
function adjustRect(graph, rect, operation) {
    const bounds = graphBounds(graph);
    switch (operation) {
        case 'expandLeft':
            return rect.x > bounds.minX ? { x: rect.x - 1, y: rect.y, width: rect.width + 1, height: rect.height } : null;
        case 'expandRight':
            return rect.x + rect.width - 1 < bounds.maxX ? { ...rect, width: rect.width + 1 } : null;
        case 'expandUp':
            return rect.y > bounds.minY ? { x: rect.x, y: rect.y - 1, width: rect.width, height: rect.height + 1 } : null;
        case 'expandDown':
            return rect.y + rect.height - 1 < bounds.maxY ? { ...rect, height: rect.height + 1 } : null;
        case 'shrinkLeft':
            return rect.width > 1 ? { x: rect.x + 1, y: rect.y, width: rect.width - 1, height: rect.height } : null;
        case 'shrinkRight':
            return rect.width > 1 ? { ...rect, width: rect.width - 1 } : null;
        case 'shrinkUp':
            return rect.height > 1 ? { x: rect.x, y: rect.y + 1, width: rect.width, height: rect.height - 1 } : null;
        case 'shrinkDown':
            return rect.height > 1 ? { ...rect, height: rect.height - 1 } : null;
    }
}
function scoreRectangleForTargeting(state, cycle, arcSet, rect) {
    const rectNodeSet = buildRectNodeSet(state.map.graph, rect);
    const exitCount = (0, two_terminal_patch_mutation_js_1.getCycleCutCrossings)(cycle, rectNodeSet).length;
    const exitDistance = Math.min(...[2, 4, 6, 8].map((target) => Math.abs(target - exitCount)));
    const arcNodeCount = [...arcSet].filter((nodeId) => rectNodeSet.has(nodeId)).length;
    const containsHead = state.snake.segments[0] && rectNodeSet.has(state.snake.segments[0]) ? 1 : 0;
    const containsApple = state.appleNodeId && rectNodeSet.has(state.appleNodeId) ? 1 : 0;
    return arcNodeCount * 10 + containsHead * 8 + containsApple * 8 - exitDistance * 4 - rect.width * rect.height * 0.05;
}
function getHeadToAppleArc(state, cycle) {
    const head = state.snake.segments[0];
    const apple = state.appleNodeId;
    if (!head || !apple || cycle.length === 0) {
        return head ? [head] : [];
    }
    const headIndex = cycle.indexOf(head);
    const appleIndex = cycle.indexOf(apple);
    if (headIndex === -1 || appleIndex === -1) {
        return [head];
    }
    const arc = [];
    for (let offset = 0; offset <= cycle.length; offset += 1) {
        const nodeId = cycle[(headIndex + offset) % cycle.length];
        if (!nodeId) {
            break;
        }
        arc.push(nodeId);
        if (nodeId === apple) {
            break;
        }
    }
    return arc;
}
function boundingRectForNodes(graph, nodeIds) {
    const nodes = nodeIds.map((nodeId) => graph.nodes.find((node) => node.id === nodeId)).filter((node) => Boolean(node));
    if (nodes.length === 0) {
        return null;
    }
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
function buildRectNodeSet(graph, rect) {
    const set = new Set();
    for (const node of graph.nodes) {
        if (isCoordInRect(node, rect)) {
            set.add(node.id);
        }
    }
    return set;
}
function globalPathFromLocalPath(graph, rect, localPath) {
    const nodesByCoord = new Map(graph.nodes.map((node) => [`${node.x},${node.y}`, node.id]));
    const path = [];
    for (const local of localPath) {
        const x = rect.x + (local % rect.width);
        const y = rect.y + Math.floor(local / rect.width);
        const nodeId = nodesByCoord.get(`${x},${y}`);
        if (!nodeId) {
            return null;
        }
        path.push(nodeId);
    }
    return path;
}
function localIndexForRectNode(graph, rect, nodeId) {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        return -1;
    }
    return (0, rectangle_path_cache_js_1.localIndex)(node.x - rect.x, node.y - rect.y, rect.width);
}
function exitCountForMaybeRect(graph, cycle, rect) {
    return rect ? (0, two_terminal_patch_mutation_js_1.getCycleCutCrossings)(cycle, buildRectNodeSet(graph, rect)).length : null;
}
function closestTargetExitCount(exitCount) {
    return [2, 4, 6, 8].sort((a, b) => Math.abs(a - exitCount) - Math.abs(b - exitCount))[0];
}
function uniqueRectangles(rectangles) {
    const seen = new Set();
    const unique = [];
    for (const rect of rectangles) {
        const key = rectKey(rect);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(rect);
        }
    }
    return unique;
}
function graphBounds(graph) {
    return {
        minX: Math.min(...graph.nodes.map((node) => node.x)),
        maxX: Math.max(...graph.nodes.map((node) => node.x)),
        minY: Math.min(...graph.nodes.map((node) => node.y)),
        maxY: Math.max(...graph.nodes.map((node) => node.y))
    };
}
function isCoordInRect(coord, rect) {
    return coord.x >= rect.x && coord.x < rect.x + rect.width && coord.y >= rect.y && coord.y < rect.y + rect.height;
}
function currentLockedCyclePathLen(state, cycle) {
    const head = state.snake.segments[0] ?? null;
    if (!head || !state.appleNodeId) {
        return null;
    }
    return (0, hamiltonian_certificate_js_1.distanceForwardOnCycle)(head, state.appleNodeId, cycle);
}
function getLockedCycle(state) {
    return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}
function chooseBestRectangle(v1Rect, v2Rect, bestImprovement, v1Improvement, v2Improvement) {
    if (bestImprovement === null) {
        return null;
    }
    return v2Improvement === bestImprovement ? v2Rect : v1Improvement === bestImprovement ? v1Rect : v1Rect ?? v2Rect;
}
function compareByBestImprovement(a, b) {
    return (b.bestImprovement ?? Number.NEGATIVE_INFINITY) - (a.bestImprovement ?? Number.NEGATIVE_INFINITY) ||
        a.rectanglesEvaluated - b.rectanglesEvaluated;
}
function compareByEfficiency(a, b) {
    const aEfficiency = a.rectanglesEvaluated > 0 ? (a.bestImprovement ?? 0) / a.rectanglesEvaluated : 0;
    const bEfficiency = b.rectanglesEvaluated > 0 ? (b.bestImprovement ?? 0) / b.rectanglesEvaluated : 0;
    return bEfficiency - aEfficiency || compareByBestImprovement(a, b);
}
function maxNullable(values) {
    const present = values.filter((value) => value !== null);
    return present.length > 0 ? Math.max(...present) : null;
}
function arraysEqual(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
function rectKey(rect) {
    return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}
function emptyV1Generation() {
    return {
        aggregate: {
            patchesScanned: 0,
            validTwoTerminalPatches: 0,
            alternativesConsidered: 0,
            noOpAlternatives: 0,
            rawCandidatesGenerated: 0,
            duplicateCandidates: 0,
            graphValidCandidates: 0,
            graphInvalidCandidates: 0,
            budgetExhausted: false
        },
        patchDiagnostics: [],
        candidateDiagnostics: [],
        candidates: [],
        profile: {
            generationMs: 0
        }
    };
}
