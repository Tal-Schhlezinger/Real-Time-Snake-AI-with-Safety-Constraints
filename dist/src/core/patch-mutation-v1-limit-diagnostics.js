import { createPatchMutationScenarioStates } from './patch-mutation-scenarios.js';
import { enumerateRectangles, extractInsideCycleEdges, getCycleCutCrossings, rankPatchMutationCandidates } from './two-terminal-patch-mutation.js';
const DEFAULT_TRANSITION_OPTIONS = {
    maxPaths: 64,
    slack: 6
};
export const DEFAULT_12X8_PATCH_LIMIT_CONFIGS = [
    {
        id: 'current-default',
        label: 'Current default V1 limits',
        maxWidth: 6,
        maxHeight: 6,
        maxArea: 20,
        pathCacheOptions: {
            maxArea: 20,
            maxPathsPerTerminalPair: 64,
            maxExpansions: 100_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'area24-cache20',
        label: 'Larger scan area 24, cache still area 20',
        maxWidth: 8,
        maxHeight: 6,
        maxArea: 24,
        pathCacheOptions: {
            maxArea: 20,
            maxPathsPerTerminalPair: 64,
            maxExpansions: 100_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'area24-cache24',
        label: 'Larger scan and cache area 24',
        maxWidth: 8,
        maxHeight: 6,
        maxArea: 24,
        maxPatchCandidates: 512,
        pathCacheOptions: {
            maxArea: 24,
            maxPathsPerTerminalPair: 32,
            maxExpansions: 50_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'area30-cache20',
        label: 'Larger scan area 30, cache still area 20',
        maxWidth: 10,
        maxHeight: 8,
        maxArea: 30,
        pathCacheOptions: {
            maxArea: 20,
            maxPathsPerTerminalPair: 64,
            maxExpansions: 100_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'area36-cache20-exhaustive',
        label: 'Exhaustive scan area 36, cache still area 20',
        maxWidth: 12,
        maxHeight: 8,
        maxArea: 36,
        pathCacheOptions: {
            maxArea: 20,
            maxPathsPerTerminalPair: 64,
            maxExpansions: 100_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'focused-area36-cache20',
        label: 'Focused head/apple arc scan area 36, cache still area 20',
        maxWidth: 12,
        maxHeight: 8,
        maxArea: 36,
        focusMode: 'head-apple-arc',
        focusPadding: 1,
        pathCacheOptions: {
            maxArea: 20,
            maxPathsPerTerminalPair: 64,
            maxExpansions: 100_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'focused-area36-cache24',
        label: 'Focused head/apple arc scan area 36, cache area 24',
        maxWidth: 12,
        maxHeight: 8,
        maxArea: 36,
        maxPatchCandidates: 512,
        focusMode: 'head-apple-arc',
        focusPadding: 1,
        pathCacheOptions: {
            maxArea: 24,
            maxPathsPerTerminalPair: 32,
            maxExpansions: 50_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    },
    {
        id: 'default-cache128',
        label: 'Current scan limits with higher path cache cap',
        maxWidth: 6,
        maxHeight: 6,
        maxArea: 20,
        pathCacheOptions: {
            maxArea: 20,
            maxPathsPerTerminalPair: 128,
            maxExpansions: 150_000
        },
        transitionOptions: DEFAULT_TRANSITION_OPTIONS
    }
];
export function analyzePatchMutationV1LimitDiagnostics(map, options = {}) {
    const scenarios = options.scenarios ?? createPatchMutationScenarioStates(map, {
        seedValues: [0, 0.37],
        midGameFillRatios: [0.1, 0.25, 0.4],
        maxSimulationSteps: options.maxSimulationSteps ?? map.graph.nodes.length * 80
    }).filter((scenario) => scenario.kind === 'initial-near' ||
        scenario.kind === 'initial-far' ||
        scenario.kind === 'mid-game' ||
        scenario.kind === 'manual-far');
    const configs = options.configs ?? DEFAULT_12X8_PATCH_LIMIT_CONFIGS;
    return {
        mapId: map.id,
        mapName: map.name,
        boardSize: `${map.width}x${map.height}`,
        scenarioCount: scenarios.length,
        configs: configs.map((config) => analyzePatchMutationV1LimitConfig(scenarios, config))
    };
}
export function analyzePatchMutationV1LimitConfig(scenarios, config) {
    const patchReasonCounts = new Map();
    const candidateReasonCounts = new Map();
    const snakeReasonCounts = new Map();
    const aggregate = createEmptyConfigDiagnostics(config);
    for (const scenario of scenarios) {
        const state = scenario.state;
        const lockedCycle = getLockedCycle(state);
        const resolvedOptions = resolveScenarioConfigOptions(state, lockedCycle, config);
        const ranking = rankPatchMutationCandidates(state, state.map.graph, lockedCycle, resolvedOptions);
        const mutationAggregate = ranking.classificationDiagnostics.mutationDiagnostics.aggregate;
        const selectedUnderCurrentScoring = hasSelectedCandidateUnderCurrentScoring(ranking.rankedCandidates);
        const scenarioMultiExit = analyzeMultiExitRectangles(state.map.graph, lockedCycle, resolvedOptions);
        aggregate.rectanglesScanned += mutationAggregate.patchesScanned;
        aggregate.validTwoTerminalPatches += mutationAggregate.validTwoTerminalPatches;
        aggregate.alternativesConsidered += mutationAggregate.alternativesConsidered;
        aggregate.graphValidCandidates += mutationAggregate.graphValidCandidates;
        aggregate.snakeUsableCandidates += ranking.classificationDiagnostics.aggregate.usableCandidates;
        aggregate.improvingCandidates += ranking.aggregate.improvingCandidates;
        aggregate.selectedCandidatesUnderCurrentScoring += selectedUnderCurrentScoring ? 1 : 0;
        aggregate.budgetExhaustedScenarios += mutationAggregate.budgetExhausted ? 1 : 0;
        aggregate.bestImprovement = maxNullable(aggregate.bestImprovement, ranking.aggregate.bestImprovement);
        aggregate.workCounters.scenariosAnalyzed += 1;
        aggregate.workCounters.rectanglesScanned += mutationAggregate.patchesScanned;
        aggregate.workCounters.alternativesConsidered += mutationAggregate.alternativesConsidered;
        aggregate.workCounters.rawCandidatesGenerated += mutationAggregate.rawCandidatesGenerated;
        aggregate.workCounters.candidateDiagnostics += ranking.classificationDiagnostics.mutationDiagnostics.candidateDiagnostics.length;
        aggregate.workCounters.classifications += ranking.classificationDiagnostics.classifications.length;
        aggregate.workCounters.rankedCandidates += ranking.rankedCandidates.length;
        addMultiExitDiagnostics(aggregate.multiExitRectangles, scenarioMultiExit);
        for (const patch of ranking.classificationDiagnostics.mutationDiagnostics.patchDiagnostics) {
            incrementReason(patchReasonCounts, patch.rejectionReason);
        }
        for (const candidate of ranking.classificationDiagnostics.mutationDiagnostics.candidateDiagnostics) {
            incrementReason(candidateReasonCounts, candidate.rejectionReason);
        }
        for (const classification of ranking.classificationDiagnostics.classifications) {
            incrementReason(snakeReasonCounts, classification.reason);
        }
        aggregate.scenarioSummaries.push({
            scenarioId: scenario.scenarioId,
            kind: scenario.kind,
            snakeLength: state.snake.segments.length,
            fillRatio: state.snake.segments.length / state.map.graph.nodes.length,
            apple: state.appleNodeId,
            currentPathLen: ranking.aggregate.bestCandidate?.currentLockedCyclePathLen ?? currentPathLen(state, lockedCycle),
            rectanglesScanned: mutationAggregate.patchesScanned,
            validTwoTerminalPatches: mutationAggregate.validTwoTerminalPatches,
            graphValidCandidates: mutationAggregate.graphValidCandidates,
            snakeUsableCandidates: ranking.classificationDiagnostics.aggregate.usableCandidates,
            improvingCandidates: ranking.aggregate.improvingCandidates,
            selectedCandidateUnderCurrentScoring: selectedUnderCurrentScoring,
            bestImprovement: ranking.aggregate.bestImprovement,
            multiExitRectangles: scenarioMultiExit
        });
    }
    aggregate.topPatchRejectionReasons = topReasons(patchReasonCounts);
    aggregate.topCandidateRejectionReasons = topReasons(candidateReasonCounts);
    aggregate.topSnakeRejectionReasons = topReasons(snakeReasonCounts);
    return aggregate;
}
export function analyzeMultiExitRectangles(graph, cycle, options = {}) {
    const diagnostics = createEmptyMultiExitDiagnostics();
    for (const rect of enumerateRectangles(graph, options)) {
        const rectNodeSet = buildRectNodeSet(graph, rect);
        if (rectNodeSet.size !== rect.width * rect.height) {
            continue;
        }
        const crossings = getCycleCutCrossings(cycle, rectNodeSet);
        if (crossings.length !== 4 && crossings.length !== 6 && crossings.length !== 8) {
            continue;
        }
        const plausible = hasPlausibleMultiExitInternalDegreePattern(cycle, rectNodeSet);
        switch (crossings.length) {
            case 4:
                diagnostics.cut4 += 1;
                diagnostics.plausibleCut4 += plausible ? 1 : 0;
                break;
            case 6:
                diagnostics.cut6 += 1;
                diagnostics.plausibleCut6 += plausible ? 1 : 0;
                break;
            case 8:
                diagnostics.cut8 += 1;
                diagnostics.plausibleCut8 += plausible ? 1 : 0;
                break;
        }
    }
    return diagnostics;
}
function resolveScenarioConfigOptions(state, lockedCycle, config) {
    const focusMode = config.focusMode ?? 'none';
    const focusNodeIds = focusMode === 'none'
        ? []
        : focusedNodeIdsForScenario(state, lockedCycle, focusMode);
    return {
        ...config,
        focusNodeIds,
        focusPadding: config.focusPadding ?? 0
    };
}
function focusedNodeIdsForScenario(state, lockedCycle, focusMode) {
    const head = state.snake.segments[0] ?? null;
    const tail = state.snake.segments[state.snake.segments.length - 1] ?? null;
    const apple = state.appleNodeId;
    const focus = new Set();
    if (head) {
        focus.add(head);
    }
    if (apple) {
        focus.add(apple);
    }
    if (tail) {
        focus.add(tail);
    }
    if (focusMode === 'head-apple-arc' && head && apple) {
        const headIndex = lockedCycle.indexOf(head);
        const appleIndex = lockedCycle.indexOf(apple);
        if (headIndex !== -1 && appleIndex !== -1) {
            let index = headIndex;
            for (let steps = 0; steps <= lockedCycle.length; steps += 1) {
                focus.add(lockedCycle[index]);
                if (index === appleIndex) {
                    break;
                }
                index = (index + 1) % lockedCycle.length;
            }
        }
    }
    return [...focus].sort();
}
function hasSelectedCandidateUnderCurrentScoring(rankedCandidates) {
    return rankedCandidates.some((candidate) => {
        if ((candidate.features.pathLenImprovement ?? Number.NEGATIVE_INFINITY) < 1) {
            return false;
        }
        return candidate.features.usabilityMode === 'immediate-locked' ||
            (candidate.features.usabilityMode === 'transition-valid' &&
                (candidate.classification.transitionPlanSummary?.bestSuccessfulPath?.length ?? 0) > 0);
    });
}
function currentPathLen(state, lockedCycle) {
    const head = state.snake.segments[0];
    const apple = state.appleNodeId;
    if (!head || !apple) {
        return null;
    }
    const headIndex = lockedCycle.indexOf(head);
    const appleIndex = lockedCycle.indexOf(apple);
    if (headIndex === -1 || appleIndex === -1) {
        return null;
    }
    return appleIndex >= headIndex
        ? appleIndex - headIndex
        : lockedCycle.length - headIndex + appleIndex;
}
function getLockedCycle(state) {
    return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}
function createEmptyConfigDiagnostics(config) {
    return {
        configId: config.id,
        label: config.label,
        options: {
            maxWidth: finiteOrNull(config.maxWidth),
            maxHeight: finiteOrNull(config.maxHeight),
            maxArea: finiteOrNull(config.maxArea),
            maxPatchRectsScanned: finiteOrNull(config.maxPatchRectsScanned),
            maxPatchCandidates: finiteOrNull(config.maxPatchCandidates),
            focusMode: config.focusMode ?? 'none',
            focusPadding: config.focusPadding ?? 0,
            cacheMaxArea: finiteOrNull(config.pathCacheOptions?.maxArea),
            cacheMaxPathsPerTerminalPair: finiteOrNull(config.pathCacheOptions?.maxPathsPerTerminalPair),
            cacheMaxExpansions: finiteOrNull(config.pathCacheOptions?.maxExpansions)
        },
        rectanglesScanned: 0,
        validTwoTerminalPatches: 0,
        alternativesConsidered: 0,
        graphValidCandidates: 0,
        snakeUsableCandidates: 0,
        improvingCandidates: 0,
        selectedCandidatesUnderCurrentScoring: 0,
        bestImprovement: null,
        budgetExhaustedScenarios: 0,
        multiExitRectangles: createEmptyMultiExitDiagnostics(),
        workCounters: {
            scenariosAnalyzed: 0,
            rectanglesScanned: 0,
            alternativesConsidered: 0,
            rawCandidatesGenerated: 0,
            candidateDiagnostics: 0,
            classifications: 0,
            rankedCandidates: 0
        },
        topPatchRejectionReasons: [],
        topCandidateRejectionReasons: [],
        topSnakeRejectionReasons: [],
        scenarioSummaries: []
    };
}
function buildRectNodeSet(graph, rect) {
    const nodeByCoord = new Map(graph.nodes.map((node) => [`${node.x},${node.y}`, node.id]));
    const nodeSet = new Set();
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
            const nodeId = nodeByCoord.get(`${x},${y}`);
            if (nodeId) {
                nodeSet.add(nodeId);
            }
        }
    }
    return nodeSet;
}
function hasPlausibleMultiExitInternalDegreePattern(cycle, rectNodeSet) {
    const insideDegree = new Map();
    const cutDegree = new Map();
    for (const nodeId of rectNodeSet) {
        insideDegree.set(nodeId, 0);
        cutDegree.set(nodeId, 0);
    }
    for (const edge of extractInsideCycleEdges(cycle, rectNodeSet)) {
        insideDegree.set(edge.from, (insideDegree.get(edge.from) ?? 0) + 1);
        insideDegree.set(edge.to, (insideDegree.get(edge.to) ?? 0) + 1);
    }
    for (const crossing of getCycleCutCrossings(cycle, rectNodeSet)) {
        cutDegree.set(crossing.insideNode, (cutDegree.get(crossing.insideNode) ?? 0) + 1);
    }
    for (const nodeId of rectNodeSet) {
        if ((insideDegree.get(nodeId) ?? 0) + (cutDegree.get(nodeId) ?? 0) !== 2) {
            return false;
        }
    }
    return true;
}
function createEmptyMultiExitDiagnostics() {
    return {
        cut4: 0,
        cut6: 0,
        cut8: 0,
        plausibleCut4: 0,
        plausibleCut6: 0,
        plausibleCut8: 0
    };
}
function addMultiExitDiagnostics(target, source) {
    target.cut4 += source.cut4;
    target.cut6 += source.cut6;
    target.cut8 += source.cut8;
    target.plausibleCut4 += source.plausibleCut4;
    target.plausibleCut6 += source.plausibleCut6;
    target.plausibleCut8 += source.plausibleCut8;
}
function incrementReason(counts, reason) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
}
function topReasons(counts) {
    return [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
        .slice(0, 8);
}
function maxNullable(left, right) {
    if (right === null) {
        return left;
    }
    return left === null ? right : Math.max(left, right);
}
function finiteOrNull(value) {
    return value === undefined || !Number.isFinite(value) ? null : value;
}
