import { advanceGame, listPotentialMoves } from './game-engine.js';
import { CertifiedHamiltonianInvariantError } from './certified-hamiltonian-error.js';
import { appleForward, distanceForwardOnCycle, explainLockedCertificateFailure, validLockedCertificate } from './hamiltonian-certificate.js';
import { compareCandidateCycles, computeCycleFeatures, defaultCycleScoreWeights, scoreCycleFeatures } from './cycle-scoring.js';
import { selectCertifiedPhase } from './certified-phase-controller.js';
import { cycleEdgeSignature } from './cycle-library.js';
import { validateHamiltonianCycle } from './map-validator.js';
import { defaultPatchMutationCandidateCache, getOrCreateV1GraphCandidates, getOrCreateV2GraphCandidates } from './patch-mutation-candidate-cache.js';
import { classifyGeneratedPatchMutationCandidatesForSnake, rankPatchMutationCandidates, rankGeneratedPatchMutationCandidates } from './two-terminal-patch-mutation.js';
import { classifyGeneratedV2FourExitSpliceCandidatesForSnake, generateV2FourExitSpliceCandidates, generateV2FourExitSpliceCandidatesFromRectangles } from './multi-terminal-patch-diagnostics.js';
import { generateRectanglePatchMutationCandidatesFromRectangles, generateTargetedRectangles } from './head-apple-rectangle-diagnostics.js';
export function createCertifiedRuntimeSwitchingDiagnostics() {
    return {
        applesEaten: 0,
        switchAttempts: 0,
        successfulSwitches: 0,
        candidateCyclesChecked: 0,
        candidatesPassingProofGate: 0,
        candidatesRejectedByGraphValidity: 0,
        candidatesRejectedByLockedCertificate: 0,
        candidatesRejectedByAppleForward: 0,
        oldPathLenBeforeSwitch: [],
        newPathLenAfterSwitch: [],
        averagePathLenImprovement: null,
        oldCycleKept: 0,
        noValidSwitchExists: 0,
        proofValidButNotImproving: 0,
        proofValidAndPathLenImproving: 0,
        proofValidAndScoreImproving: 0,
        bestObservedPathLenImprovement: null,
        bestObservedScoreImprovement: null,
        averageBestCandidatePathLenDelta: null,
        averageCurrentPathLen: null,
        averageBestCandidatePathLen: null,
        patchMutationAttempted: 0,
        patchRectsScanned: 0,
        patchGraphValidCandidates: 0,
        patchSnakeUsableCandidates: 0,
        patchImmediateLockedCandidates: 0,
        patchNonImmediateCandidates: 0,
        patchTransitionCandidatesAfterPrefilter: 0,
        patchTransitionCandidatesSkippedByPrefilter: 0,
        patchTransitionSearchesStarted: 0,
        patchTransitionSearchesSucceeded: 0,
        patchTransitionReachableCandidates: 0,
        patchRejectedByLockedCertificate: 0,
        patchImprovingCandidates: 0,
        patchSelectedCandidates: 0,
        patchRejectedNoImprovement: 0,
        patchRejectedBudget: 0,
        patchImmediateLockedSelectedWithoutTransition: 0,
        bestPatchImprovement: null,
        patchGenerationMs: 0,
        v1CandidateCacheHits: 0,
        v1CandidateCacheMisses: 0,
        cachedV1GraphCandidates: 0,
        v1GenerationMs: 0,
        v1CertificationMs: 0,
        v1TransitionSearchMs: 0,
        v1ScoringMs: 0,
        v2PatchAttempted: 0,
        v2RectsScanned: 0,
        v2RawCandidatesGenerated: 0,
        v2GraphValidCandidates: 0,
        v2SnakeUsableCandidates: 0,
        v2ImmediateLockedCandidates: 0,
        v2NonImmediateCandidates: 0,
        v2TransitionCandidatesAfterPrefilter: 0,
        v2TransitionCandidatesSkippedByPrefilter: 0,
        v2TransitionSearchesStarted: 0,
        v2TransitionSearchesSucceeded: 0,
        v2TransitionReachableCandidates: 0,
        v2RejectedByLockedCertificate: 0,
        v2ImprovingCandidates: 0,
        v2SelectedCandidates: 0,
        v2ImmediateLockedSelections: 0,
        v2TransitionSelections: 0,
        v2RejectedNoImprovement: 0,
        v2RejectedBudget: 0,
        v2ImmediateLockedSelectedWithoutTransition: 0,
        bestV2Improvement: null,
        v2DetectionMs: 0,
        v2PathCoverSolvingMs: 0,
        v2SplicingValidationMs: 0,
        v2CandidateCacheHits: 0,
        v2CandidateCacheMisses: 0,
        cachedV2GraphCandidates: 0,
        v2GenerationMs: 0,
        v2CertificationMs: 0,
        v2TransitionSearchMs: 0,
        v2ScoringMs: 0,
        rectangleSearchMode: 'broad',
        targetedRectanglesGenerated: 0,
        targetedRectanglesUsed: 0,
        broadFallbackUsed: 0,
        arcChunkRectangles: 0,
        headAppleRectangles: 0,
        candidateYieldPerRectangle: null,
        improvingYieldPerRectangle: null,
        selectedCandidateSource: null,
        switchAttemptSummaries: []
    };
}
const DEFAULT_CERTIFIED_CYCLE_SELECTION_OPTIONS = {
    scoreWeights: defaultCycleScoreWeights,
    minimumPathImprovement: 1,
    enablePatchMutation: false,
    maxPatchRectsScanned: Number.POSITIVE_INFINITY,
    maxPatchCandidates: Number.POSITIVE_INFINITY,
    maxPatchArea: 20,
    maxPatchWidth: 6,
    maxPatchHeight: 6,
    maxTransitionPathsPerCandidate: 64,
    maxTransitionSlack: 6,
    enableV2PatchMutation: false,
    maxV2FillRatio: 0.15,
    maxV2RectsScanned: 500,
    maxV2Candidates: 300,
    maxV2PatchArea: 24,
    maxV2TransitionPathsPerCandidate: 8,
    maxV2TransitionSlack: 2,
    maxV2TransitionPathLength: 16,
    maxV2TransitionSearchStates: 10_000,
    maxV2SolverExpansions: 100_000,
    maxV2PathCoversPerPatch: 64,
    enablePatchMutationCandidateCache: true,
    patchMutationCandidateCache: defaultPatchMutationCandidateCache,
    patchRectangleSearchMode: 'targeted-then-broad-fallback',
    arcChunkSize: 8,
    arcChunkStride: 4,
    arcGrowShrinkRadius: 1,
    maxTargetedRectangles: 64,
    fallbackToBroadIfNoCandidates: true,
    transitionPrefilterMode: 'none',
    maxTransitionCandidatesPerPlanningEvent: Number.POSITIVE_INFINITY,
    minCheapImprovementForTransitionSearch: Number.NEGATIVE_INFINITY,
    preferImmediateLockedBeforeTransitionSearch: false,
    maxTransitionSearchesPerSource: Number.POSITIVE_INFINITY
};
function buildCycleIndexMap(cycle) {
    const indexByNode = new Map();
    for (let index = 0; index < cycle.length; index += 1) {
        indexByNode.set(cycle[index], index);
    }
    return indexByNode;
}
function certifiedInvariantError(message) {
    throw new CertifiedHamiltonianInvariantError(message);
}
export function getCertifiedLockedCycle(state) {
    return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}
function getCycleSuccessor(cycle, head) {
    const indexByNode = buildCycleIndexMap(cycle);
    const headIndex = indexByNode.get(head);
    if (headIndex === undefined) {
        return null;
    }
    return cycle[(headIndex + 1) % cycle.length] ?? null;
}
function getStrictCycleDirection(state, cycle) {
    const head = state.snake.segments[0];
    if (!head) {
        return null;
    }
    const successor = getCycleSuccessor(cycle, head);
    if (!successor) {
        return null;
    }
    return listPotentialMoves(state).find((candidate) => candidate.to === successor)?.direction ?? null;
}
function currentLockedCycleSignature(state) {
    return cycleEdgeSignature(getCertifiedLockedCycle(state));
}
function isSameAsLockedCycle(state, entry) {
    if (state.lockedHamiltonianCycleId && state.lockedHamiltonianCycleId === entry.id) {
        return true;
    }
    return currentLockedCycleSignature(state) === cycleEdgeSignature(entry.cycle);
}
export function canSwitchAndLock(state, candidateEntry) {
    if (!validateHamiltonianCycle(state.map.graph, candidateEntry.cycle)) {
        return false;
    }
    if (!validLockedCertificate(state.snake.segments, candidateEntry.cycle)) {
        return false;
    }
    if (state.appleNodeId !== null && !appleForward(state.snake.segments, state.appleNodeId, candidateEntry.cycle)) {
        return false;
    }
    return true;
}
export const CanSwitchAndLock = canSwitchAndLock;
function createCertifiedSwitchSelectionStats() {
    return {
        candidateCyclesChecked: 0,
        candidatesPassingGraphValidity: 0,
        candidatesPassingLockedCertificate: 0,
        candidatesPassingAppleForward: 0,
        candidatesPassingProofGate: 0,
        candidatesRejectedByGraphValidity: 0,
        candidatesRejectedByLockedCertificate: 0,
        candidatesRejectedByAppleForward: 0,
        hadAnyProofPassingCandidate: false,
        oldPathLenBeforeSwitch: null,
        newPathLenAfterSwitch: null,
        bestProofValidPathLenDelta: null,
        bestProofValidScoreDelta: null,
        bestProofValidCandidatePathLen: null,
        switchAttemptSummary: null,
        selectedCandidateSource: 'current-cycle',
        patchMutationAttempted: false,
        patchRectsScanned: 0,
        patchGraphValidCandidates: 0,
        patchSnakeUsableCandidates: 0,
        patchImmediateLockedCandidates: 0,
        patchNonImmediateCandidates: 0,
        patchTransitionCandidatesAfterPrefilter: 0,
        patchTransitionCandidatesSkippedByPrefilter: 0,
        patchTransitionSearchesStarted: 0,
        patchTransitionSearchesSucceeded: 0,
        patchTransitionReachableCandidates: 0,
        patchRejectedByLockedCertificate: 0,
        patchImprovingCandidates: 0,
        patchRejectedNoImprovement: 0,
        patchRejectedBudget: false,
        patchImmediateLockedSelectedWithoutTransition: false,
        bestPatchImprovement: null,
        patchGenerationMs: 0,
        v1CandidateCacheHits: 0,
        v1CandidateCacheMisses: 0,
        cachedV1GraphCandidates: 0,
        v1GenerationMs: 0,
        v1CertificationMs: 0,
        v1TransitionSearchMs: 0,
        v1ScoringMs: 0,
        v2PatchAttempted: false,
        v2RectsScanned: 0,
        v2RawCandidatesGenerated: 0,
        v2GraphValidCandidates: 0,
        v2SnakeUsableCandidates: 0,
        v2ImmediateLockedCandidates: 0,
        v2NonImmediateCandidates: 0,
        v2TransitionCandidatesAfterPrefilter: 0,
        v2TransitionCandidatesSkippedByPrefilter: 0,
        v2TransitionSearchesStarted: 0,
        v2TransitionSearchesSucceeded: 0,
        v2TransitionReachableCandidates: 0,
        v2RejectedByLockedCertificate: 0,
        v2ImprovingCandidates: 0,
        v2RejectedNoImprovement: 0,
        v2RejectedBudget: false,
        v2ImmediateLockedSelectedWithoutTransition: false,
        bestV2Improvement: null,
        v2DetectionMs: 0,
        v2PathCoverSolvingMs: 0,
        v2SplicingValidationMs: 0,
        v2CandidateCacheHits: 0,
        v2CandidateCacheMisses: 0,
        cachedV2GraphCandidates: 0,
        v2GenerationMs: 0,
        v2CertificationMs: 0,
        v2TransitionSearchMs: 0,
        v2ScoringMs: 0,
        rectangleSearchMode: 'broad',
        targetedRectanglesGenerated: 0,
        targetedRectanglesUsed: 0,
        broadFallbackUsed: 0,
        arcChunkRectangles: 0,
        headAppleRectangles: 0,
        candidateYieldPerRectangle: null,
        improvingYieldPerRectangle: null
    };
}
function rankCandidateEntries(state, currentCycle, candidates, options) {
    const baselineFeatures = computeCycleFeatures(state, currentCycle, currentCycle);
    const baselinePathLen = baselineFeatures.pathLen;
    if (baselinePathLen === null) {
        return null;
    }
    const accepted = candidates
        .map((entry) => ({
        entry,
        features: computeCycleFeatures(state, currentCycle, entry.cycle)
    }))
        .filter(({ features }) => features.pathLen !== null && features.pathLen <= baselinePathLen - options.minimumPathImprovement);
    if (accepted.length === 0) {
        return null;
    }
    accepted.sort((left, right) => {
        const leftPathLen = left.features.pathLen ?? Number.POSITIVE_INFINITY;
        const rightPathLen = right.features.pathLen ?? Number.POSITIVE_INFINITY;
        if (leftPathLen !== rightPathLen) {
            return leftPathLen - rightPathLen;
        }
        return compareCandidateCycles(left.features, right.features, options.scoreWeights);
    });
    return accepted[0]?.entry ?? null;
}
function patchCandidateCycleId(features) {
    return `v1-patch:${features.candidateId}`;
}
function v2PatchCandidateCycleId(features) {
    return `v2-patch:${features.candidateId}`;
}
function buildPatchMutationClassificationOptions(options) {
    return {
        maxWidth: options.maxPatchWidth,
        maxHeight: options.maxPatchHeight,
        maxArea: options.maxPatchArea,
        maxPatchRectsScanned: Number.isFinite(options.maxPatchRectsScanned) ? options.maxPatchRectsScanned : undefined,
        maxPatchCandidates: Number.isFinite(options.maxPatchCandidates) ? options.maxPatchCandidates : undefined,
        pathCacheOptions: {
            maxArea: options.maxPatchArea
        },
        patchRectangleSearchMode: options.patchRectangleSearchMode,
        arcChunkSize: options.arcChunkSize,
        arcChunkStride: options.arcChunkStride,
        arcGrowShrinkRadius: options.arcGrowShrinkRadius,
        maxTargetedRectangles: options.maxTargetedRectangles,
        fallbackToBroadIfNoCandidates: options.fallbackToBroadIfNoCandidates,
        transitionPrefilterMode: options.transitionPrefilterMode,
        maxTransitionCandidatesPerPlanningEvent: Number.isFinite(options.maxTransitionCandidatesPerPlanningEvent)
            ? options.maxTransitionCandidatesPerPlanningEvent
            : undefined,
        minCheapImprovementForTransitionSearch: options.minCheapImprovementForTransitionSearch,
        preferImmediateLockedBeforeTransitionSearch: options.preferImmediateLockedBeforeTransitionSearch,
        maxTransitionSearchesPerSource: Number.isFinite(options.maxTransitionSearchesPerSource)
            ? options.maxTransitionSearchesPerSource
            : undefined,
        minimumPathImprovement: options.minimumPathImprovement,
        transitionOptions: {
            maxPaths: options.maxTransitionPathsPerCandidate,
            slack: options.maxTransitionSlack
        }
    };
}
function buildV2PatchMutationClassificationOptions(options) {
    return {
        maxWidth: options.maxPatchWidth,
        maxHeight: options.maxPatchHeight,
        maxArea: options.maxV2PatchArea,
        maxPatchArea4Exit: options.maxV2PatchArea,
        maxPatchRectsScanned: Number.isFinite(options.maxV2RectsScanned) ? options.maxV2RectsScanned : undefined,
        maxCoversPerPatch: options.maxV2PathCoversPerPatch,
        maxSolverExpansionsPerPatch: options.maxV2SolverExpansions,
        patchRectangleSearchMode: options.patchRectangleSearchMode,
        arcChunkSize: options.arcChunkSize,
        arcChunkStride: options.arcChunkStride,
        arcGrowShrinkRadius: options.arcGrowShrinkRadius,
        maxTargetedRectangles: options.maxTargetedRectangles,
        fallbackToBroadIfNoCandidates: options.fallbackToBroadIfNoCandidates,
        transitionPrefilterMode: options.transitionPrefilterMode,
        maxTransitionCandidatesPerPlanningEvent: Number.isFinite(options.maxTransitionCandidatesPerPlanningEvent)
            ? options.maxTransitionCandidatesPerPlanningEvent
            : undefined,
        minCheapImprovementForTransitionSearch: options.minCheapImprovementForTransitionSearch,
        preferImmediateLockedBeforeTransitionSearch: options.preferImmediateLockedBeforeTransitionSearch,
        maxTransitionSearchesPerSource: Number.isFinite(options.maxTransitionSearchesPerSource)
            ? options.maxTransitionSearchesPerSource
            : undefined,
        minimumPathImprovement: options.minimumPathImprovement,
        transitionOptions: {
            maxPaths: options.maxV2TransitionPathsPerCandidate,
            slack: options.maxV2TransitionSlack,
            maxPathLength: options.maxV2TransitionPathLength,
            maxSearchStates: options.maxV2TransitionSearchStates
        }
    };
}
function buildExpectedHeadPathForTransition(state, directions) {
    const initialHead = state.snake.segments[0];
    if (!initialHead || directions.length === 0) {
        return null;
    }
    const expectedHeadPath = [initialHead];
    let current = state;
    for (const direction of directions) {
        current = advanceGame(current, direction, 0, { next: () => 0 });
        const head = current.snake.segments[0];
        if (!head) {
            return null;
        }
        expectedHeadPath.push(head);
        if (current.applesEaten > state.applesEaten) {
            return expectedHeadPath;
        }
        if (current.isOver) {
            return null;
        }
    }
    return null;
}
function buildCertifiedTransitionPlanFromDirections(state, source, targetCycleId, targetCycle, directions) {
    if (!state.appleNodeId || !directions || directions.length === 0) {
        return null;
    }
    const expectedHeadPath = buildExpectedHeadPathForTransition(state, directions);
    if (!expectedHeadPath || expectedHeadPath.length !== directions.length + 1) {
        return null;
    }
    return {
        source,
        targetCycleId,
        targetCycle: [...targetCycle],
        certifiedAppleNodeId: state.appleNodeId,
        certifiedAtApplesEaten: state.applesEaten,
        directions: [...directions],
        expectedHeadPath,
        nextDirectionIndex: 0
    };
}
function buildCertifiedTransitionPlan(state, rankedCandidate) {
    if (rankedCandidate.features.usabilityMode !== 'transition-valid') {
        return null;
    }
    return buildCertifiedTransitionPlanFromDirections(state, 'v1-patch', patchCandidateCycleId(rankedCandidate.features), rankedCandidate.candidate.cycle, rankedCandidate.classification.transitionPlanSummary?.bestSuccessfulPath ?? null);
}
function buildV2CertifiedTransitionPlan(state, rankedCandidate) {
    if (rankedCandidate.features.usabilityMode !== 'transition-valid') {
        return null;
    }
    return buildCertifiedTransitionPlanFromDirections(state, 'v2-patch', v2PatchCandidateCycleId(rankedCandidate.features), rankedCandidate.candidate.cycle, rankedCandidate.classification.transitionPlanSummary?.bestSuccessfulPath ?? null);
}
function rankV1PatchCandidatesForRectangles(state, currentCycle, classificationOptions, options, rectangles) {
    const cachedGeneration = options.enablePatchMutationCandidateCache
        ? getOrCreateV1GraphCandidates({
            cache: options.patchMutationCandidateCache,
            mapId: state.map.id,
            graph: state.map.graph,
            cycle: currentCycle,
            options: classificationOptions,
            rectangles: rectangles ?? undefined
        })
        : null;
    const generated = cachedGeneration?.result ?? (rectangles
        ? generateRectanglePatchMutationCandidatesFromRectangles(state.map.graph, currentCycle, rectangles, classificationOptions)
        : null);
    const ranking = generated
        ? rankGeneratedPatchMutationCandidates(state, currentCycle, classifyGeneratedPatchMutationCandidatesForSnake(state, generated, generated.candidates, classificationOptions))
        : rankPatchMutationCandidates(state, state.map.graph, currentCycle, classificationOptions);
    return {
        ...ranking,
        cacheHit: cachedGeneration?.cacheHit ?? false,
        cacheMiss: Boolean(cachedGeneration && !cachedGeneration.cacheHit)
    };
}
function generateV2PatchCandidatesForRectangles(state, currentCycle, v2Options, options, rectangles) {
    const cachedGeneration = options.enablePatchMutationCandidateCache
        ? getOrCreateV2GraphCandidates({
            cache: options.patchMutationCandidateCache,
            mapId: state.map.id,
            graph: state.map.graph,
            cycle: currentCycle,
            options: {
                ...v2Options,
                maxV2Candidates: options.maxV2Candidates
            },
            rectangles: rectangles ?? undefined
        })
        : null;
    return {
        spliceDiagnostics: cachedGeneration?.result ?? (rectangles
            ? generateV2FourExitSpliceCandidatesFromRectangles(state.map.graph, currentCycle, rectangles, v2Options)
            : generateV2FourExitSpliceCandidates(state.map.graph, currentCycle, v2Options)),
        cacheHit: cachedGeneration?.cacheHit ?? false,
        cacheMiss: Boolean(cachedGeneration && !cachedGeneration.cacheHit)
    };
}
function buildRuntimeTargetedRectangles(state, options, mode) {
    if (!mode || mode === 'broad') {
        return {
            rectangles: null,
            arcChunkRectangles: 0,
            headAppleRectangles: 0
        };
    }
    const targetedMode = mode === 'targeted-then-broad-fallback'
        ? 'arc-chunk'
        : mode;
    const rectangleOptions = {
        maxWidth: options.maxPatchWidth,
        maxHeight: options.maxPatchHeight,
        maxArea: Math.max(options.maxPatchArea, options.maxV2PatchArea),
        maxTargetRectangles: Math.min(options.maxTargetedRectangles, Number.isFinite(options.maxPatchRectsScanned) ? options.maxPatchRectsScanned : options.maxTargetedRectangles, Number.isFinite(options.maxV2RectsScanned) ? options.maxV2RectsScanned : options.maxTargetedRectangles),
        arcChunkSize: options.arcChunkSize,
        arcChunkStride: options.arcChunkStride,
        arcGrowShrinkRadius: options.arcGrowShrinkRadius
    };
    const rectangles = generateTargetedRectangles(state, targetedMode, rectangleOptions);
    const arcChunkRectangles = targetedMode === 'arc-chunk' || targetedMode === 'combined-targeted'
        ? generateTargetedRectangles(state, 'arc-chunk', rectangleOptions).length
        : 0;
    const headAppleRectangles = targetedMode === 'head-apple' || targetedMode === 'combined-targeted'
        ? generateTargetedRectangles(state, 'head-apple', rectangleOptions).length
        : 0;
    return {
        rectangles,
        arcChunkRectangles,
        headAppleRectangles
    };
}
function shouldUseBroadFallback(graphValidCandidates, usableCandidates, options) {
    if (options.patchRectangleSearchMode !== 'targeted-then-broad-fallback') {
        return false;
    }
    return options.fallbackToBroadIfNoCandidates
        ? graphValidCandidates === 0 || usableCandidates === 0
        : graphValidCandidates === 0;
}
function yieldPerRectangle(count, rectangles) {
    return rectangles > 0 ? count / rectangles : null;
}
function selectBestPatchMutationCandidate(state, currentCycle, options) {
    const classificationOptions = buildPatchMutationClassificationOptions(options);
    const targetedRectangles = buildRuntimeTargetedRectangles(state, options, options.patchRectangleSearchMode);
    let broadFallbackUsed = false;
    let ranking = rankV1PatchCandidatesForRectangles(state, currentCycle, classificationOptions, options, targetedRectangles.rectangles);
    if (shouldUseBroadFallback(ranking.classificationDiagnostics.mutationDiagnostics.aggregate.graphValidCandidates, ranking.classificationDiagnostics.aggregate.usableCandidates, options)) {
        broadFallbackUsed = true;
        ranking = rankV1PatchCandidatesForRectangles(state, currentCycle, classificationOptions, options, null);
    }
    const improvingCandidates = ranking.rankedCandidates.filter((candidate) => (candidate.features.pathLenImprovement ?? Number.NEGATIVE_INFINITY) >= options.minimumPathImprovement);
    let selected = null;
    for (const selectedRankedCandidate of improvingCandidates) {
        const transitionPlan = buildCertifiedTransitionPlan(state, selectedRankedCandidate);
        if (selectedRankedCandidate.features.usabilityMode === 'immediate-locked' || transitionPlan) {
            selected = {
                source: 'v1-patch',
                cycle: selectedRankedCandidate.candidate.cycle,
                cycleId: patchCandidateCycleId(selectedRankedCandidate.features),
                pathLen: selectedRankedCandidate.features.pathLenToCurrentApple ?? selectedRankedCandidate.features.transitionPathLength,
                pathLenImprovement: selectedRankedCandidate.features.pathLenImprovement,
                score: selectedRankedCandidate.features.patchMutationScore,
                transitionPlan
            };
            break;
        }
    }
    return {
        selected,
        stats: {
            patchMutationAttempted: true,
            patchRectsScanned: ranking.classificationDiagnostics.mutationDiagnostics.aggregate.patchesScanned +
                (broadFallbackUsed ? targetedRectangles.rectangles?.length ?? 0 : 0),
            patchGraphValidCandidates: ranking.classificationDiagnostics.mutationDiagnostics.aggregate.graphValidCandidates,
            patchSnakeUsableCandidates: ranking.classificationDiagnostics.aggregate.usableCandidates,
            patchImmediateLockedCandidates: ranking.classificationDiagnostics.aggregate.immediateLockedCandidates,
            patchNonImmediateCandidates: ranking.classificationDiagnostics.aggregate.nonImmediateCandidates,
            patchTransitionCandidatesAfterPrefilter: ranking.classificationDiagnostics.aggregate.transitionCandidatesAfterPrefilter,
            patchTransitionCandidatesSkippedByPrefilter: ranking.classificationDiagnostics.aggregate.transitionCandidatesSkippedByPrefilter,
            patchTransitionSearchesStarted: ranking.classificationDiagnostics.aggregate.transitionSearchesStarted,
            patchTransitionSearchesSucceeded: ranking.classificationDiagnostics.aggregate.transitionSearchesSucceeded,
            patchTransitionReachableCandidates: ranking.classificationDiagnostics.aggregate.transitionReachableCandidates,
            patchRejectedByLockedCertificate: ranking.classificationDiagnostics.aggregate.rejectedByLockedCertificate,
            patchImprovingCandidates: ranking.aggregate.improvingCandidates,
            patchRejectedNoImprovement: ranking.aggregate.usableCandidates - ranking.aggregate.improvingCandidates,
            patchRejectedBudget: ranking.classificationDiagnostics.mutationDiagnostics.aggregate.budgetExhausted,
            patchImmediateLockedSelectedWithoutTransition: selected?.transitionPlan === null &&
                selected?.source === 'v1-patch' &&
                ranking.classificationDiagnostics.aggregate.transitionSearchesStarted === 0 &&
                ranking.classificationDiagnostics.aggregate.nonImmediateCandidates > 0,
            bestPatchImprovement: ranking.aggregate.bestImprovement,
            patchGenerationMs: ranking.cacheHit
                ? 0
                : ranking.classificationDiagnostics.mutationDiagnostics.profile.generationMs,
            v1CandidateCacheHits: ranking.cacheHit ? 1 : 0,
            v1CandidateCacheMisses: ranking.cacheMiss ? 1 : 0,
            cachedV1GraphCandidates: ranking.cacheHit ? ranking.classificationDiagnostics.mutationDiagnostics.candidates.length : 0,
            v1GenerationMs: ranking.cacheHit
                ? 0
                : ranking.classificationDiagnostics.mutationDiagnostics.profile.generationMs,
            v1CertificationMs: ranking.profile.certificationMs,
            v1TransitionSearchMs: ranking.profile.transitionSearchMs,
            v1ScoringMs: ranking.profile.scoringMs,
            rectangleSearchMode: options.patchRectangleSearchMode,
            targetedRectanglesGenerated: targetedRectangles.rectangles?.length ?? 0,
            targetedRectanglesUsed: targetedRectangles.rectangles?.length ?? 0,
            broadFallbackUsed: broadFallbackUsed ? 1 : 0,
            arcChunkRectangles: targetedRectangles.arcChunkRectangles,
            headAppleRectangles: targetedRectangles.headAppleRectangles,
            candidateYieldPerRectangle: yieldPerRectangle(ranking.classificationDiagnostics.mutationDiagnostics.aggregate.graphValidCandidates, ranking.classificationDiagnostics.mutationDiagnostics.aggregate.patchesScanned),
            improvingYieldPerRectangle: yieldPerRectangle(ranking.aggregate.improvingCandidates, ranking.classificationDiagnostics.mutationDiagnostics.aggregate.patchesScanned)
        }
    };
}
function selectBestV2PatchMutationCandidate(state, currentCycle, options) {
    if (!options.enableV2PatchMutation || state.certifiedMode === 'transition' || state.appleNodeId === null || state.isOver) {
        return null;
    }
    const fillRatio = state.map.graph.nodes.length > 0
        ? state.snake.segments.length / state.map.graph.nodes.length
        : 1;
    if (fillRatio >= options.maxV2FillRatio) {
        return null;
    }
    const v2Options = buildV2PatchMutationClassificationOptions(options);
    const targetedRectangles = buildRuntimeTargetedRectangles(state, options, options.patchRectangleSearchMode);
    let broadFallbackUsed = false;
    let generation = generateV2PatchCandidatesForRectangles(state, currentCycle, v2Options, options, targetedRectangles.rectangles);
    let spliceDiagnostics = generation.spliceDiagnostics;
    const maxCandidates = Math.max(0, Math.floor(options.maxV2Candidates));
    let candidatesToClassify = spliceDiagnostics.candidates.slice(0, maxCandidates);
    let classification = classifyGeneratedV2FourExitSpliceCandidatesForSnake(state, candidatesToClassify, currentCycle, v2Options);
    if (shouldUseBroadFallback(spliceDiagnostics.aggregate.graphValidCandidates, classification.aggregate.snakeUsableCandidates, options)) {
        broadFallbackUsed = true;
        generation = generateV2PatchCandidatesForRectangles(state, currentCycle, v2Options, options, null);
        spliceDiagnostics = generation.spliceDiagnostics;
        candidatesToClassify = spliceDiagnostics.candidates.slice(0, maxCandidates);
        classification = classifyGeneratedV2FourExitSpliceCandidatesForSnake(state, candidatesToClassify, currentCycle, v2Options);
    }
    const improvingCandidates = classification.rankedCandidates.filter((candidate) => (candidate.features.pathLenImprovement ?? Number.NEGATIVE_INFINITY) >= options.minimumPathImprovement);
    let selected = null;
    for (const selectedRankedCandidate of improvingCandidates) {
        const transitionPlan = buildV2CertifiedTransitionPlan(state, selectedRankedCandidate);
        if (selectedRankedCandidate.features.usabilityMode === 'immediate-locked' || transitionPlan) {
            selected = {
                source: 'v2-patch',
                cycle: selectedRankedCandidate.candidate.cycle,
                cycleId: v2PatchCandidateCycleId(selectedRankedCandidate.features),
                pathLen: selectedRankedCandidate.features.candidatePathLenToApple ?? selectedRankedCandidate.features.transitionPathLength,
                pathLenImprovement: selectedRankedCandidate.features.pathLenImprovement,
                score: selectedRankedCandidate.features.finalV2MutationScore,
                transitionPlan
            };
            break;
        }
    }
    const candidateBudgetHit = candidatesToClassify.length < spliceDiagnostics.candidates.length;
    const rectBudgetHit = Number.isFinite(options.maxV2RectsScanned) &&
        spliceDiagnostics.pathCoverDiagnostics.patchScan.aggregate.rectanglesScanned >= options.maxV2RectsScanned;
    const solverBudgetHit = spliceDiagnostics.pathCoverDiagnostics.aggregate.budgetExhaustedPatches > 0;
    return {
        selected,
        stats: {
            v2PatchAttempted: true,
            v2RectsScanned: spliceDiagnostics.pathCoverDiagnostics.patchScan.aggregate.rectanglesScanned +
                (broadFallbackUsed ? targetedRectangles.rectangles?.length ?? 0 : 0),
            v2RawCandidatesGenerated: spliceDiagnostics.aggregate.rawCandidatesGenerated,
            v2GraphValidCandidates: spliceDiagnostics.aggregate.graphValidCandidates,
            v2SnakeUsableCandidates: classification.aggregate.snakeUsableCandidates,
            v2ImmediateLockedCandidates: classification.aggregate.immediateLockedCandidates,
            v2NonImmediateCandidates: classification.aggregate.nonImmediateCandidates,
            v2TransitionCandidatesAfterPrefilter: classification.aggregate.transitionCandidatesAfterPrefilter,
            v2TransitionCandidatesSkippedByPrefilter: classification.aggregate.transitionCandidatesSkippedByPrefilter,
            v2TransitionSearchesStarted: classification.aggregate.transitionSearchesStarted,
            v2TransitionSearchesSucceeded: classification.aggregate.transitionSearchesSucceeded,
            v2TransitionReachableCandidates: classification.aggregate.transitionReachableCandidates,
            v2RejectedByLockedCertificate: classification.aggregate.rejectedByLockedCertificate,
            v2ImprovingCandidates: classification.aggregate.improvingCandidates,
            v2RejectedNoImprovement: classification.aggregate.snakeUsableCandidates - classification.aggregate.improvingCandidates,
            v2RejectedBudget: candidateBudgetHit || rectBudgetHit || solverBudgetHit,
            v2ImmediateLockedSelectedWithoutTransition: selected?.transitionPlan === null &&
                selected?.source === 'v2-patch' &&
                classification.aggregate.transitionSearchesStarted === 0 &&
                classification.aggregate.nonImmediateCandidates > 0,
            bestV2Improvement: classification.aggregate.bestImprovement,
            v2DetectionMs: generation.cacheHit ? 0 : spliceDiagnostics.profile.detectionMs,
            v2PathCoverSolvingMs: generation.cacheHit ? 0 : spliceDiagnostics.profile.pathCoverSolvingMs,
            v2SplicingValidationMs: generation.cacheHit ? 0 : spliceDiagnostics.profile.splicingValidationMs,
            v2CandidateCacheHits: generation.cacheHit ? 1 : 0,
            v2CandidateCacheMisses: generation.cacheMiss ? 1 : 0,
            cachedV2GraphCandidates: generation.cacheHit ? spliceDiagnostics.candidates.length : 0,
            v2GenerationMs: generation.cacheHit ? 0 : spliceDiagnostics.profile.totalMs,
            v2CertificationMs: classification.profile.certificationMs,
            v2TransitionSearchMs: classification.profile.transitionSearchMs,
            v2ScoringMs: classification.profile.scoringMs,
            rectangleSearchMode: options.patchRectangleSearchMode,
            targetedRectanglesGenerated: targetedRectangles.rectangles?.length ?? 0,
            targetedRectanglesUsed: targetedRectangles.rectangles?.length ?? 0,
            broadFallbackUsed: broadFallbackUsed ? 1 : 0,
            arcChunkRectangles: targetedRectangles.arcChunkRectangles,
            headAppleRectangles: targetedRectangles.headAppleRectangles,
            candidateYieldPerRectangle: yieldPerRectangle(spliceDiagnostics.aggregate.graphValidCandidates, spliceDiagnostics.pathCoverDiagnostics.patchScan.aggregate.rectanglesScanned),
            improvingYieldPerRectangle: yieldPerRectangle(classification.aggregate.improvingCandidates, spliceDiagnostics.pathCoverDiagnostics.patchScan.aggregate.rectanglesScanned)
        }
    };
}
function betterSelectedCandidate(current, candidate) {
    if (!candidate) {
        return current;
    }
    if (!current) {
        return candidate;
    }
    const currentImprovement = current.pathLenImprovement ?? Number.NEGATIVE_INFINITY;
    const candidateImprovement = candidate.pathLenImprovement ?? Number.NEGATIVE_INFINITY;
    if (currentImprovement !== candidateImprovement) {
        return candidateImprovement > currentImprovement ? candidate : current;
    }
    const currentPathLen = current.pathLen ?? Number.POSITIVE_INFINITY;
    const candidatePathLen = candidate.pathLen ?? Number.POSITIVE_INFINITY;
    if (currentPathLen !== candidatePathLen) {
        return candidatePathLen < currentPathLen ? candidate : current;
    }
    // Preserve existing library behavior on exact ties.
    if (current.source === 'library' && candidate.source !== 'library') {
        return current;
    }
    if (candidate.source === 'library' && current.source !== 'library') {
        return candidate;
    }
    if (candidate.score !== current.score) {
        return candidate.score > current.score ? candidate : current;
    }
    return sourcePrecedence(candidate.source) < sourcePrecedence(current.source) ? candidate : current;
}
function sourcePrecedence(source) {
    switch (source) {
        case 'library':
            return 0;
        case 'transition':
            return 1;
        case 'v1-patch':
            return 2;
        case 'v2-patch':
            return 3;
        case 'current-cycle':
            return 4;
    }
}
function evaluateSwitchableCandidates(state, cycleLibrary, options) {
    const stats = createCertifiedSwitchSelectionStats();
    const currentCycle = getCertifiedLockedCycle(state);
    const currentFeatures = computeCycleFeatures(state, currentCycle, currentCycle);
    const currentPathLen = currentFeatures.pathLen;
    const currentScore = scoreCycleFeatures(currentFeatures, options.scoreWeights);
    const proofPassingEntries = [];
    const proofPassingCandidateDiagnostics = [];
    for (const entry of cycleLibrary.entries) {
        if (isSameAsLockedCycle(state, entry)) {
            continue;
        }
        stats.candidateCyclesChecked += 1;
        if (!validateHamiltonianCycle(state.map.graph, entry.cycle)) {
            stats.candidatesRejectedByGraphValidity += 1;
            continue;
        }
        stats.candidatesPassingGraphValidity += 1;
        if (!validLockedCertificate(state.snake.segments, entry.cycle)) {
            stats.candidatesRejectedByLockedCertificate += 1;
            continue;
        }
        stats.candidatesPassingLockedCertificate += 1;
        if (state.appleNodeId !== null && !appleForward(state.snake.segments, state.appleNodeId, entry.cycle)) {
            stats.candidatesRejectedByAppleForward += 1;
            continue;
        }
        stats.candidatesPassingAppleForward += 1;
        stats.candidatesPassingProofGate += 1;
        proofPassingEntries.push(entry);
        const features = computeCycleFeatures(state, currentCycle, entry.cycle);
        const score = scoreCycleFeatures(features, options.scoreWeights);
        const pathLenDelta = currentPathLen !== null && features.pathLen !== null
            ? currentPathLen - features.pathLen
            : null;
        const scoreDelta = currentScore - score;
        proofPassingCandidateDiagnostics.push({
            entry,
            features,
            score,
            pathLenDelta,
            scoreDelta
        });
    }
    stats.hadAnyProofPassingCandidate = proofPassingEntries.length > 0;
    const librarySelected = rankCandidateEntries(state, currentCycle, proofPassingEntries, options);
    const librarySelectedDiagnostic = librarySelected
        ? proofPassingCandidateDiagnostics.find((candidate) => candidate.entry.id === librarySelected.id) ?? null
        : null;
    const selectedLibraryCandidate = librarySelected
        ? {
            source: 'library',
            cycle: librarySelected.cycle,
            cycleId: librarySelected.id,
            pathLen: librarySelectedDiagnostic?.features.pathLen ?? null,
            pathLenImprovement: librarySelectedDiagnostic?.pathLenDelta ?? null,
            score: librarySelectedDiagnostic?.score ?? Number.NEGATIVE_INFINITY,
            transitionPlan: null
        }
        : null;
    const patchSelection = options.enablePatchMutation && state.certifiedMode !== 'transition'
        ? selectBestPatchMutationCandidate(state, currentCycle, options)
        : null;
    if (patchSelection) {
        stats.patchMutationAttempted = patchSelection.stats.patchMutationAttempted;
        stats.patchRectsScanned = patchSelection.stats.patchRectsScanned;
        stats.patchGraphValidCandidates = patchSelection.stats.patchGraphValidCandidates;
        stats.patchSnakeUsableCandidates = patchSelection.stats.patchSnakeUsableCandidates;
        stats.patchImmediateLockedCandidates = patchSelection.stats.patchImmediateLockedCandidates;
        stats.patchNonImmediateCandidates = patchSelection.stats.patchNonImmediateCandidates;
        stats.patchTransitionCandidatesAfterPrefilter = patchSelection.stats.patchTransitionCandidatesAfterPrefilter;
        stats.patchTransitionCandidatesSkippedByPrefilter = patchSelection.stats.patchTransitionCandidatesSkippedByPrefilter;
        stats.patchTransitionSearchesStarted = patchSelection.stats.patchTransitionSearchesStarted;
        stats.patchTransitionSearchesSucceeded = patchSelection.stats.patchTransitionSearchesSucceeded;
        stats.patchTransitionReachableCandidates = patchSelection.stats.patchTransitionReachableCandidates;
        stats.patchRejectedByLockedCertificate = patchSelection.stats.patchRejectedByLockedCertificate;
        stats.patchImprovingCandidates = patchSelection.stats.patchImprovingCandidates;
        stats.patchRejectedNoImprovement = patchSelection.stats.patchRejectedNoImprovement;
        stats.patchRejectedBudget = patchSelection.stats.patchRejectedBudget;
        stats.patchImmediateLockedSelectedWithoutTransition = patchSelection.stats.patchImmediateLockedSelectedWithoutTransition;
        stats.bestPatchImprovement = patchSelection.stats.bestPatchImprovement;
        stats.patchGenerationMs = patchSelection.stats.patchGenerationMs;
        stats.v1CandidateCacheHits = patchSelection.stats.v1CandidateCacheHits;
        stats.v1CandidateCacheMisses = patchSelection.stats.v1CandidateCacheMisses;
        stats.cachedV1GraphCandidates = patchSelection.stats.cachedV1GraphCandidates;
        stats.v1GenerationMs = patchSelection.stats.v1GenerationMs;
        stats.v1CertificationMs = patchSelection.stats.v1CertificationMs;
        stats.v1TransitionSearchMs = patchSelection.stats.v1TransitionSearchMs;
        stats.v1ScoringMs = patchSelection.stats.v1ScoringMs;
        stats.rectangleSearchMode = patchSelection.stats.rectangleSearchMode;
        stats.targetedRectanglesGenerated = Math.max(stats.targetedRectanglesGenerated, patchSelection.stats.targetedRectanglesGenerated);
        stats.targetedRectanglesUsed = Math.max(stats.targetedRectanglesUsed, patchSelection.stats.targetedRectanglesUsed);
        stats.broadFallbackUsed += patchSelection.stats.broadFallbackUsed;
        stats.arcChunkRectangles = Math.max(stats.arcChunkRectangles, patchSelection.stats.arcChunkRectangles);
        stats.headAppleRectangles = Math.max(stats.headAppleRectangles, patchSelection.stats.headAppleRectangles);
    }
    const v2PatchSelection = selectBestV2PatchMutationCandidate(state, currentCycle, options);
    if (v2PatchSelection) {
        stats.v2PatchAttempted = v2PatchSelection.stats.v2PatchAttempted;
        stats.v2RectsScanned = v2PatchSelection.stats.v2RectsScanned;
        stats.v2RawCandidatesGenerated = v2PatchSelection.stats.v2RawCandidatesGenerated;
        stats.v2GraphValidCandidates = v2PatchSelection.stats.v2GraphValidCandidates;
        stats.v2SnakeUsableCandidates = v2PatchSelection.stats.v2SnakeUsableCandidates;
        stats.v2ImmediateLockedCandidates = v2PatchSelection.stats.v2ImmediateLockedCandidates;
        stats.v2NonImmediateCandidates = v2PatchSelection.stats.v2NonImmediateCandidates;
        stats.v2TransitionCandidatesAfterPrefilter = v2PatchSelection.stats.v2TransitionCandidatesAfterPrefilter;
        stats.v2TransitionCandidatesSkippedByPrefilter = v2PatchSelection.stats.v2TransitionCandidatesSkippedByPrefilter;
        stats.v2TransitionSearchesStarted = v2PatchSelection.stats.v2TransitionSearchesStarted;
        stats.v2TransitionSearchesSucceeded = v2PatchSelection.stats.v2TransitionSearchesSucceeded;
        stats.v2TransitionReachableCandidates = v2PatchSelection.stats.v2TransitionReachableCandidates;
        stats.v2RejectedByLockedCertificate = v2PatchSelection.stats.v2RejectedByLockedCertificate;
        stats.v2ImprovingCandidates = v2PatchSelection.stats.v2ImprovingCandidates;
        stats.v2RejectedNoImprovement = v2PatchSelection.stats.v2RejectedNoImprovement;
        stats.v2RejectedBudget = v2PatchSelection.stats.v2RejectedBudget;
        stats.v2ImmediateLockedSelectedWithoutTransition = v2PatchSelection.stats.v2ImmediateLockedSelectedWithoutTransition;
        stats.bestV2Improvement = v2PatchSelection.stats.bestV2Improvement;
        stats.v2DetectionMs = v2PatchSelection.stats.v2DetectionMs;
        stats.v2PathCoverSolvingMs = v2PatchSelection.stats.v2PathCoverSolvingMs;
        stats.v2SplicingValidationMs = v2PatchSelection.stats.v2SplicingValidationMs;
        stats.v2CandidateCacheHits = v2PatchSelection.stats.v2CandidateCacheHits;
        stats.v2CandidateCacheMisses = v2PatchSelection.stats.v2CandidateCacheMisses;
        stats.cachedV2GraphCandidates = v2PatchSelection.stats.cachedV2GraphCandidates;
        stats.v2GenerationMs = v2PatchSelection.stats.v2GenerationMs;
        stats.v2CertificationMs = v2PatchSelection.stats.v2CertificationMs;
        stats.v2TransitionSearchMs = v2PatchSelection.stats.v2TransitionSearchMs;
        stats.v2ScoringMs = v2PatchSelection.stats.v2ScoringMs;
        stats.rectangleSearchMode = v2PatchSelection.stats.rectangleSearchMode;
        stats.targetedRectanglesGenerated = Math.max(stats.targetedRectanglesGenerated, v2PatchSelection.stats.targetedRectanglesGenerated);
        stats.targetedRectanglesUsed = Math.max(stats.targetedRectanglesUsed, v2PatchSelection.stats.targetedRectanglesUsed);
        stats.broadFallbackUsed += v2PatchSelection.stats.broadFallbackUsed;
        stats.arcChunkRectangles = Math.max(stats.arcChunkRectangles, v2PatchSelection.stats.arcChunkRectangles);
        stats.headAppleRectangles = Math.max(stats.headAppleRectangles, v2PatchSelection.stats.headAppleRectangles);
    }
    const patchRectanglesEvaluated = stats.patchRectsScanned + stats.v2RectsScanned;
    stats.candidateYieldPerRectangle = yieldPerRectangle(stats.patchGraphValidCandidates + stats.v2GraphValidCandidates, patchRectanglesEvaluated);
    stats.improvingYieldPerRectangle = yieldPerRectangle(stats.patchImprovingCandidates + stats.v2ImprovingCandidates, patchRectanglesEvaluated);
    const selected = betterSelectedCandidate(betterSelectedCandidate(selectedLibraryCandidate, patchSelection?.selected ?? null), v2PatchSelection?.selected ?? null);
    if (selected) {
        stats.oldPathLenBeforeSwitch = currentPathLen;
        stats.newPathLenAfterSwitch = selected.pathLen;
        stats.selectedCandidateSource = selected.source;
    }
    const bestByPathLenData = proofPassingCandidateDiagnostics
        .filter((candidate) => candidate.features.pathLen !== null)
        .sort((left, right) => {
        const pathDifference = (left.features.pathLen ?? Number.POSITIVE_INFINITY) - (right.features.pathLen ?? Number.POSITIVE_INFINITY);
        if (pathDifference !== 0) {
            return pathDifference;
        }
        return left.score - right.score;
    })[0] ?? null;
    const bestByScoreData = [...proofPassingCandidateDiagnostics]
        .sort((left, right) => {
        if (left.score !== right.score) {
            return left.score - right.score;
        }
        const leftPathLen = left.features.pathLen ?? Number.POSITIVE_INFINITY;
        const rightPathLen = right.features.pathLen ?? Number.POSITIVE_INFINITY;
        return leftPathLen - rightPathLen;
    })[0] ?? null;
    stats.bestProofValidPathLenDelta = bestByPathLenData?.pathLenDelta ?? null;
    stats.bestProofValidScoreDelta = bestByScoreData?.scoreDelta ?? null;
    stats.bestProofValidCandidatePathLen = bestByPathLenData?.features.pathLen ?? null;
    let finalDecisionReason = selected ? 'selected-switch' : 'no-proof-valid-candidates';
    if (!selected && (proofPassingCandidateDiagnostics.length > 0 || stats.patchSnakeUsableCandidates > 0 || stats.v2SnakeUsableCandidates > 0)) {
        const improvingCandidates = proofPassingCandidateDiagnostics.filter((candidate) => candidate.pathLenDelta !== null && candidate.pathLenDelta >= options.minimumPathImprovement);
        if (improvingCandidates.length === 0 && stats.patchImprovingCandidates === 0 && stats.v2ImprovingCandidates === 0) {
            finalDecisionReason = 'no-pathLen-improvement';
        }
        else {
            finalDecisionReason = 'kept-current-by-tie-break';
        }
    }
    stats.switchAttemptSummary = {
        currentLockedCycleId: state.lockedHamiltonianCycleId,
        currentCyclePathLen: currentPathLen,
        currentCycleScore: currentScore,
        candidatesChecked: stats.candidateCyclesChecked,
        candidatesPassingGraphValidity: stats.candidatesPassingGraphValidity,
        candidatesPassingLockedCertificate: stats.candidatesPassingLockedCertificate,
        candidatesPassingAppleForward: stats.candidatesPassingAppleForward,
        proofValidCandidates: proofPassingCandidateDiagnostics.map((candidate) => {
            const rejectedBecauseNotImprovingPathLen = candidate.pathLenDelta === null || candidate.pathLenDelta < options.minimumPathImprovement;
            const rejectedBecauseScoreComparatorWorse = !rejectedBecauseNotImprovingPathLen &&
                selected !== null &&
                selected.cycleId !== candidate.entry.id;
            return {
                candidateId: candidate.entry.id,
                candidatePathLen: candidate.features.pathLen,
                candidateScore: candidate.score,
                pathLenDelta: candidate.pathLenDelta,
                scoreDelta: candidate.scoreDelta,
                rejectedBecauseNotImprovingPathLen,
                rejectedBecauseScoreComparatorWorse
            };
        }),
        bestProofValidCandidateByPathLen: bestByPathLenData
            ? {
                candidateId: bestByPathLenData.entry.id,
                pathLen: bestByPathLenData.features.pathLen,
                score: bestByPathLenData.score,
                pathLenDelta: bestByPathLenData.pathLenDelta,
                scoreDelta: bestByPathLenData.scoreDelta
            }
            : null,
        bestProofValidCandidateByScore: bestByScoreData
            ? {
                candidateId: bestByScoreData.entry.id,
                pathLen: bestByScoreData.features.pathLen,
                score: bestByScoreData.score,
                pathLenDelta: bestByScoreData.pathLenDelta,
                scoreDelta: bestByScoreData.scoreDelta
            }
            : null,
        finalDecisionReason,
        selectedCycleId: selected?.cycleId ?? null,
        selectedPathLen: selected?.pathLen ?? null,
        selectedCandidateSource: selected?.source ?? 'current-cycle',
        patchMutationAttempted: stats.patchMutationAttempted,
        patchRectsScanned: stats.patchRectsScanned,
        patchGraphValidCandidates: stats.patchGraphValidCandidates,
        patchSnakeUsableCandidates: stats.patchSnakeUsableCandidates,
        patchImmediateLockedCandidates: stats.patchImmediateLockedCandidates,
        patchNonImmediateCandidates: stats.patchNonImmediateCandidates,
        patchTransitionCandidatesAfterPrefilter: stats.patchTransitionCandidatesAfterPrefilter,
        patchTransitionCandidatesSkippedByPrefilter: stats.patchTransitionCandidatesSkippedByPrefilter,
        patchTransitionSearchesStarted: stats.patchTransitionSearchesStarted,
        patchTransitionSearchesSucceeded: stats.patchTransitionSearchesSucceeded,
        patchTransitionReachableCandidates: stats.patchTransitionReachableCandidates,
        patchRejectedByLockedCertificate: stats.patchRejectedByLockedCertificate,
        patchImprovingCandidates: stats.patchImprovingCandidates,
        bestPatchImprovement: stats.bestPatchImprovement,
        patchImmediateLockedSelectedWithoutTransition: stats.patchImmediateLockedSelectedWithoutTransition ? 1 : 0,
        patchGenerationMs: stats.patchGenerationMs,
        v1CandidateCacheHits: stats.v1CandidateCacheHits,
        v1CandidateCacheMisses: stats.v1CandidateCacheMisses,
        cachedV1GraphCandidates: stats.cachedV1GraphCandidates,
        v1GenerationMs: stats.v1GenerationMs,
        v1CertificationMs: stats.v1CertificationMs,
        v1TransitionSearchMs: stats.v1TransitionSearchMs,
        v1ScoringMs: stats.v1ScoringMs,
        v2PatchAttempted: stats.v2PatchAttempted,
        v2RectsScanned: stats.v2RectsScanned,
        v2RawCandidatesGenerated: stats.v2RawCandidatesGenerated,
        v2GraphValidCandidates: stats.v2GraphValidCandidates,
        v2SnakeUsableCandidates: stats.v2SnakeUsableCandidates,
        v2ImmediateLockedCandidates: stats.v2ImmediateLockedCandidates,
        v2NonImmediateCandidates: stats.v2NonImmediateCandidates,
        v2TransitionCandidatesAfterPrefilter: stats.v2TransitionCandidatesAfterPrefilter,
        v2TransitionCandidatesSkippedByPrefilter: stats.v2TransitionCandidatesSkippedByPrefilter,
        v2TransitionSearchesStarted: stats.v2TransitionSearchesStarted,
        v2TransitionSearchesSucceeded: stats.v2TransitionSearchesSucceeded,
        v2TransitionReachableCandidates: stats.v2TransitionReachableCandidates,
        v2RejectedByLockedCertificate: stats.v2RejectedByLockedCertificate,
        v2ImprovingCandidates: stats.v2ImprovingCandidates,
        bestV2Improvement: stats.bestV2Improvement,
        v2ImmediateLockedSelectedWithoutTransition: stats.v2ImmediateLockedSelectedWithoutTransition ? 1 : 0,
        v2DetectionMs: stats.v2DetectionMs,
        v2PathCoverSolvingMs: stats.v2PathCoverSolvingMs,
        v2SplicingValidationMs: stats.v2SplicingValidationMs,
        v2CandidateCacheHits: stats.v2CandidateCacheHits,
        v2CandidateCacheMisses: stats.v2CandidateCacheMisses,
        cachedV2GraphCandidates: stats.cachedV2GraphCandidates,
        v2GenerationMs: stats.v2GenerationMs,
        v2CertificationMs: stats.v2CertificationMs,
        v2TransitionSearchMs: stats.v2TransitionSearchMs,
        v2ScoringMs: stats.v2ScoringMs,
        rectangleSearchMode: stats.rectangleSearchMode,
        targetedRectanglesGenerated: stats.targetedRectanglesGenerated,
        targetedRectanglesUsed: stats.targetedRectanglesUsed,
        broadFallbackUsed: stats.broadFallbackUsed,
        arcChunkRectangles: stats.arcChunkRectangles,
        headAppleRectangles: stats.headAppleRectangles,
        candidateYieldPerRectangle: stats.candidateYieldPerRectangle,
        improvingYieldPerRectangle: stats.improvingYieldPerRectangle,
        selectedCandidateUsedTransitionPlan: selected?.transitionPlan !== null && selected?.transitionPlan !== undefined
    };
    return {
        selected,
        stats
    };
}
function mergeRuntimeSwitchingDiagnostics(diagnostics, stats) {
    diagnostics.candidateCyclesChecked += stats.candidateCyclesChecked;
    diagnostics.candidatesPassingProofGate += stats.candidatesPassingProofGate;
    diagnostics.candidatesRejectedByGraphValidity += stats.candidatesRejectedByGraphValidity;
    diagnostics.candidatesRejectedByLockedCertificate += stats.candidatesRejectedByLockedCertificate;
    diagnostics.candidatesRejectedByAppleForward += stats.candidatesRejectedByAppleForward;
    if (stats.patchMutationAttempted) {
        diagnostics.patchMutationAttempted += 1;
    }
    diagnostics.patchRectsScanned += stats.patchRectsScanned;
    diagnostics.patchGraphValidCandidates += stats.patchGraphValidCandidates;
    diagnostics.patchSnakeUsableCandidates += stats.patchSnakeUsableCandidates;
    diagnostics.patchImmediateLockedCandidates += stats.patchImmediateLockedCandidates;
    diagnostics.patchNonImmediateCandidates += stats.patchNonImmediateCandidates;
    diagnostics.patchTransitionCandidatesAfterPrefilter += stats.patchTransitionCandidatesAfterPrefilter;
    diagnostics.patchTransitionCandidatesSkippedByPrefilter += stats.patchTransitionCandidatesSkippedByPrefilter;
    diagnostics.patchTransitionSearchesStarted += stats.patchTransitionSearchesStarted;
    diagnostics.patchTransitionSearchesSucceeded += stats.patchTransitionSearchesSucceeded;
    diagnostics.patchTransitionReachableCandidates += stats.patchTransitionReachableCandidates;
    diagnostics.patchRejectedByLockedCertificate += stats.patchRejectedByLockedCertificate;
    diagnostics.patchImprovingCandidates += stats.patchImprovingCandidates;
    diagnostics.patchRejectedNoImprovement += stats.patchRejectedNoImprovement;
    diagnostics.patchRejectedBudget += stats.patchRejectedBudget ? 1 : 0;
    diagnostics.patchImmediateLockedSelectedWithoutTransition +=
        stats.patchImmediateLockedSelectedWithoutTransition ? 1 : 0;
    diagnostics.patchGenerationMs += stats.patchGenerationMs;
    diagnostics.v1CandidateCacheHits += stats.v1CandidateCacheHits;
    diagnostics.v1CandidateCacheMisses += stats.v1CandidateCacheMisses;
    diagnostics.cachedV1GraphCandidates += stats.cachedV1GraphCandidates;
    diagnostics.v1GenerationMs += stats.v1GenerationMs;
    diagnostics.v1CertificationMs += stats.v1CertificationMs;
    diagnostics.v1TransitionSearchMs += stats.v1TransitionSearchMs;
    diagnostics.v1ScoringMs += stats.v1ScoringMs;
    if (stats.bestPatchImprovement !== null) {
        diagnostics.bestPatchImprovement =
            diagnostics.bestPatchImprovement === null
                ? stats.bestPatchImprovement
                : Math.max(diagnostics.bestPatchImprovement, stats.bestPatchImprovement);
    }
    if (stats.v2PatchAttempted) {
        diagnostics.v2PatchAttempted += 1;
    }
    diagnostics.v2RectsScanned += stats.v2RectsScanned;
    diagnostics.v2RawCandidatesGenerated += stats.v2RawCandidatesGenerated;
    diagnostics.v2GraphValidCandidates += stats.v2GraphValidCandidates;
    diagnostics.v2SnakeUsableCandidates += stats.v2SnakeUsableCandidates;
    diagnostics.v2ImmediateLockedCandidates += stats.v2ImmediateLockedCandidates;
    diagnostics.v2NonImmediateCandidates += stats.v2NonImmediateCandidates;
    diagnostics.v2TransitionCandidatesAfterPrefilter += stats.v2TransitionCandidatesAfterPrefilter;
    diagnostics.v2TransitionCandidatesSkippedByPrefilter += stats.v2TransitionCandidatesSkippedByPrefilter;
    diagnostics.v2TransitionSearchesStarted += stats.v2TransitionSearchesStarted;
    diagnostics.v2TransitionSearchesSucceeded += stats.v2TransitionSearchesSucceeded;
    diagnostics.v2TransitionReachableCandidates += stats.v2TransitionReachableCandidates;
    diagnostics.v2RejectedByLockedCertificate += stats.v2RejectedByLockedCertificate;
    diagnostics.v2ImprovingCandidates += stats.v2ImprovingCandidates;
    diagnostics.v2RejectedNoImprovement += stats.v2RejectedNoImprovement;
    diagnostics.v2RejectedBudget += stats.v2RejectedBudget ? 1 : 0;
    diagnostics.v2ImmediateLockedSelectedWithoutTransition +=
        stats.v2ImmediateLockedSelectedWithoutTransition ? 1 : 0;
    diagnostics.v2DetectionMs += stats.v2DetectionMs;
    diagnostics.v2PathCoverSolvingMs += stats.v2PathCoverSolvingMs;
    diagnostics.v2SplicingValidationMs += stats.v2SplicingValidationMs;
    diagnostics.v2CandidateCacheHits += stats.v2CandidateCacheHits;
    diagnostics.v2CandidateCacheMisses += stats.v2CandidateCacheMisses;
    diagnostics.cachedV2GraphCandidates += stats.cachedV2GraphCandidates;
    diagnostics.v2GenerationMs += stats.v2GenerationMs;
    diagnostics.v2CertificationMs += stats.v2CertificationMs;
    diagnostics.v2TransitionSearchMs += stats.v2TransitionSearchMs;
    diagnostics.v2ScoringMs += stats.v2ScoringMs;
    diagnostics.rectangleSearchMode = stats.rectangleSearchMode;
    diagnostics.targetedRectanglesGenerated += stats.targetedRectanglesGenerated;
    diagnostics.targetedRectanglesUsed += stats.targetedRectanglesUsed;
    diagnostics.broadFallbackUsed += stats.broadFallbackUsed;
    diagnostics.arcChunkRectangles += stats.arcChunkRectangles;
    diagnostics.headAppleRectangles += stats.headAppleRectangles;
    diagnostics.candidateYieldPerRectangle = yieldPerRectangle(diagnostics.patchGraphValidCandidates + diagnostics.v2GraphValidCandidates, diagnostics.patchRectsScanned + diagnostics.v2RectsScanned);
    diagnostics.improvingYieldPerRectangle = yieldPerRectangle(diagnostics.patchImprovingCandidates + diagnostics.v2ImprovingCandidates, diagnostics.patchRectsScanned + diagnostics.v2RectsScanned);
    if (stats.bestV2Improvement !== null) {
        diagnostics.bestV2Improvement =
            diagnostics.bestV2Improvement === null
                ? stats.bestV2Improvement
                : Math.max(diagnostics.bestV2Improvement, stats.bestV2Improvement);
    }
    diagnostics.selectedCandidateSource = stats.selectedCandidateSource;
    if (stats.switchAttemptSummary) {
        diagnostics.switchAttemptSummaries.push(stats.switchAttemptSummary);
    }
    const proofValidCandidates = stats.switchAttemptSummary?.proofValidCandidates ?? [];
    diagnostics.proofValidButNotImproving += proofValidCandidates.filter((candidate) => candidate.rejectedBecauseNotImprovingPathLen).length;
    diagnostics.proofValidAndPathLenImproving += proofValidCandidates.filter((candidate) => !candidate.rejectedBecauseNotImprovingPathLen).length;
    diagnostics.proofValidAndScoreImproving += proofValidCandidates.filter((candidate) => (candidate.scoreDelta ?? 0) > 0).length;
    if (stats.bestProofValidPathLenDelta !== null) {
        diagnostics.bestObservedPathLenImprovement =
            diagnostics.bestObservedPathLenImprovement === null
                ? stats.bestProofValidPathLenDelta
                : Math.max(diagnostics.bestObservedPathLenImprovement, stats.bestProofValidPathLenDelta);
    }
    if (stats.bestProofValidScoreDelta !== null) {
        diagnostics.bestObservedScoreImprovement =
            diagnostics.bestObservedScoreImprovement === null
                ? stats.bestProofValidScoreDelta
                : Math.max(diagnostics.bestObservedScoreImprovement, stats.bestProofValidScoreDelta);
    }
    if (stats.oldPathLenBeforeSwitch !== null && stats.newPathLenAfterSwitch !== null) {
        diagnostics.oldPathLenBeforeSwitch.push(stats.oldPathLenBeforeSwitch);
        diagnostics.newPathLenAfterSwitch.push(stats.newPathLenAfterSwitch);
        const totalImprovement = diagnostics.oldPathLenBeforeSwitch.reduce((sum, oldPathLen, index) => {
            return sum + (oldPathLen - (diagnostics.newPathLenAfterSwitch[index] ?? oldPathLen));
        }, 0);
        diagnostics.averagePathLenImprovement =
            diagnostics.oldPathLenBeforeSwitch.length > 0
                ? totalImprovement / diagnostics.oldPathLenBeforeSwitch.length
                : null;
    }
    const currentPathLens = diagnostics.switchAttemptSummaries
        .map((summary) => summary.currentCyclePathLen)
        .filter((value) => value !== null);
    diagnostics.averageCurrentPathLen =
        currentPathLens.length > 0
            ? currentPathLens.reduce((sum, value) => sum + value, 0) / currentPathLens.length
            : null;
    const bestCandidatePathLens = diagnostics.switchAttemptSummaries
        .map((summary) => summary.bestProofValidCandidateByPathLen?.pathLen ?? null)
        .filter((value) => value !== null);
    diagnostics.averageBestCandidatePathLen =
        bestCandidatePathLens.length > 0
            ? bestCandidatePathLens.reduce((sum, value) => sum + value, 0) / bestCandidatePathLens.length
            : null;
    const bestCandidatePathDeltas = diagnostics.switchAttemptSummaries
        .map((summary) => summary.bestProofValidCandidateByPathLen?.pathLenDelta ?? null)
        .filter((value) => value !== null);
    diagnostics.averageBestCandidatePathLenDelta =
        bestCandidatePathDeltas.length > 0
            ? bestCandidatePathDeltas.reduce((sum, value) => sum + value, 0) / bestCandidatePathDeltas.length
            : null;
}
export function selectBestSwitchableCycle(state, cycleLibrary, options = {}) {
    if (cycleLibrary.status !== 'ready' || state.appleNodeId === null) {
        return null;
    }
    const resolved = {
        ...DEFAULT_CERTIFIED_CYCLE_SELECTION_OPTIONS,
        ...options,
        scoreWeights: options.scoreWeights ?? defaultCycleScoreWeights
    };
    const selected = evaluateSwitchableCandidates(state, cycleLibrary, resolved).selected;
    if (!selected || selected.source !== 'library') {
        return null;
    }
    return cycleLibrary.entries.find((entry) => entry.id === selected.cycleId) ?? null;
}
export function debugCertifiedSwitchSelection(state, cycleLibrary, options = {}) {
    if (cycleLibrary.status !== 'ready' || state.appleNodeId === null) {
        return null;
    }
    const resolved = {
        ...DEFAULT_CERTIFIED_CYCLE_SELECTION_OPTIONS,
        ...options,
        scoreWeights: options.scoreWeights ?? defaultCycleScoreWeights
    };
    const currentCycle = getCertifiedLockedCycle(state);
    const currentFeatures = computeCycleFeatures(state, currentCycle, currentCycle);
    const currentPathLen = currentFeatures.pathLen;
    const currentScore = scoreCycleFeatures(currentFeatures, resolved.scoreWeights);
    const selected = evaluateSwitchableCandidates(state, cycleLibrary, resolved).selected;
    const candidates = cycleLibrary.entries.map((entry) => {
        if (isSameAsLockedCycle(state, entry)) {
            return {
                candidateId: entry.id,
                source: entry.source,
                archetypeName: entry.archetypeName,
                pathLen: null,
                score: null,
                graphValid: true,
                lockedCertificateValid: true,
                lockedCertificateFailure: null,
                appleForwardValid: null,
                pathLenDelta: null,
                scoreDelta: null,
                finalDecision: 'skipped-current-cycle'
            };
        }
        const graphValid = validateHamiltonianCycle(state.map.graph, entry.cycle);
        const lockedCertificateFailure = graphValid ? explainLockedCertificateFailure(state.snake.segments, entry.cycle) : null;
        const lockedCertificateValid = graphValid && lockedCertificateFailure === null;
        const appleForwardValid = graphValid && lockedCertificateValid && state.appleNodeId !== null
            ? appleForward(state.snake.segments, state.appleNodeId, entry.cycle)
            : (state.appleNodeId === null ? null : false);
        let pathLen = null;
        let score = null;
        let pathLenDelta = null;
        let scoreDelta = null;
        if (graphValid) {
            const features = computeCycleFeatures(state, currentCycle, entry.cycle);
            pathLen = features.pathLen;
            score = scoreCycleFeatures(features, resolved.scoreWeights);
            pathLenDelta =
                currentPathLen !== null && pathLen !== null
                    ? currentPathLen - pathLen
                    : null;
            scoreDelta = score !== null ? currentScore - score : null;
        }
        let finalDecision;
        if (!graphValid) {
            finalDecision = 'rejected graph-invalid';
        }
        else if (!lockedCertificateValid) {
            finalDecision = 'rejected locked-certificate';
        }
        else if (state.appleNodeId !== null && !appleForwardValid) {
            finalDecision = 'rejected appleForward';
        }
        else if (pathLenDelta === null || pathLenDelta < resolved.minimumPathImprovement) {
            finalDecision = 'rejected no pathLen improvement';
        }
        else if (selected && selected.cycleId === entry.id) {
            finalDecision = 'selected';
        }
        else {
            finalDecision = 'rejected score worse';
        }
        return {
            candidateId: entry.id,
            source: entry.source,
            archetypeName: entry.archetypeName,
            pathLen,
            score,
            graphValid,
            lockedCertificateValid,
            lockedCertificateFailure,
            appleForwardValid,
            pathLenDelta,
            scoreDelta,
            finalDecision
        };
    });
    const summary = evaluateSwitchableCandidates(state, cycleLibrary, resolved).stats.switchAttemptSummary;
    return {
        currentLockedCycleId: state.lockedHamiltonianCycleId,
        currentCyclePathLen: currentPathLen,
        currentCycleScore: currentScore,
        finalDecisionReason: summary?.finalDecisionReason ?? 'no-proof-valid-candidates',
        selectedCycleId: selected?.cycleId ?? null,
        selectedPathLen: summary?.selectedPathLen ?? null,
        candidates
    };
}
function stateWithLockedCycle(state, cycle, cycleId) {
    return {
        ...state,
        lockedHamiltonianCycle: [...cycle],
        lockedHamiltonianCycleId: cycleId,
        certifiedMode: state.aiStrategy === 'certified-hamiltonian' ? 'locked' : state.certifiedMode,
        activeCertifiedTransitionPlan: null
    };
}
function stateWithTransitionPlan(state, plan) {
    return {
        ...state,
        certifiedMode: 'transition',
        activeCertifiedTransitionPlan: {
            ...plan,
            targetCycle: [...plan.targetCycle],
            directions: [...plan.directions],
            expectedHeadPath: [...plan.expectedHeadPath]
        }
    };
}
function ensureValidTransitionPlanTargetOrThrow(state, plan) {
    if (!validateHamiltonianCycle(state.map.graph, plan.targetCycle)) {
        certifiedInvariantError(`Certified Hamiltonian AI invariant failed: transition target cycle ${plan.targetCycleId} is not graph-valid.`);
    }
}
function progressCertifiedTransitionPlan(previousState, nextState, plan) {
    ensureValidTransitionPlanTargetOrThrow(nextState, plan);
    if (previousState.appleNodeId !== plan.certifiedAppleNodeId) {
        certifiedInvariantError('Certified Hamiltonian AI invariant failed: transition apple changed before the certified plan completed.');
    }
    if (previousState.applesEaten !== plan.certifiedAtApplesEaten) {
        certifiedInvariantError('Certified Hamiltonian AI invariant failed: transition apple count changed before the certified plan completed.');
    }
    if (nextState.applesEaten > previousState.applesEaten) {
        if (!validLockedCertificate(nextState.snake.segments, plan.targetCycle)) {
            certifiedInvariantError(`Certified Hamiltonian AI invariant failed: transition target cycle ${plan.targetCycleId} does not certify the real post-apple body.`);
        }
        return setCertifiedLockedCycleOrThrow(nextState, plan.targetCycle, plan.targetCycleId);
    }
    if (nextState.isOver) {
        certifiedInvariantError('Certified Hamiltonian AI invariant failed: transition plan collided before eating the certified apple.');
    }
    const nextDirectionIndex = plan.nextDirectionIndex + 1;
    if (nextDirectionIndex >= plan.directions.length) {
        certifiedInvariantError('Certified Hamiltonian AI invariant failed: transition plan ended before eating the certified apple.');
    }
    const expectedHead = plan.expectedHeadPath[nextDirectionIndex];
    if (!expectedHead || nextState.snake.segments[0] !== expectedHead) {
        certifiedInvariantError('Certified Hamiltonian AI invariant failed: transition state no longer matches the certified path prefix.');
    }
    return stateWithTransitionPlan(nextState, {
        ...plan,
        nextDirectionIndex
    });
}
export function setCertifiedLockedCycleOrThrow(state, cycle, cycleId) {
    if (!validateHamiltonianCycle(state.map.graph, cycle)) {
        certifiedInvariantError(`Certified Hamiltonian AI invariant failed: locked cycle ${cycleId ?? 'unknown'} does not form a valid Hamiltonian cycle for the current map graph.`);
    }
    if (!validLockedCertificate(state.snake.segments, cycle)) {
        certifiedInvariantError(`Certified Hamiltonian AI invariant failed: locked cycle ${cycleId ?? 'unknown'} does not satisfy the locked Hamiltonian certificate for the current body.`);
    }
    return stateWithLockedCycle(state, cycle, cycleId);
}
function emptyReadyCycleLibrary(mapId) {
    return {
        mapId,
        status: 'ready',
        entries: [],
        diagnostics: {
            generationAttempts: 0,
            generatedCycles: 0,
            diversityDistances: [],
            minDiversityDistance: null,
            maxDiversityDistance: null,
            averageDiversityDistance: null,
            orderDiversityDistances: [],
            minOrderDiversityDistance: null,
            maxOrderDiversityDistance: null,
            averageOrderDiversityDistance: null,
            duplicateRejections: 0,
            lowDiversityRejections: 0,
            graphInvalidCandidates: 0,
            entryAttempts: []
        }
    };
}
export function applyCertifiedPostAppleTransition({ previousState, nextState, cycleLibrary, options = {}, diagnostics = null }) {
    if (previousState.aiStrategy !== 'certified-hamiltonian') {
        return nextState;
    }
    const resolved = {
        ...DEFAULT_CERTIFIED_CYCLE_SELECTION_OPTIONS,
        ...options,
        scoreWeights: options.scoreWeights ?? defaultCycleScoreWeights
    };
    const oldCycle = getCertifiedLockedCycle(previousState);
    const oldCycleId = previousState.lockedHamiltonianCycleId;
    const certifiedPhase = selectCertifiedPhase(nextState);
    const baseState = {
        ...nextState,
        certifiedPhase
    };
    const activeTransitionPlan = previousState.activeCertifiedTransitionPlan;
    if (activeTransitionPlan && previousState.certifiedMode === 'transition') {
        const progressed = progressCertifiedTransitionPlan(previousState, baseState, activeTransitionPlan);
        if (diagnostics && previousState.applesEaten < nextState.applesEaten) {
            diagnostics.applesEaten += nextState.applesEaten - previousState.applesEaten;
            diagnostics.successfulSwitches += 1;
            diagnostics.selectedCandidateSource = 'transition';
        }
        return progressed;
    }
    if (previousState.applesEaten >= nextState.applesEaten) {
        return setCertifiedLockedCycleOrThrow(baseState, oldCycle, oldCycleId);
    }
    if (diagnostics) {
        diagnostics.applesEaten += nextState.applesEaten - previousState.applesEaten;
    }
    const stateOnOldCycle = setCertifiedLockedCycleOrThrow(baseState, oldCycle, oldCycleId);
    const candidateLibrary = cycleLibrary?.status === 'ready' ? cycleLibrary : emptyReadyCycleLibrary(stateOnOldCycle.map.id);
    const hasLibraryCandidates = candidateLibrary.entries.length > 0;
    const hasPatchCandidates = resolved.enablePatchMutation || resolved.enableV2PatchMutation;
    if (certifiedPhase === 'late' || stateOnOldCycle.appleNodeId === null || (!hasLibraryCandidates && !hasPatchCandidates)) {
        if (diagnostics) {
            diagnostics.oldCycleKept += 1;
        }
        return setCertifiedLockedCycleOrThrow(stateOnOldCycle, oldCycle, oldCycleId);
    }
    if (diagnostics) {
        diagnostics.switchAttempts += 1;
    }
    const selection = evaluateSwitchableCandidates(stateOnOldCycle, candidateLibrary, resolved);
    if (diagnostics) {
        mergeRuntimeSwitchingDiagnostics(diagnostics, selection.stats);
    }
    const selectedCycle = selection.selected;
    if (!selectedCycle) {
        if (diagnostics) {
            diagnostics.oldCycleKept += 1;
            if (!selection.stats.hadAnyProofPassingCandidate &&
                selection.stats.patchSnakeUsableCandidates === 0 &&
                selection.stats.v2SnakeUsableCandidates === 0) {
                diagnostics.noValidSwitchExists += 1;
            }
        }
        return setCertifiedLockedCycleOrThrow(stateOnOldCycle, oldCycle, oldCycleId);
    }
    if (diagnostics) {
        const selectedPatchSource = selectedCycle.source === 'v1-patch' || selectedCycle.source === 'v2-patch';
        diagnostics.patchSelectedCandidates += selectedPatchSource ? 1 : 0;
        diagnostics.v2SelectedCandidates += selectedCycle.source === 'v2-patch' ? 1 : 0;
        diagnostics.v2ImmediateLockedSelections += selectedCycle.source === 'v2-patch' && !selectedCycle.transitionPlan ? 1 : 0;
        diagnostics.v2TransitionSelections += selectedCycle.source === 'v2-patch' && selectedCycle.transitionPlan ? 1 : 0;
        if (!selectedCycle.transitionPlan) {
            diagnostics.successfulSwitches += 1;
        }
    }
    if (selectedCycle.transitionPlan) {
        return stateWithTransitionPlan(setCertifiedLockedCycleOrThrow(stateOnOldCycle, oldCycle, oldCycleId), selectedCycle.transitionPlan);
    }
    return setCertifiedLockedCycleOrThrow(stateOnOldCycle, selectedCycle.cycle, selectedCycle.cycleId);
}
export function describeCertifiedLibraryStatus(state, cycleLibrary) {
    if (cycleLibrary.status === 'unsupported') {
        return 'Certified Library: unsupported on this map; single-cycle certified mode only';
    }
    if (cycleLibrary.status === 'failed') {
        return 'Certified Library: failed to build; single-cycle certified mode only';
    }
    const activeCycleId = state.lockedHamiltonianCycleId;
    const activeIndex = activeCycleId ? cycleLibrary.entries.findIndex((entry) => entry.id === activeCycleId) + 1 : 0;
    return `Certified Library: ${cycleLibrary.entries.length} cycles / active ${activeIndex || 'base'} / phase ${state.certifiedPhase ?? 'library'}`;
}
export function strictCertifiedDecision(state) {
    const cycle = getCertifiedLockedCycle(state);
    const direction = getStrictCycleDirection(state, cycle);
    if (!direction) {
        return null;
    }
    const head = state.snake.segments[0];
    if (!head) {
        return null;
    }
    const headIndex = buildCycleIndexMap(cycle).get(head);
    if (headIndex === undefined) {
        return null;
    }
    const plannedPath = [];
    for (let offset = 1; offset <= 10; offset += 1) {
        plannedPath.push(cycle[(headIndex + offset) % cycle.length]);
    }
    return {
        direction,
        plannedPath,
        strategyUsed: 'certified-hamiltonian'
    };
}
export function currentCyclePathLen(state) {
    const head = state.snake.segments[0];
    const apple = state.appleNodeId;
    if (!head || !apple) {
        return null;
    }
    return distanceForwardOnCycle(head, apple, getCertifiedLockedCycle(state));
}
