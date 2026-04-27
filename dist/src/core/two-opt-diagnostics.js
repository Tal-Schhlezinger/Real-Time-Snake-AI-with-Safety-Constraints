import { appleForward, bodyContiguous, distanceForwardOnCycle } from './hamiltonian-certificate.js';
import { compareCandidateCycles, computeCycleFeatures, defaultCycleScoreWeights, scoreCycleFeatures } from './cycle-scoring.js';
import { validateHamiltonianCycle } from './map-validator.js';
const DEFAULT_TWO_OPT_DIAGNOSTIC_OPTIONS = {
    maxPairsChecked: 64,
    searchNeighborhood: 3,
    exhaustive: false,
    scoreWeights: defaultCycleScoreWeights
};
const EMPTY_TWO_OPT_DIAGNOSTICS = {
    edgePairsConsidered: 0,
    replacementPairsConsidered: 0,
    replacementEdgesMissing: 0,
    rawCandidatesGenerated: 0,
    duplicateCandidatesSkipped: 0,
    graphInvalidCandidates: 0,
    bodyContiguousFailed: 0,
    appleForwardFailed: 0,
    validCandidates: 0,
    improvingCandidates: 0,
    bestPathLenBefore: null,
    bestPathLenAfter: null,
    bestScoreBefore: 0,
    bestScoreAfter: null,
    budgetExhausted: false,
    invalidDueToLength: 0,
    invalidDueToDuplicates: 0,
    invalidDueToMissingNodes: 0,
    invalidDueToBadReplacementSeam: 0,
    invalidDueToBadInternalReversal: 0,
    invalidDueToBadWraparound: 0,
    invalidDueToOtherBadEdge: 0
};
function buildCycleEdgeSignature(cycle) {
    const edges = [];
    for (let index = 0; index < cycle.length; index += 1) {
        edges.push(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
    }
    edges.sort();
    return edges.join('|');
}
function rotateCycleToStart(cycle, start) {
    const startIndex = cycle.indexOf(start);
    if (startIndex === -1) {
        return null;
    }
    return [...cycle.slice(startIndex), ...cycle.slice(0, startIndex)];
}
function splitCycleAtEdgePair(oldCycle, pair) {
    const firstStart = oldCycle[pair.firstIndex];
    const firstNext = oldCycle[(pair.firstIndex + 1) % oldCycle.length];
    const secondStart = oldCycle[pair.secondIndex];
    const secondNext = oldCycle[(pair.secondIndex + 1) % oldCycle.length];
    if (!firstStart || !firstNext || !secondStart || !secondNext) {
        return null;
    }
    const rotatedCycle = rotateCycleToStart(oldCycle, firstStart);
    if (!rotatedCycle || rotatedCycle[1] !== firstNext) {
        return null;
    }
    const secondIndex = pair.secondIndex - pair.firstIndex;
    if (secondIndex <= 1 || secondIndex >= rotatedCycle.length - 1) {
        return null;
    }
    if (rotatedCycle[secondIndex] !== secondStart || rotatedCycle[secondIndex + 1] !== secondNext) {
        return null;
    }
    return {
        rotatedCycle,
        firstPath: rotatedCycle.slice(1, secondIndex + 1),
        secondPath: [...rotatedCycle.slice(secondIndex + 1), rotatedCycle[0]]
    };
}
function seamEdgeForMode(oldCycle, pair, mode) {
    const a = oldCycle[pair.firstIndex];
    const b = oldCycle[(pair.firstIndex + 1) % oldCycle.length];
    const c = oldCycle[pair.secondIndex];
    const d = oldCycle[(pair.secondIndex + 1) % oldCycle.length];
    if (mode === 'ac-bd') {
        return [
            { from: a, to: c },
            { from: b, to: d }
        ];
    }
    return [
        { from: a, to: d },
        { from: b, to: c }
    ];
}
export function constructTwoOptCandidate(oldCycle, pair, mode) {
    const cutPaths = splitCycleAtEdgePair(oldCycle, pair);
    if (!cutPaths) {
        return null;
    }
    if (mode === 'ad-bc') {
        // On a single cycle, reconnecting the cut edges as a->d and b->c closes
        // the two cut paths into separate subtours rather than one Hamiltonian cycle.
        return null;
    }
    const [seam1, seam2] = seamEdgeForMode(cutPaths.rotatedCycle, { firstIndex: 0, secondIndex: cutPaths.firstPath.length }, mode);
    const reversedFirstPath = [...cutPaths.firstPath].reverse();
    const candidate = [cutPaths.rotatedCycle[0], ...reversedFirstPath, ...cutPaths.secondPath.slice(0, -1)];
    if (candidate.length !== oldCycle.length) {
        return null;
    }
    if (new Set(candidate).size !== oldCycle.length || !nodeSetEqualsOldCycle(candidate, oldCycle)) {
        return null;
    }
    const secondSeamIndex = reversedFirstPath.length;
    if (candidate[0] !== seam1.from || candidate[1] !== seam1.to) {
        return null;
    }
    if (candidate[secondSeamIndex] !== seam2.from || candidate[(secondSeamIndex + 1) % candidate.length] !== seam2.to) {
        return null;
    }
    return {
        candidate,
        layout: {
            replacementSeamIndices: [0, secondSeamIndex],
            internalReversalEdgeIndices: Array.from({ length: Math.max(0, reversedFirstPath.length - 1) }, (_, index) => index + 1),
            wraparoundEdgeIndex: candidate.length - 1
        }
    };
}
function buildSearchFocus(state, cycle, neighborhood) {
    if (neighborhood === null) {
        return null;
    }
    const head = state.snake.segments[0];
    const apple = state.appleNodeId;
    if (!head || !apple) {
        return null;
    }
    const headIndex = cycle.indexOf(head);
    const pathLen = distanceForwardOnCycle(head, apple, cycle);
    if (headIndex === -1 || pathLen === null) {
        return null;
    }
    const focus = new Set();
    for (let offset = -neighborhood; offset <= pathLen + neighborhood; offset += 1) {
        const wrappedIndex = (headIndex + offset + cycle.length * 4) % cycle.length;
        focus.add(cycle[wrappedIndex]);
    }
    return focus;
}
function isEdgePairNearFocus(cycle, pair, focus) {
    if (!focus) {
        return true;
    }
    const nodes = [
        cycle[pair.firstIndex],
        cycle[(pair.firstIndex + 1) % cycle.length],
        cycle[pair.secondIndex],
        cycle[(pair.secondIndex + 1) % cycle.length]
    ];
    return nodes.some((nodeId) => focus.has(nodeId));
}
function buildEdgePairs(cycle) {
    const pairs = [];
    for (let firstIndex = 0; firstIndex < cycle.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 2; secondIndex < cycle.length; secondIndex += 1) {
            if (firstIndex === 0 && secondIndex === cycle.length - 1) {
                continue;
            }
            pairs.push({ firstIndex, secondIndex });
        }
    }
    return pairs;
}
function reorderEdgePairs(cycle, pairs, focus, exhaustive) {
    if (exhaustive || !focus) {
        return pairs;
    }
    const near = [];
    const far = [];
    for (const pair of pairs) {
        if (isEdgePairNearFocus(cycle, pair, focus)) {
            near.push(pair);
        }
        else {
            far.push(pair);
        }
    }
    return [...near, ...far];
}
function isImprovingCandidate(baseline, candidate, weights) {
    const pathImproves = baseline.pathLen !== null && candidate.pathLen !== null && candidate.pathLen < baseline.pathLen;
    return pathImproves || compareCandidateCycles(candidate, baseline, weights) < 0;
}
function edgeExistsInGraph(graph, from, to) {
    return graph.edges.some((edge) => edge.from === from && edge.to === to);
}
function findFirstInvalidEdge(graph, candidate) {
    if (candidate.length === 0) {
        return null;
    }
    for (let index = 0; index < candidate.length; index += 1) {
        const edge = {
            from: candidate[index],
            to: candidate[(index + 1) % candidate.length]
        };
        if (!edgeExistsInGraph(graph, edge.from, edge.to)) {
            return { edge, index };
        }
    }
    return null;
}
function nodeSetEqualsOldCycle(candidate, oldCycle) {
    const oldSet = new Set(oldCycle);
    const candidateSet = new Set(candidate);
    if (candidateSet.size !== oldSet.size) {
        return false;
    }
    for (const nodeId of candidateSet) {
        if (!oldSet.has(nodeId)) {
            return false;
        }
    }
    return true;
}
function classifyInvalidEdgeLocation(attempt, invalidEdgeIndex) {
    if (invalidEdgeIndex === null || !attempt.layout) {
        return null;
    }
    if (attempt.layout.replacementSeamIndices.includes(invalidEdgeIndex)) {
        return 'replacement-seam';
    }
    if (attempt.layout.internalReversalEdgeIndices.includes(invalidEdgeIndex)) {
        return 'internal-reversal';
    }
    if (attempt.layout.wraparoundEdgeIndex === invalidEdgeIndex) {
        return 'wraparound';
    }
    return 'elsewhere';
}
function inspectInvalidCandidate(graph, oldCycle, attempt) {
    const candidate = attempt.candidate;
    if (!candidate) {
        return null;
    }
    const uniqueNodeCount = new Set(candidate).size;
    const duplicateNodeCount = candidate.length - uniqueNodeCount;
    const oldNodeSet = new Set(oldCycle);
    const candidateNodeSet = new Set(candidate);
    let missingNodeCount = 0;
    for (const nodeId of oldNodeSet) {
        if (!candidateNodeSet.has(nodeId)) {
            missingNodeCount += 1;
        }
    }
    const candidateNodeSetEqualsOldCycleNodeSet = nodeSetEqualsOldCycle(candidate, oldCycle);
    const firstInvalid = findFirstInvalidEdge(graph, candidate);
    const firstInvalidEdgeLocation = classifyInvalidEdgeLocation(attempt, firstInvalid?.index ?? null);
    const firstInvalidEdgeMatchesIntendedReplacementSeam = attempt.intendedReplacementEdges.some((edge) => edge.from === firstInvalid?.edge.from && edge.to === firstInvalid?.edge.to);
    let failureCategory;
    if (candidate.length !== oldCycle.length) {
        failureCategory = 'length';
    }
    else if (duplicateNodeCount > 0) {
        failureCategory = 'duplicates';
    }
    else if (missingNodeCount > 0 || !candidateNodeSetEqualsOldCycleNodeSet) {
        failureCategory = 'missing-nodes';
    }
    else if (firstInvalidEdgeLocation === 'replacement-seam') {
        failureCategory = 'bad-replacement-seam';
    }
    else if (firstInvalidEdgeLocation === 'internal-reversal') {
        failureCategory = 'bad-internal-reversal';
    }
    else if (firstInvalidEdgeLocation === 'wraparound') {
        failureCategory = 'bad-wraparound';
    }
    else {
        failureCategory = 'other-bad-edge';
    }
    return {
        edgePairIndices: {
            firstIndex: attempt.edgePairIndices.firstIndex,
            secondIndex: attempt.edgePairIndices.secondIndex
        },
        reconnectMode: attempt.reconnectMode,
        candidateLength: candidate.length,
        duplicateNodeCount,
        missingNodeCount,
        candidateNodeSetEqualsOldCycleNodeSet,
        intendedReplacementEdges: attempt.intendedReplacementEdges.map((edge) => ({ ...edge })),
        allIntendedReplacementEdgesExist: attempt.allIntendedReplacementEdgesExist,
        firstInvalidEdge: firstInvalid ? { ...firstInvalid.edge } : null,
        firstInvalidEdgeIndex: firstInvalid?.index ?? null,
        firstInvalidEdgeMatchesIntendedReplacementSeam,
        firstInvalidEdgeLocation,
        failureCategory
    };
}
function incrementInvalidFailureCounter(diagnostics, failureCategory) {
    switch (failureCategory) {
        case 'length':
            diagnostics.invalidDueToLength += 1;
            return;
        case 'duplicates':
            diagnostics.invalidDueToDuplicates += 1;
            return;
        case 'missing-nodes':
            diagnostics.invalidDueToMissingNodes += 1;
            return;
        case 'bad-replacement-seam':
            diagnostics.invalidDueToBadReplacementSeam += 1;
            return;
        case 'bad-internal-reversal':
            diagnostics.invalidDueToBadInternalReversal += 1;
            return;
        case 'bad-wraparound':
            diagnostics.invalidDueToBadWraparound += 1;
            return;
        case 'other-bad-edge':
            diagnostics.invalidDueToOtherBadEdge += 1;
            return;
    }
}
export class TwoOptDiagnosticAnalyzer {
    options;
    lastDiagnostics = { ...EMPTY_TWO_OPT_DIAGNOSTICS };
    lastInvalidCandidateDetails = [];
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_TWO_OPT_DIAGNOSTIC_OPTIONS,
            ...options,
            scoreWeights: options.scoreWeights ?? defaultCycleScoreWeights,
            searchNeighborhood: options.searchNeighborhood ?? DEFAULT_TWO_OPT_DIAGNOSTIC_OPTIONS.searchNeighborhood
        };
    }
    analyze(state, oldCycle) {
        const baselineFeatures = computeCycleFeatures(state, oldCycle, oldCycle);
        this.lastDiagnostics = {
            ...EMPTY_TWO_OPT_DIAGNOSTICS,
            bestPathLenBefore: baselineFeatures.pathLen,
            bestScoreBefore: scoreCycleFeatures(baselineFeatures, this.options.scoreWeights)
        };
        this.lastInvalidCandidateDetails = [];
        const seenSignatures = new Set([buildCycleEdgeSignature(oldCycle)]);
        let bestCandidate = null;
        let bestFeatures = null;
        for (const attempt of this.generateCandidateAttempts(state, oldCycle)) {
            this.lastDiagnostics.replacementPairsConsidered += 1;
            if (attempt.replacementEdgesMissing) {
                this.lastDiagnostics.replacementEdgesMissing += 1;
                continue;
            }
            if (!attempt.candidate) {
                continue;
            }
            this.lastDiagnostics.rawCandidatesGenerated += 1;
            const signature = buildCycleEdgeSignature(attempt.candidate);
            if (seenSignatures.has(signature)) {
                this.lastDiagnostics.duplicateCandidatesSkipped += 1;
                continue;
            }
            seenSignatures.add(signature);
            if (!validateHamiltonianCycle(state.map.graph, attempt.candidate)) {
                this.lastDiagnostics.graphInvalidCandidates += 1;
                const detail = inspectInvalidCandidate(state.map.graph, oldCycle, attempt);
                if (detail) {
                    this.lastInvalidCandidateDetails.push(detail);
                    incrementInvalidFailureCounter(this.lastDiagnostics, detail.failureCategory);
                }
                continue;
            }
            if (!bodyContiguous(state.snake.segments, attempt.candidate)) {
                this.lastDiagnostics.bodyContiguousFailed += 1;
                continue;
            }
            if (!appleForward(state.snake.segments, state.appleNodeId, attempt.candidate)) {
                this.lastDiagnostics.appleForwardFailed += 1;
                continue;
            }
            const features = computeCycleFeatures(state, oldCycle, attempt.candidate);
            this.lastDiagnostics.validCandidates += 1;
            if (bestFeatures === null || compareCandidateCycles(features, bestFeatures, this.options.scoreWeights) < 0) {
                bestCandidate = [...attempt.candidate];
                bestFeatures = features;
            }
            if (isImprovingCandidate(baselineFeatures, features, this.options.scoreWeights)) {
                this.lastDiagnostics.improvingCandidates += 1;
            }
        }
        this.lastDiagnostics.bestPathLenAfter = bestFeatures?.pathLen ?? null;
        this.lastDiagnostics.bestScoreAfter = bestFeatures ? scoreCycleFeatures(bestFeatures, this.options.scoreWeights) : null;
        return {
            diagnostics: { ...this.lastDiagnostics },
            bestCandidate,
            bestFeatures,
            invalidCandidateDetails: this.lastInvalidCandidateDetails.map((detail) => ({
                ...detail,
                edgePairIndices: { ...detail.edgePairIndices },
                intendedReplacementEdges: detail.intendedReplacementEdges.map((edge) => ({ ...edge })),
                firstInvalidEdge: detail.firstInvalidEdge ? { ...detail.firstInvalidEdge } : null
            }))
        };
    }
    generateCandidateAttempts(state, oldCycle) {
        const pairs = reorderEdgePairs(oldCycle, buildEdgePairs(oldCycle), buildSearchFocus(state, oldCycle, this.options.searchNeighborhood), this.options.exhaustive);
        const attempts = [];
        for (const pair of pairs) {
            if (this.lastDiagnostics.edgePairsConsidered >= this.options.maxPairsChecked) {
                this.lastDiagnostics.budgetExhausted = true;
                return attempts;
            }
            this.lastDiagnostics.edgePairsConsidered += 1;
            const firstStart = oldCycle[pair.firstIndex];
            const firstNext = oldCycle[(pair.firstIndex + 1) % oldCycle.length];
            const secondStart = oldCycle[pair.secondIndex];
            const secondNext = oldCycle[(pair.secondIndex + 1) % oldCycle.length];
            attempts.push(this.buildAttemptForReconnectMode(state, oldCycle, pair, firstStart, firstNext, secondStart, secondNext, 'ac-bd'));
            attempts.push(this.buildAttemptForReconnectMode(state, oldCycle, pair, firstStart, firstNext, secondStart, secondNext, 'ad-bc'));
        }
        return attempts;
    }
    buildAttemptForReconnectMode(state, oldCycle, edgePairIndices, firstStart, firstNext, secondStart, secondNext, mode) {
        const intendedReplacementEdges = mode === 'ac-bd'
            ? [
                { from: firstStart, to: secondStart },
                { from: firstNext, to: secondNext }
            ]
            : [
                { from: firstStart, to: secondNext },
                { from: firstNext, to: secondStart }
            ];
        const allIntendedReplacementEdgesExist = intendedReplacementEdges.every((edge) => edgeExistsInGraph(state.map.graph, edge.from, edge.to));
        if (!allIntendedReplacementEdgesExist) {
            return {
                candidate: null,
                replacementEdgesMissing: true,
                edgePairIndices,
                reconnectMode: mode,
                intendedReplacementEdges,
                allIntendedReplacementEdgesExist,
                layout: null
            };
        }
        const construction = constructTwoOptCandidate(oldCycle, edgePairIndices, mode);
        return {
            candidate: construction?.candidate ?? null,
            replacementEdgesMissing: false,
            edgePairIndices,
            reconnectMode: mode,
            intendedReplacementEdges,
            allIntendedReplacementEdgesExist,
            layout: construction?.layout ?? null
        };
    }
}
