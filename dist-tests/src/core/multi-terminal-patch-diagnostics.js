"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMultiTerminalRectanglePatch = analyzeMultiTerminalRectanglePatch;
exports.analyzeFourExitDecomposition = analyzeFourExitDecomposition;
exports.analyzeMultiTerminalRectanglePatches = analyzeMultiTerminalRectanglePatches;
exports.analyzeMultiTerminalRectanglePatchesForRectangles = analyzeMultiTerminalRectanglePatchesForRectangles;
exports.generateSamePairing4ExitPathCovers = generateSamePairing4ExitPathCovers;
exports.validateSamePairingPathCover = validateSamePairingPathCover;
exports.pathCoverSignature = pathCoverSignature;
exports.sameAsOriginalCover = sameAsOriginalCover;
exports.analyzeSamePairing4ExitPathCovers = analyzeSamePairing4ExitPathCovers;
exports.analyzeSamePairing4ExitPathCoversForRectangles = analyzeSamePairing4ExitPathCoversForRectangles;
exports.spliceMultiTerminalSamePairingCoverByEdges = spliceMultiTerminalSamePairingCoverByEdges;
exports.reconstructCycleFromDegreeTwoEdges = reconstructCycleFromDegreeTwoEdges;
exports.generateV2FourExitSpliceCandidates = generateV2FourExitSpliceCandidates;
exports.generateV2FourExitSpliceCandidatesFromRectangles = generateV2FourExitSpliceCandidatesFromRectangles;
exports.classifyV2FourExitSpliceCandidateForSnake = classifyV2FourExitSpliceCandidateForSnake;
exports.classifyV2FourExitSpliceCandidatesForSnake = classifyV2FourExitSpliceCandidatesForSnake;
exports.classifyGeneratedV2FourExitSpliceCandidatesForSnake = classifyGeneratedV2FourExitSpliceCandidatesForSnake;
exports.computeV2FourExitMutationFeatures = computeV2FourExitMutationFeatures;
exports.scoreV2FourExitMutationCandidate = scoreV2FourExitMutationCandidate;
exports.compareV2FourExitMutationFeaturesForRanking = compareV2FourExitMutationFeaturesForRanking;
const map_validator_js_1 = require("./map-validator.js");
const certified_transition_diagnostics_js_1 = require("./certified-transition-diagnostics.js");
const cycle_scoring_js_1 = require("./cycle-scoring.js");
const hamiltonian_certificate_js_1 = require("./hamiltonian-certificate.js");
const two_terminal_patch_mutation_js_1 = require("./two-terminal-patch-mutation.js");
const DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS = {
    maxPatchArea4Exit: 24,
    maxCoversPerPatch: 64,
    maxSolverExpansionsPerPatch: 100_000
};
function analyzeMultiTerminalRectanglePatch(graph, cycle, rect) {
    const rectNodeSet = buildRectNodeSet(graph, rect);
    const fullRectangle = rectNodeSet.size === rect.width * rect.height;
    const base = createBasePatchDiagnostics(rect, rectNodeSet.size, fullRectangle);
    if (!fullRectangle) {
        return {
            ...base,
            rejectionReason: 'rectangle-not-full'
        };
    }
    const crossingEdges = (0, two_terminal_patch_mutation_js_1.getCycleCutCrossings)(cycle, rectNodeSet);
    const terminals = crossingEdges.map((crossing) => crossing.insideNode);
    const repeatedTerminalCount = terminals.length - new Set(terminals).size;
    const exitClass = classifyExitCount(crossingEdges.length);
    const countedBase = {
        ...base,
        crossingCount: crossingEdges.length,
        terminals,
        repeatedTerminalCount,
        exitClass
    };
    if (repeatedTerminalCount > 0) {
        return {
            ...countedBase,
            rejectionReason: 'repeated-terminal'
        };
    }
    switch (exitClass) {
        case 'two':
            return {
                ...countedBase,
                rejectionReason: 'two-exit-owned-by-v1'
            };
        case 'six':
            return {
                ...countedBase,
                rejectionReason: 'six-exit-count-only'
            };
        case 'eight':
            return {
                ...countedBase,
                rejectionReason: 'eight-exit-count-only'
            };
        case 'other':
            return {
                ...countedBase,
                rejectionReason: 'unsupported-exit-count'
            };
        case 'four':
            break;
    }
    const decompositionResult = analyzeFourExitDecomposition(rectNodeSet, terminals, crossingEdges, (0, two_terminal_patch_mutation_js_1.extractInsideCycleEdges)(cycle, rectNodeSet));
    return {
        ...countedBase,
        fourExitDecomposition: decompositionResult.decomposition,
        rejectionReason: decompositionResult.rejectionReason
    };
}
function analyzeFourExitDecomposition(rectNodeSet, terminals, crossingEdges, internalEdges) {
    const terminalSet = new Set(terminals);
    if (terminals.length !== 4 || terminalSet.size !== 4 || crossingEdges.length !== 4) {
        return {
            decomposition: null,
            rejectionReason: 'terminal-count-mismatch'
        };
    }
    const internalDegree = calculateInternalDegrees(rectNodeSet, internalEdges);
    const cutDegree = calculateCutDegrees(rectNodeSet, crossingEdges);
    if (!hasValidCycleDegreeAccounting(rectNodeSet, internalDegree, cutDegree)) {
        return {
            decomposition: null,
            rejectionReason: 'invalid-cycle-degree-accounting'
        };
    }
    if (!hasExpectedTerminalInternalDegrees(terminalSet, internalDegree)) {
        return {
            decomposition: null,
            rejectionReason: 'invalid-terminal-internal-degree'
        };
    }
    if (!hasExpectedNonterminalInternalDegrees(rectNodeSet, terminalSet, internalDegree)) {
        return {
            decomposition: null,
            rejectionReason: 'invalid-nonterminal-internal-degree'
        };
    }
    const adjacency = buildInternalAdjacency(rectNodeSet, internalEdges);
    const components = connectedComponents(rectNodeSet, adjacency, terminalSet);
    if (components.length !== 2) {
        return {
            decomposition: null,
            rejectionReason: 'component-count-not-two'
        };
    }
    if (!components.every((component) => isSimplePathComponent(component, adjacency))) {
        return {
            decomposition: null,
            rejectionReason: 'component-not-simple-path'
        };
    }
    if (!components.every((component) => component.terminalNodes.length === 2)) {
        return {
            decomposition: null,
            rejectionReason: 'component-terminal-count-not-two'
        };
    }
    const terminalPairs = components
        .map((component) => terminalPairFromComponent(component, adjacency))
        .filter((pair) => pair !== null)
        .sort(compareTerminalPairs);
    const coveredNodes = new Set(terminalPairs.flatMap((pair) => pair.originalPath));
    const coversAllPatchVertices = coveredNodes.size === rectNodeSet.size &&
        [...rectNodeSet].every((nodeId) => coveredNodes.has(nodeId));
    if (terminalPairs.length !== 2 || !coversAllPatchVertices) {
        return {
            decomposition: null,
            rejectionReason: 'internal-components-miss-vertices'
        };
    }
    return {
        decomposition: {
            terminalPairs,
            internalEdges: [...internalEdges],
            componentCount: components.length,
            coversAllPatchVertices,
            internalDegreeByNode: degreeRecord(internalDegree),
            cutDegreeByNode: degreeRecord(cutDegree)
        },
        rejectionReason: 'valid-four-exit-decomposition'
    };
}
function analyzeMultiTerminalRectanglePatches(graph, cycle, options = {}) {
    const rectangles = applyRectangleScanBudget((0, two_terminal_patch_mutation_js_1.enumerateRectangles)(graph, options), options.maxPatchRectsScanned);
    return analyzeMultiTerminalRectanglePatchesForRectangles(graph, cycle, rectangles);
}
function analyzeMultiTerminalRectanglePatchesForRectangles(graph, cycle, rectangles) {
    const patches = rectangles.map((rect) => analyzeMultiTerminalRectanglePatch(graph, cycle, rect));
    const aggregate = createEmptyAggregateDiagnostics();
    const reasonCounts = new Map();
    for (const patch of patches) {
        aggregate.rectanglesScanned += 1;
        incrementReason(reasonCounts, patch.rejectionReason);
        if (!patch.fullRectangle) {
            continue;
        }
        aggregate.fullRectangles += 1;
        if (patch.repeatedTerminalCount > 0) {
            aggregate.repeatedTerminalRectangles += 1;
        }
        switch (patch.exitClass) {
            case 'two':
                aggregate.twoExitRectangles += 1;
                break;
            case 'four':
                aggregate.fourExitRectangles += 1;
                if (patch.repeatedTerminalCount === 0) {
                    aggregate.fourExitDecompositionAttempts += 1;
                }
                break;
            case 'six':
                aggregate.sixExitRectangles += 1;
                if (patch.repeatedTerminalCount === 0 && hasPlausibleSixExitDegreePattern(graph, cycle, patch.rect)) {
                    aggregate.sixExitPlausibleDegreePattern += 1;
                }
                break;
            case 'eight':
                aggregate.eightExitRectangles += 1;
                if (patch.rejectionReason === 'eight-exit-count-only') {
                    aggregate.eightExitCountOnly += 1;
                }
                break;
            case 'other':
                aggregate.otherExitRectangles += 1;
                break;
        }
        switch (patch.rejectionReason) {
            case 'valid-four-exit-decomposition':
                aggregate.validFourExitDecompositions += 1;
                break;
            case 'invalid-cycle-degree-accounting':
                aggregate.invalidDegreeAccounting += 1;
                break;
            case 'invalid-terminal-internal-degree':
                aggregate.invalidTerminalDegree += 1;
                break;
            case 'invalid-nonterminal-internal-degree':
                aggregate.invalidNonterminalDegree += 1;
                break;
            case 'component-count-not-two':
                aggregate.invalidComponentCount += 1;
                break;
            case 'component-not-simple-path':
            case 'component-terminal-count-not-two':
                aggregate.invalidComponentPath += 1;
                break;
            case 'internal-components-miss-vertices':
                aggregate.componentsMissingVertices += 1;
                break;
            default:
                break;
        }
    }
    aggregate.topRejectionReasons = topReasons(reasonCounts);
    return { aggregate, patches };
}
function generateSamePairing4ExitPathCovers(patch, graph, options = {}) {
    const resolved = resolveSamePairingPathCoverOptions(options);
    const terminalPairs = patch.fourExitDecomposition?.terminalPairs ?? [];
    const base = createEmptyPathCoverDiagnostics(patch.rect, terminalPairs);
    if (patch.rejectionReason !== 'valid-four-exit-decomposition' ||
        patch.exitClass !== 'four' ||
        !patch.fourExitDecomposition) {
        return base;
    }
    if (patch.vertexCount > resolved.maxPatchArea4Exit) {
        return {
            ...base,
            rejectionReason: 'patch-area-too-large'
        };
    }
    const rectNodeSet = buildRectNodeSet(graph, patch.rect);
    const adjacency = buildRectangleGridAdjacency(graph, patch.rect);
    const [firstPair, secondPair] = terminalPairs;
    if (!firstPair || !secondPair || rectNodeSet.size !== patch.vertexCount) {
        return base;
    }
    const context = {
        expansions: 0,
        budgetExhausted: false
    };
    const covers = [];
    const seenSignatures = new Set();
    let noOpCoversSkipped = 0;
    let duplicateCoversSkipped = 0;
    const originalSignature = originalCoverSignature(patch);
    const blockedForFirstPath = new Set([secondPair.terminalA, secondPair.terminalB]);
    const firstPathState = {
        path: [firstPair.terminalA],
        visited: new Set([firstPair.terminalA])
    };
    const dfsFirstPath = (current) => {
        if (covers.length >= resolved.maxCoversPerPatch || context.budgetExhausted) {
            return;
        }
        if (!consumeExpansion(context, resolved.maxSolverExpansionsPerPatch)) {
            return;
        }
        if (current === firstPair.terminalB) {
            const remaining = new Set([...rectNodeSet].filter((nodeId) => !firstPathState.visited.has(nodeId)));
            if (!remaining.has(secondPair.terminalA) || !remaining.has(secondPair.terminalB)) {
                return;
            }
            const secondPaths = findHamiltonPathsThroughRemaining(secondPair.terminalA, secondPair.terminalB, remaining, adjacency, context, resolved.maxSolverExpansionsPerPatch, resolved.maxCoversPerPatch - covers.length);
            for (const secondPath of secondPaths) {
                const cover = {
                    paths: [[...firstPathState.path], secondPath]
                };
                if (!validateSamePairingPathCover(patch, graph, cover)) {
                    continue;
                }
                if (pathCoverSignature(cover) === originalSignature || sameAsOriginalCover(patch, cover)) {
                    noOpCoversSkipped += 1;
                    continue;
                }
                const signature = pathCoverSignature(cover);
                if (seenSignatures.has(signature)) {
                    duplicateCoversSkipped += 1;
                    continue;
                }
                seenSignatures.add(signature);
                covers.push(cover);
                if (covers.length >= resolved.maxCoversPerPatch) {
                    break;
                }
            }
            return;
        }
        for (const next of orderedGridNeighbors(current, adjacency, firstPathState.visited, firstPair.terminalB)) {
            if (blockedForFirstPath.has(next)) {
                continue;
            }
            firstPathState.visited.add(next);
            firstPathState.path.push(next);
            const remaining = new Set([...rectNodeSet].filter((nodeId) => !firstPathState.visited.has(nodeId)));
            const shouldContinue = current === firstPair.terminalB ||
                remaining.size === 0 ||
                canStillConnectSecondPair(remaining, secondPair, adjacency);
            if (shouldContinue) {
                dfsFirstPath(next);
            }
            firstPathState.path.pop();
            firstPathState.visited.delete(next);
            if (covers.length >= resolved.maxCoversPerPatch || context.budgetExhausted) {
                break;
            }
        }
    };
    dfsFirstPath(firstPair.terminalA);
    return {
        rect: patch.rect,
        terminalPairs,
        attempted: true,
        solverExpansions: context.expansions,
        budgetExhausted: context.budgetExhausted,
        coversFound: covers.length,
        noOpCoversSkipped,
        duplicateCoversSkipped,
        rejectionReason: covers.length > 0
            ? 'valid-alternative-cover'
            : context.budgetExhausted
                ? 'budget-exhausted'
                : 'no-alternative-cover',
        covers
    };
}
function validateSamePairingPathCover(patch, graph, cover) {
    const terminalPairs = patch.fourExitDecomposition?.terminalPairs;
    if (patch.rejectionReason !== 'valid-four-exit-decomposition' ||
        patch.exitClass !== 'four' ||
        !terminalPairs ||
        terminalPairs.length !== 2 ||
        cover.paths.length !== 2) {
        return false;
    }
    const rectNodeSet = buildRectNodeSet(graph, patch.rect);
    if (rectNodeSet.size !== patch.vertexCount) {
        return false;
    }
    const adjacency = buildRectangleGridAdjacency(graph, patch.rect);
    const seen = new Set();
    for (let index = 0; index < terminalPairs.length; index += 1) {
        const pair = terminalPairs[index];
        const path = cover.paths[index];
        const otherPair = terminalPairs[index === 0 ? 1 : 0];
        if (path[0] !== pair.terminalA || path[path.length - 1] !== pair.terminalB) {
            return false;
        }
        for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
            const nodeId = path[pathIndex];
            if (!rectNodeSet.has(nodeId) || seen.has(nodeId)) {
                return false;
            }
            if (pathIndex > 0 &&
                pathIndex < path.length - 1 &&
                (nodeId === otherPair.terminalA || nodeId === otherPair.terminalB)) {
                return false;
            }
            seen.add(nodeId);
        }
        for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex += 1) {
            if (!areAdjacentInGrid(path[pathIndex], path[pathIndex + 1], adjacency)) {
                return false;
            }
        }
    }
    return seen.size === rectNodeSet.size && [...rectNodeSet].every((nodeId) => seen.has(nodeId));
}
function pathCoverSignature(cover) {
    return edgeSignatureForPaths(cover.paths);
}
function sameAsOriginalCover(patch, cover) {
    return pathCoverSignature(cover) === originalCoverSignature(patch);
}
function analyzeSamePairing4ExitPathCovers(graph, cycle, options = {}) {
    const detectionStartedAt = Date.now();
    const patchScan = analyzeMultiTerminalRectanglePatches(graph, cycle, options);
    return analyzeSamePairing4ExitPathCoversFromPatchScan(graph, patchScan, options, Date.now() - detectionStartedAt);
}
function analyzeSamePairing4ExitPathCoversForRectangles(graph, cycle, rectangles, options = {}) {
    const detectionStartedAt = Date.now();
    const patchScan = analyzeMultiTerminalRectanglePatchesForRectangles(graph, cycle, rectangles);
    return analyzeSamePairing4ExitPathCoversFromPatchScan(graph, patchScan, options, Date.now() - detectionStartedAt);
}
function analyzeSamePairing4ExitPathCoversFromPatchScan(graph, patchScan, options, detectionMs) {
    const pathCoverStartedAt = Date.now();
    const validPatches = patchScan.patches.filter((patch) => patch.rejectionReason === 'valid-four-exit-decomposition');
    const pathCoverDiagnostics = validPatches.map((patch) => generateSamePairing4ExitPathCovers(patch, graph, options));
    const pathCoverSolvingMs = Date.now() - pathCoverStartedAt;
    const aggregate = createEmptyPathCoverAggregateDiagnostics(validPatches.length);
    const reasonCounts = new Map();
    for (const diagnostic of pathCoverDiagnostics) {
        incrementPathCoverReason(reasonCounts, diagnostic.rejectionReason);
        if (diagnostic.attempted) {
            aggregate.patchesAttempted += 1;
        }
        if (diagnostic.budgetExhausted) {
            aggregate.budgetExhaustedPatches += 1;
        }
        if (diagnostic.coversFound > 0) {
            aggregate.patchesWithAlternativeCovers += 1;
        }
        aggregate.pathCoversFound += diagnostic.coversFound;
        aggregate.noOpCoversSkipped += diagnostic.noOpCoversSkipped;
        aggregate.duplicateCoversSkipped += diagnostic.duplicateCoversSkipped;
    }
    aggregate.topFailureReasons = topPathCoverReasons(reasonCounts);
    return {
        patchScan,
        aggregate,
        patches: pathCoverDiagnostics,
        profile: {
            detectionMs,
            pathCoverSolvingMs
        }
    };
}
function spliceMultiTerminalSamePairingCoverByEdges(graph, oldCycle, patch, cover) {
    return spliceMultiTerminalSamePairingCoverByEdgesDetailed(graph, oldCycle, patch, cover).candidateCycle;
}
function reconstructCycleFromDegreeTwoEdges(edgeSet, startNode) {
    if (edgeSet.length === 0) {
        return null;
    }
    const adjacency = buildUndirectedAdjacency(edgeSet);
    if ([...adjacency.values()].some((neighbors) => neighbors.size !== 2)) {
        return null;
    }
    const start = startNode && adjacency.has(startNode)
        ? startNode
        : [...adjacency.keys()].sort()[0];
    if (!start) {
        return null;
    }
    const cycle = [start];
    let previous = null;
    let current = start;
    for (let step = 0; step <= adjacency.size; step += 1) {
        const neighbors = [...(adjacency.get(current) ?? [])].sort();
        const next = previous === null ? neighbors[0] : neighbors.find((nodeId) => nodeId !== previous);
        if (!next) {
            return null;
        }
        if (next === start) {
            return cycle.length === adjacency.size ? cycle : null;
        }
        if (cycle.includes(next)) {
            return null;
        }
        previous = current;
        current = next;
        cycle.push(current);
    }
    return null;
}
function generateV2FourExitSpliceCandidates(graph, cycle, options = {}) {
    const startedAt = Date.now();
    const pathCoverDiagnostics = analyzeSamePairing4ExitPathCovers(graph, cycle, options);
    return generateV2FourExitSpliceCandidatesFromPathCoverDiagnostics(graph, cycle, pathCoverDiagnostics, startedAt);
}
function generateV2FourExitSpliceCandidatesFromRectangles(graph, cycle, rectangles, options = {}) {
    const startedAt = Date.now();
    const pathCoverDiagnostics = analyzeSamePairing4ExitPathCoversForRectangles(graph, cycle, rectangles, options);
    return generateV2FourExitSpliceCandidatesFromPathCoverDiagnostics(graph, cycle, pathCoverDiagnostics, startedAt);
}
function generateV2FourExitSpliceCandidatesFromPathCoverDiagnostics(graph, cycle, pathCoverDiagnostics, startedAt) {
    const splicingStartedAt = Date.now();
    const patchByRectKey = new Map(pathCoverDiagnostics.patchScan.patches.map((patch) => [rectKey(patch.rect), patch]));
    const aggregate = createEmptyV2FourExitSpliceAggregateDiagnostics(pathCoverDiagnostics.aggregate.validFourExitDecompositions);
    const candidateDiagnostics = [];
    const candidates = [];
    const reasonCounts = new Map();
    const seenCandidateSignatures = new Set();
    for (const pathCoverPatch of pathCoverDiagnostics.patches) {
        const patch = patchByRectKey.get(rectKey(pathCoverPatch.rect));
        if (!patch) {
            continue;
        }
        for (const cover of pathCoverPatch.covers) {
            aggregate.alternativeCoversConsidered += 1;
            const coverSignature = pathCoverSignature(cover);
            const splice = spliceMultiTerminalSamePairingCoverByEdgesDetailed(graph, cycle, patch, cover);
            const baseDiagnostic = createV2FourExitSpliceCandidateDiagnostics(patch, coverSignature, splice.edgeSetDegreeValid, splice.reconstructedSingleCycle, splice.nodeSetMatchesOldCycle);
            if (!splice.edgeSetDegreeValid) {
                aggregate.degreeInvalidCandidates += 1;
                recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
                    ...baseDiagnostic,
                    rejectionReason: 'degree-invalid'
                });
                continue;
            }
            if (!splice.reconstructedSingleCycle) {
                aggregate.subtourCandidates += 1;
                recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
                    ...baseDiagnostic,
                    rejectionReason: 'subtour'
                });
                continue;
            }
            if (!splice.nodeSetMatchesOldCycle || !splice.candidateCycle) {
                aggregate.nodeSetMismatchCandidates += 1;
                recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
                    ...baseDiagnostic,
                    rejectionReason: 'node-set-mismatch'
                });
                continue;
            }
            aggregate.rawCandidatesGenerated += 1;
            const candidateSignature = cycleUndirectedEdgeSignature(splice.candidateCycle);
            if (seenCandidateSignatures.has(candidateSignature)) {
                aggregate.duplicateCandidatesSkipped += 1;
                recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
                    ...baseDiagnostic,
                    duplicateCandidate: true,
                    rejectionReason: 'duplicate-candidate'
                });
                continue;
            }
            seenCandidateSignatures.add(candidateSignature);
            const graphValid = (0, map_validator_js_1.validateHamiltonianCycle)(graph, splice.candidateCycle);
            if (!graphValid) {
                aggregate.graphInvalidCandidates += 1;
                recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
                    ...baseDiagnostic,
                    graphValid: false,
                    rejectionReason: 'graph-invalid'
                });
                continue;
            }
            aggregate.graphValidCandidates += 1;
            recordV2FourExitSpliceDiagnostic(candidateDiagnostics, reasonCounts, {
                ...baseDiagnostic,
                graphValid: true,
                rejectionReason: 'graph-valid'
            });
            candidates.push({
                cycle: splice.candidateCycle,
                rect: patch.rect,
                terminalPairs: patch.fourExitDecomposition?.terminalPairs ?? [],
                coverSignature
            });
        }
    }
    aggregate.topRejectionReasons = topV2FourExitSpliceReasons(reasonCounts);
    const splicingValidationMs = Date.now() - splicingStartedAt;
    return {
        pathCoverDiagnostics,
        aggregate,
        candidateDiagnostics,
        candidates,
        profile: {
            detectionMs: pathCoverDiagnostics.profile.detectionMs,
            pathCoverSolvingMs: pathCoverDiagnostics.profile.pathCoverSolvingMs,
            splicingValidationMs,
            totalMs: Date.now() - startedAt
        }
    };
}
function classifyV2FourExitSpliceCandidateForSnake(state, candidate, options = {}) {
    const validateCycle = options.validateCycle ?? map_validator_js_1.validateHamiltonianCycle;
    const graphValid = validateCycle(state.map.graph, candidate.cycle);
    if (!graphValid) {
        return createV2SnakeClassification({
            graphValid,
            reason: 'graph-invalid'
        });
    }
    const lockedCertificateValid = (0, hamiltonian_certificate_js_1.validLockedCertificate)(state.snake.segments, candidate.cycle);
    const appleForwardValid = !state.appleNodeId || (0, hamiltonian_certificate_js_1.appleForward)(state.snake.segments, state.appleNodeId, candidate.cycle);
    if (lockedCertificateValid && appleForwardValid) {
        return createV2SnakeClassification({
            graphValid,
            lockedCertificateValid,
            appleForwardValid,
            immediateLocked: true,
            usableForSnake: true,
            usabilityMode: 'immediate-locked',
            reason: 'immediate-locked'
        });
    }
    if (!state.appleNodeId) {
        return createV2SnakeClassification({
            graphValid,
            lockedCertificateValid,
            appleForwardValid,
            reason: 'no-current-apple-for-transition'
        });
    }
    const transitionDiagnostics = (0, certified_transition_diagnostics_js_1.analyzeCertifiedTransitionTargets)(state, {
        mapId: state.map.id,
        status: 'ready',
        entries: [{
                id: v2CandidateIdForTransition(candidate.coverSignature),
                cycle: candidate.cycle,
                source: 'solver',
                archetypeName: 'v2-four-exit-same-pairing',
                minDistanceToAccepted: 0,
                minOrderDistanceToAccepted: 0
            }],
        diagnostics: {
            generationAttempts: 0,
            generatedCycles: 1,
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
    }, options.transitionOptions);
    const target = transitionDiagnostics.targets[0] ?? null;
    const transitionReachable = (target?.successfulTransitionPaths ?? 0) > 0;
    const transitionPlanSummary = target
        ? {
            targetCycleId: target.targetCycleId,
            pathsGenerated: target.pathsGenerated,
            pathsSimulated: target.pathsSimulated,
            safePathsToApple: target.safePathsToApple,
            successfulTransitionPaths: target.successfulTransitionPaths,
            bestSuccessfulPathLength: target.bestSuccessfulPathLength,
            bestSuccessfulPath: target.bestSuccessfulPath,
            failureReasons: target.failureReasons,
            lockedCertificateFailures: target.lockedCertificateFailures
        }
        : null;
    if (transitionReachable) {
        return createV2SnakeClassification({
            graphValid,
            lockedCertificateValid,
            appleForwardValid,
            transitionReachable,
            transitionPathLength: target?.bestSuccessfulPathLength ?? null,
            transitionPlanSummary,
            usableForSnake: true,
            usabilityMode: 'transition-valid',
            reason: 'transition-valid'
        });
    }
    return createV2SnakeClassification({
        graphValid,
        lockedCertificateValid,
        appleForwardValid,
        transitionPlanSummary,
        reason: lockedCertificateValid && !appleForwardValid
            ? 'immediate-locked-apple-forward-failed'
            : lockedCertificateValid
                ? 'no-certified-use'
                : 'locked-invalid-transition-not-found'
    });
}
function classifyV2FourExitSpliceCandidatesForSnake(state, graph, cycle, options = {}) {
    const spliceDiagnostics = generateV2FourExitSpliceCandidates(graph, cycle, options);
    const result = classifyGeneratedV2FourExitSpliceCandidatesForSnake(state, spliceDiagnostics.candidates, state.lockedHamiltonianCycle ?? cycle, options);
    return {
        spliceDiagnostics,
        ...result
    };
}
function classifyGeneratedV2FourExitSpliceCandidatesForSnake(state, candidates, currentCycle, options) {
    const validateCycle = options.validateCycle ?? map_validator_js_1.validateHamiltonianCycle;
    const classifications = new Map();
    const transitionCandidates = [];
    let certificationMs = 0;
    let transitionSearchMs = 0;
    let nonImmediateCandidates = 0;
    const initialCertificationStartedAt = Date.now();
    for (const candidate of candidates) {
        const graphValid = validateCycle(state.map.graph, candidate.cycle);
        if (!graphValid) {
            classifications.set(candidate.coverSignature, {
                candidate,
                ...createV2SnakeClassification({
                    graphValid,
                    reason: 'graph-invalid'
                })
            });
            continue;
        }
        const lockedCertificateValid = (0, hamiltonian_certificate_js_1.validLockedCertificate)(state.snake.segments, candidate.cycle);
        const appleForwardValid = !state.appleNodeId || (0, hamiltonian_certificate_js_1.appleForward)(state.snake.segments, state.appleNodeId, candidate.cycle);
        const cheapTransitionFeatures = buildV2CheapTransitionFeatures(state, currentCycle, candidate);
        if (lockedCertificateValid && appleForwardValid) {
            classifications.set(candidate.coverSignature, {
                candidate,
                ...createV2SnakeClassification({
                    graphValid,
                    lockedCertificateValid,
                    appleForwardValid,
                    immediateLocked: true,
                    usableForSnake: true,
                    usabilityMode: 'immediate-locked',
                    reason: 'immediate-locked',
                    cheapTransitionFeatures
                })
            });
            continue;
        }
        if (!state.appleNodeId) {
            classifications.set(candidate.coverSignature, {
                candidate,
                ...createV2SnakeClassification({
                    graphValid,
                    lockedCertificateValid,
                    appleForwardValid,
                    reason: 'no-current-apple-for-transition',
                    cheapTransitionFeatures
                })
            });
            continue;
        }
        nonImmediateCandidates += 1;
        transitionCandidates.push({
            candidate,
            cheapTransitionFeatures,
            lockedCertificateValid,
            appleForwardValid
        });
    }
    certificationMs += Date.now() - initialCertificationStartedAt;
    const immediateImprovingExists = options.preferImmediateLockedBeforeTransitionSearch === true &&
        [...classifications.values()].some((classification) => classification.reason === 'immediate-locked' &&
            (classification.cheapTransitionFeatures?.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY) >=
                (options.minimumPathImprovement ?? 1));
    const selectedTransitionCandidates = selectV2TransitionCandidatesForSearch(transitionCandidates, options, immediateImprovingExists);
    const selectedTransitionSet = new Set(selectedTransitionCandidates.map(({ candidate }) => candidate.coverSignature));
    if (selectedTransitionCandidates.length > 0) {
        const transitionSearchStartedAt = Date.now();
        const transitionDiagnostics = (0, certified_transition_diagnostics_js_1.analyzeCertifiedTransitionTargets)(state, {
            mapId: state.map.id,
            status: 'ready',
            entries: selectedTransitionCandidates.map(({ candidate }) => ({
                id: v2CandidateIdForTransition(candidate.coverSignature),
                cycle: candidate.cycle,
                source: 'solver',
                archetypeName: 'v2-four-exit-same-pairing',
                minDistanceToAccepted: 0,
                minOrderDistanceToAccepted: 0
            })),
            diagnostics: {
                generationAttempts: 0,
                generatedCycles: selectedTransitionCandidates.length,
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
        }, options.transitionOptions);
        transitionSearchMs += Date.now() - transitionSearchStartedAt;
        const targetById = new Map(transitionDiagnostics.targets.map((target) => [target.targetCycleId, target]));
        const postTransitionCertificationStartedAt = Date.now();
        for (const { candidate, cheapTransitionFeatures, lockedCertificateValid, appleForwardValid } of selectedTransitionCandidates) {
            const graphValid = true;
            const target = targetById.get(v2CandidateIdForTransition(candidate.coverSignature)) ?? null;
            const transitionReachable = (target?.successfulTransitionPaths ?? 0) > 0;
            const transitionPlanSummary = target
                ? {
                    targetCycleId: target.targetCycleId,
                    pathsGenerated: target.pathsGenerated,
                    pathsSimulated: target.pathsSimulated,
                    safePathsToApple: target.safePathsToApple,
                    successfulTransitionPaths: target.successfulTransitionPaths,
                    bestSuccessfulPathLength: target.bestSuccessfulPathLength,
                    bestSuccessfulPath: target.bestSuccessfulPath,
                    failureReasons: target.failureReasons,
                    lockedCertificateFailures: target.lockedCertificateFailures
                }
                : null;
            classifications.set(candidate.coverSignature, {
                candidate,
                ...createV2SnakeClassification({
                    graphValid,
                    lockedCertificateValid,
                    appleForwardValid,
                    transitionReachable,
                    transitionPathLength: transitionReachable ? target?.bestSuccessfulPathLength ?? null : null,
                    transitionPlanSummary,
                    cheapTransitionFeatures,
                    transitionSearchAttempted: true,
                    usableForSnake: transitionReachable,
                    usabilityMode: transitionReachable ? 'transition-valid' : 'unusable',
                    reason: transitionReachable
                        ? 'transition-valid'
                        : lockedCertificateValid && !appleForwardValid
                            ? 'immediate-locked-apple-forward-failed'
                            : lockedCertificateValid
                                ? 'no-certified-use'
                                : 'locked-invalid-transition-not-found'
                })
            });
        }
        certificationMs += Date.now() - postTransitionCertificationStartedAt;
    }
    for (const { candidate, cheapTransitionFeatures, lockedCertificateValid, appleForwardValid } of transitionCandidates) {
        if (selectedTransitionSet.has(candidate.coverSignature)) {
            continue;
        }
        classifications.set(candidate.coverSignature, {
            candidate,
            ...createV2SnakeClassification({
                graphValid: true,
                lockedCertificateValid,
                appleForwardValid,
                cheapTransitionFeatures,
                transitionSkippedByPrefilter: true,
                reason: lockedCertificateValid && !appleForwardValid
                    ? 'immediate-locked-apple-forward-failed'
                    : lockedCertificateValid
                        ? 'no-certified-use'
                        : 'locked-invalid-transition-not-found'
            })
        });
    }
    const classificationList = candidates.map((candidate) => classifications.get(candidate.coverSignature)).filter(Boolean);
    const scoringStartedAt = Date.now();
    const rankedCandidates = classificationList
        .map((classification, index) => {
        const features = computeV2FourExitMutationFeatures(state, currentCycle, classification, index);
        return features ? { candidate: classification.candidate, classification, features } : null;
    })
        .filter((ranked) => ranked !== null)
        .sort(compareRankedV2FourExitSnakeCandidates);
    const scoringMs = Date.now() - scoringStartedAt;
    return {
        aggregate: summarizeV2FourExitSnakeDiagnostics(classificationList, rankedCandidates, state.appleNodeId !== null),
        classifications: classificationList,
        rankedCandidates,
        profile: {
            certificationMs,
            transitionSearchMs,
            scoringMs,
            nonImmediateCandidates,
            transitionCandidatesAfterPrefilter: classificationList.filter((classification) => classification.transitionSearchAttempted).length,
            transitionCandidatesSkippedByPrefilter: classificationList.filter((classification) => classification.transitionSkippedByPrefilter).length,
            transitionSearchesStarted: classificationList.filter((classification) => classification.transitionSearchAttempted).length,
            transitionSearchesSucceeded: classificationList.filter((classification) => classification.transitionReachable).length
        }
    };
}
function computeV2FourExitMutationFeatures(state, currentCycle, classification, candidateIndex = 0) {
    if (!classification.usableForSnake || classification.usabilityMode === 'unusable') {
        return null;
    }
    const head = state.snake.segments[0] ?? null;
    const currentLockedCyclePathLen = head && state.appleNodeId
        ? (0, hamiltonian_certificate_js_1.distanceForwardOnCycle)(head, state.appleNodeId, currentCycle)
        : null;
    const cycleFeatures = (0, cycle_scoring_js_1.computeCycleFeatures)(state, currentCycle, classification.candidate.cycle);
    const cycleScore = (0, cycle_scoring_js_1.scoreCycleFeatures)(cycleFeatures);
    const candidatePathLenToApple = classification.usabilityMode === 'immediate-locked' ? cycleFeatures.pathLen : null;
    const transitionPathLength = classification.usabilityMode === 'transition-valid'
        ? classification.transitionPathLength
        : null;
    const candidatePathMetric = classification.usabilityMode === 'immediate-locked'
        ? candidatePathLenToApple
        : transitionPathLength;
    const pathLenImprovement = currentLockedCyclePathLen !== null && candidatePathMetric !== null
        ? currentLockedCyclePathLen - candidatePathMetric
        : null;
    const patchId = patchIdForRect(classification.candidate.rect);
    const features = {
        candidateId: `${patchId}:v2-${candidateIndex}:${shortSignature(classification.candidate.coverSignature)}`,
        patchId,
        usabilityMode: classification.usabilityMode,
        currentLockedCyclePathLen,
        candidatePathLenToApple,
        transitionPathLength,
        pathLenImprovement,
        changedCycleEdges: cycleFeatures.repairDistanceFromOldCycle,
        rectangleArea: classification.candidate.rect.width * classification.candidate.rect.height,
        cycleScore,
        cycleFeatures
    };
    return {
        ...features,
        finalV2MutationScore: scoreV2FourExitMutationCandidate(features)
    };
}
function scoreV2FourExitMutationCandidate(features) {
    const improvement = features.pathLenImprovement ?? -1_000;
    const modeBonus = features.usabilityMode === 'immediate-locked' ? 10 : 0;
    const transitionPenalty = features.transitionPathLength ?? 0;
    const cycleScorePenalty = features.cycleScore === null ? 0 : features.cycleScore * 0.001;
    return (improvement * 1_000 +
        modeBonus -
        transitionPenalty * 5 -
        features.changedCycleEdges * 2 -
        features.rectangleArea -
        cycleScorePenalty);
}
function compareV2FourExitMutationFeaturesForRanking(left, right) {
    const leftImprovement = left.pathLenImprovement ?? Number.NEGATIVE_INFINITY;
    const rightImprovement = right.pathLenImprovement ?? Number.NEGATIVE_INFINITY;
    const leftPositive = leftImprovement > 0;
    const rightPositive = rightImprovement > 0;
    if (leftPositive !== rightPositive) {
        return leftPositive ? -1 : 1;
    }
    if (leftImprovement !== rightImprovement) {
        return rightImprovement - leftImprovement;
    }
    if (left.usabilityMode !== right.usabilityMode) {
        return left.usabilityMode === 'immediate-locked' ? -1 : 1;
    }
    const leftTransitionLength = left.transitionPathLength ?? Number.POSITIVE_INFINITY;
    const rightTransitionLength = right.transitionPathLength ?? Number.POSITIVE_INFINITY;
    if (leftTransitionLength !== rightTransitionLength) {
        return leftTransitionLength - rightTransitionLength;
    }
    if (left.changedCycleEdges !== right.changedCycleEdges) {
        return left.changedCycleEdges - right.changedCycleEdges;
    }
    if (left.rectangleArea !== right.rectangleArea) {
        return left.rectangleArea - right.rectangleArea;
    }
    if (left.finalV2MutationScore !== right.finalV2MutationScore) {
        return right.finalV2MutationScore - left.finalV2MutationScore;
    }
    return left.candidateId.localeCompare(right.candidateId);
}
function buildV2CheapTransitionFeatures(state, currentCycle, candidate) {
    const head = state.snake.segments[0] ?? null;
    const apple = state.appleNodeId;
    if (!head || !apple) {
        return null;
    }
    const currentPathLen = currentCycle.length > 0
        ? (0, hamiltonian_certificate_js_1.distanceForwardOnCycle)(head, apple, currentCycle)
        : null;
    const candidatePathLenIfLocked = (0, hamiltonian_certificate_js_1.distanceForwardOnCycle)(head, apple, candidate.cycle);
    const pathLenImprovementEstimate = currentPathLen !== null && candidatePathLenIfLocked !== null
        ? currentPathLen - candidatePathLenIfLocked
        : null;
    const changedCycleEdges = computeCheapV2ChangedEdges(currentCycle, candidate.cycle);
    const rectangleArea = candidate.rect.width * candidate.rect.height;
    const bodyOrderCompatibilityScore = computeV2BodyOrderCompatibilityScore(state.snake.segments, candidate.cycle);
    const bodyOrderMismatchCount = Math.max(0, state.snake.segments.length - 1 - bodyOrderCompatibilityScore);
    const nextOnCycleHeadOccupied = computeV2NextOnCycleHeadOccupied(state.snake.segments, candidate.cycle);
    const nearLockedCertificate = nextOnCycleHeadOccupied === false &&
        bodyOrderMismatchCount <= Math.min(2, Math.max(0, state.snake.segments.length - 1));
    const arcRelevance = computeV2RectArcRelevance(state, currentCycle, candidate.rect);
    const cheapTransitionScore = (pathLenImprovementEstimate ?? -1_000) * 1_000 +
        bodyOrderCompatibilityScore * 25 -
        bodyOrderMismatchCount * 40 +
        (nearLockedCertificate ? 250 : 0) +
        (nextOnCycleHeadOccupied ? -1_000 : 0) +
        (arcRelevance ?? 0) * 100 -
        changedCycleEdges * 2 -
        rectangleArea;
    return {
        source: 'v2',
        candidatePathLenIfLocked,
        pathLenImprovementEstimate,
        changedCycleEdges,
        rectangleArea,
        arcRelevance,
        bodyOrderCompatibilityScore,
        bodyOrderMismatchCount,
        nextOnCycleHeadOccupied,
        nearLockedCertificate,
        cheapTransitionScore
    };
}
function selectV2TransitionCandidatesForSearch(candidates, options, immediateImprovingExists) {
    if (candidates.length === 0) {
        return [];
    }
    if (immediateImprovingExists) {
        return [];
    }
    const mode = options.transitionPrefilterMode ?? 'none';
    const limit = resolveV2TransitionSearchLimit(options);
    if (mode === 'none' && !Number.isFinite(limit)) {
        return [...candidates];
    }
    const minimumImprovement = options.minCheapImprovementForTransitionSearch ?? Number.NEGATIVE_INFINITY;
    const eligible = candidates.filter((candidate) => (candidate.cheapTransitionFeatures?.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY) >= minimumImprovement);
    if (mode === 'none') {
        return eligible.slice(0, limit);
    }
    return [...eligible]
        .sort((left, right) => compareV2CheapTransitionCandidates(left, right, mode))
        .slice(0, limit);
}
function compareV2CheapTransitionCandidates(left, right, mode) {
    const leftFeatures = left.cheapTransitionFeatures;
    const rightFeatures = right.cheapTransitionFeatures;
    if (!leftFeatures || !rightFeatures) {
        return left.candidate.coverSignature.localeCompare(right.candidate.coverSignature);
    }
    if (mode === 'body-order-compatibility') {
        const compatibilityDifference = rightFeatures.bodyOrderCompatibilityScore - leftFeatures.bodyOrderCompatibilityScore;
        if (compatibilityDifference !== 0) {
            return compatibilityDifference;
        }
        if (leftFeatures.bodyOrderMismatchCount !== rightFeatures.bodyOrderMismatchCount) {
            return leftFeatures.bodyOrderMismatchCount - rightFeatures.bodyOrderMismatchCount;
        }
        if (leftFeatures.nearLockedCertificate !== rightFeatures.nearLockedCertificate) {
            return leftFeatures.nearLockedCertificate ? -1 : 1;
        }
        if (leftFeatures.nextOnCycleHeadOccupied !== rightFeatures.nextOnCycleHeadOccupied) {
            return leftFeatures.nextOnCycleHeadOccupied ? 1 : -1;
        }
    }
    if (mode === 'cheap-score' || mode === 'combined') {
        if (leftFeatures.cheapTransitionScore !== rightFeatures.cheapTransitionScore) {
            return rightFeatures.cheapTransitionScore - leftFeatures.cheapTransitionScore;
        }
    }
    const leftImprovement = leftFeatures.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY;
    const rightImprovement = rightFeatures.pathLenImprovementEstimate ?? Number.NEGATIVE_INFINITY;
    if (leftImprovement !== rightImprovement) {
        return rightImprovement - leftImprovement;
    }
    if (leftFeatures.changedCycleEdges !== rightFeatures.changedCycleEdges) {
        return leftFeatures.changedCycleEdges - rightFeatures.changedCycleEdges;
    }
    if (leftFeatures.rectangleArea !== rightFeatures.rectangleArea) {
        return leftFeatures.rectangleArea - rightFeatures.rectangleArea;
    }
    return left.candidate.coverSignature.localeCompare(right.candidate.coverSignature);
}
function resolveV2TransitionSearchLimit(options) {
    const limits = [
        options.maxTransitionCandidatesPerPlanningEvent,
        options.maxTransitionSearchesPerSource
    ].filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (limits.length === 0) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, Math.floor(Math.min(...limits)));
}
function computeCheapV2ChangedEdges(currentCycle, candidateCycle) {
    if (currentCycle.length === 0 || candidateCycle.length === 0) {
        return 0;
    }
    const currentEdges = buildV2DirectedCycleEdgeSet(currentCycle);
    const candidateEdges = buildV2DirectedCycleEdgeSet(candidateCycle);
    let changed = 0;
    for (const edge of currentEdges) {
        if (!candidateEdges.has(edge)) {
            changed += 1;
        }
    }
    for (const edge of candidateEdges) {
        if (!currentEdges.has(edge)) {
            changed += 1;
        }
    }
    return changed;
}
function buildV2DirectedCycleEdgeSet(cycle) {
    const edges = new Set();
    for (let index = 0; index < cycle.length; index += 1) {
        edges.add(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
    }
    return edges;
}
function computeV2BodyOrderCompatibilityScore(bodySegments, cycle) {
    const cycleIndexByNode = new Map();
    for (let index = 0; index < cycle.length; index += 1) {
        cycleIndexByNode.set(cycle[index], index);
    }
    let matches = 0;
    for (let index = bodySegments.length - 1; index >= 1; index -= 1) {
        const tailwardNode = bodySegments[index];
        const towardHeadNode = bodySegments[index - 1];
        const tailwardIndex = cycleIndexByNode.get(tailwardNode);
        const towardHeadIndex = cycleIndexByNode.get(towardHeadNode);
        if (tailwardIndex === undefined || towardHeadIndex === undefined) {
            continue;
        }
        if ((tailwardIndex + 1) % cycle.length === towardHeadIndex) {
            matches += 1;
        }
    }
    return matches;
}
function computeV2NextOnCycleHeadOccupied(bodySegments, cycle) {
    const head = bodySegments[0] ?? null;
    if (!head || cycle.length === 0) {
        return null;
    }
    const headIndex = cycle.indexOf(head);
    if (headIndex === -1) {
        return null;
    }
    const nextNode = cycle[(headIndex + 1) % cycle.length] ?? null;
    return nextNode ? bodySegments.includes(nextNode) : null;
}
function computeV2RectArcRelevance(state, currentCycle, rect) {
    const head = state.snake.segments[0] ?? null;
    const apple = state.appleNodeId;
    if (!head || !apple || currentCycle.length === 0) {
        return null;
    }
    const arcNodeIds = collectV2ForwardArcNodeIds(head, apple, currentCycle);
    if (arcNodeIds.length === 0) {
        return null;
    }
    let insideCount = 0;
    for (const nodeId of arcNodeIds) {
        const node = state.map.graph.nodes.find((graphNode) => graphNode.id === nodeId);
        if (node &&
            node.x >= rect.x &&
            node.x < rect.x + rect.width &&
            node.y >= rect.y &&
            node.y < rect.y + rect.height) {
            insideCount += 1;
        }
    }
    return insideCount / arcNodeIds.length;
}
function collectV2ForwardArcNodeIds(head, apple, cycle) {
    const headIndex = cycle.indexOf(head);
    const appleIndex = cycle.indexOf(apple);
    if (headIndex === -1 || appleIndex === -1) {
        return [];
    }
    const nodeIds = [];
    let index = headIndex;
    for (let steps = 0; steps < cycle.length; steps += 1) {
        const nodeId = cycle[index];
        nodeIds.push(nodeId);
        if (nodeId === apple) {
            break;
        }
        index = (index + 1) % cycle.length;
    }
    return nodeIds;
}
function resolveSamePairingPathCoverOptions(options) {
    return {
        ...DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS,
        maxPatchArea4Exit: options.maxPatchArea4Exit ?? DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS.maxPatchArea4Exit,
        maxCoversPerPatch: options.maxCoversPerPatch ?? DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS.maxCoversPerPatch,
        maxSolverExpansionsPerPatch: options.maxSolverExpansionsPerPatch ?? DEFAULT_SAME_PAIRING_4_EXIT_PATH_COVER_OPTIONS.maxSolverExpansionsPerPatch
    };
}
function createEmptyPathCoverDiagnostics(rect, terminalPairs) {
    return {
        rect,
        terminalPairs,
        attempted: false,
        solverExpansions: 0,
        budgetExhausted: false,
        coversFound: 0,
        noOpCoversSkipped: 0,
        duplicateCoversSkipped: 0,
        rejectionReason: 'not-valid-four-exit-decomposition',
        covers: []
    };
}
function createEmptyPathCoverAggregateDiagnostics(validFourExitDecompositions) {
    return {
        validFourExitDecompositions,
        patchesAttempted: 0,
        pathCoversFound: 0,
        patchesWithAlternativeCovers: 0,
        budgetExhaustedPatches: 0,
        noOpCoversSkipped: 0,
        duplicateCoversSkipped: 0,
        topFailureReasons: []
    };
}
function createEmptyV2FourExitSpliceAggregateDiagnostics(validFourExitDecompositions) {
    return {
        validFourExitDecompositions,
        alternativeCoversConsidered: 0,
        rawCandidatesGenerated: 0,
        degreeInvalidCandidates: 0,
        subtourCandidates: 0,
        nodeSetMismatchCandidates: 0,
        graphValidCandidates: 0,
        graphInvalidCandidates: 0,
        duplicateCandidatesSkipped: 0,
        topRejectionReasons: []
    };
}
function createV2FourExitSpliceCandidateDiagnostics(patch, coverSignature, edgeSetDegreeValid, reconstructedSingleCycle, nodeSetMatchesOldCycle) {
    return {
        rect: patch.rect,
        terminalPairs: patch.fourExitDecomposition?.terminalPairs ?? [],
        coverSignature,
        edgeSetDegreeValid,
        reconstructedSingleCycle,
        nodeSetMatchesOldCycle,
        graphValid: false,
        duplicateCandidate: false,
        rejectionReason: 'graph-invalid'
    };
}
function spliceMultiTerminalSamePairingCoverByEdgesDetailed(graph, oldCycle, patch, cover) {
    if (!validateSamePairingPathCover(patch, graph, cover)) {
        return {
            candidateCycle: null,
            edgeSetDegreeValid: false,
            reconstructedSingleCycle: false,
            nodeSetMatchesOldCycle: false
        };
    }
    const rectNodeSet = buildRectNodeSet(graph, patch.rect);
    const oldEdges = cycleUndirectedEdges(oldCycle);
    const edgeByKey = new Map(oldEdges.map((edge) => [undirectedEdgeKey(edge.a, edge.b), edge]));
    for (const internalEdge of (0, two_terminal_patch_mutation_js_1.extractInsideCycleEdges)(oldCycle, rectNodeSet)) {
        edgeByKey.delete(undirectedEdgeKey(internalEdge.from, internalEdge.to));
    }
    for (const replacementEdge of pathCoverUndirectedEdges(cover)) {
        edgeByKey.set(undirectedEdgeKey(replacementEdge.a, replacementEdge.b), replacementEdge);
    }
    const replacementEdges = [...edgeByKey.values()];
    const expectedNodes = new Set(oldCycle);
    const edgeSetDegreeValid = hasDegreeTwoForExactlyNodes(replacementEdges, expectedNodes);
    if (!edgeSetDegreeValid) {
        return {
            candidateCycle: null,
            edgeSetDegreeValid,
            reconstructedSingleCycle: false,
            nodeSetMatchesOldCycle: false
        };
    }
    const candidateCycle = reconstructCycleFromDegreeTwoEdges(replacementEdges, oldCycle[0]);
    const reconstructedSingleCycle = candidateCycle !== null;
    const nodeSetMatchesOldCycle = candidateCycle !== null && sameNodeSet(candidateCycle, oldCycle);
    return {
        candidateCycle: nodeSetMatchesOldCycle ? candidateCycle : null,
        edgeSetDegreeValid,
        reconstructedSingleCycle,
        nodeSetMatchesOldCycle
    };
}
function cycleUndirectedEdges(cycle) {
    const edges = [];
    for (let index = 0; index < cycle.length; index += 1) {
        edges.push(normalizeUndirectedEdge(cycle[index], cycle[(index + 1) % cycle.length]));
    }
    return edges;
}
function pathCoverUndirectedEdges(cover) {
    const edges = [];
    for (const path of cover.paths) {
        for (let index = 0; index < path.length - 1; index += 1) {
            edges.push(normalizeUndirectedEdge(path[index], path[index + 1]));
        }
    }
    return edges;
}
function normalizeUndirectedEdge(a, b) {
    return a <= b ? { a, b } : { a: b, b: a };
}
function undirectedEdgeKey(a, b) {
    const edge = normalizeUndirectedEdge(a, b);
    return `${edge.a}--${edge.b}`;
}
function buildUndirectedAdjacency(edges) {
    const adjacency = new Map();
    for (const edge of edges) {
        if (edge.a === edge.b) {
            adjacency.set(edge.a, adjacency.get(edge.a) ?? new Set());
            continue;
        }
        if (!adjacency.has(edge.a)) {
            adjacency.set(edge.a, new Set());
        }
        if (!adjacency.has(edge.b)) {
            adjacency.set(edge.b, new Set());
        }
        adjacency.get(edge.a)?.add(edge.b);
        adjacency.get(edge.b)?.add(edge.a);
    }
    return adjacency;
}
function hasDegreeTwoForExactlyNodes(edges, expectedNodes) {
    const adjacency = buildUndirectedAdjacency(edges);
    if (adjacency.size !== expectedNodes.size) {
        return false;
    }
    for (const nodeId of expectedNodes) {
        if ((adjacency.get(nodeId)?.size ?? 0) !== 2) {
            return false;
        }
    }
    return [...adjacency.keys()].every((nodeId) => expectedNodes.has(nodeId));
}
function cycleUndirectedEdgeSignature(cycle) {
    return cycleUndirectedEdges(cycle)
        .map((edge) => undirectedEdgeKey(edge.a, edge.b))
        .sort()
        .join('|');
}
function sameNodeSet(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    if (leftSet.size !== left.length || rightSet.size !== right.length || leftSet.size !== rightSet.size) {
        return false;
    }
    return [...leftSet].every((nodeId) => rightSet.has(nodeId));
}
function rectKey(rect) {
    return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}
function recordV2FourExitSpliceDiagnostic(diagnostics, reasonCounts, diagnostic) {
    diagnostics.push(diagnostic);
    reasonCounts.set(diagnostic.rejectionReason, (reasonCounts.get(diagnostic.rejectionReason) ?? 0) + 1);
}
function createV2SnakeClassification(overrides) {
    return {
        graphValid: false,
        lockedCertificateValid: false,
        appleForwardValid: false,
        immediateLocked: false,
        transitionReachable: false,
        transitionPathLength: null,
        transitionPlanSummary: null,
        cheapTransitionFeatures: null,
        transitionSearchAttempted: false,
        transitionSkippedByPrefilter: false,
        usableForSnake: false,
        usabilityMode: 'unusable',
        ...overrides
    };
}
function summarizeV2FourExitSnakeDiagnostics(classifications, rankedCandidates, hasApple) {
    const aggregate = createEmptyV2FourExitSnakeAggregateDiagnostics();
    const reasonCounts = new Map();
    const improvingValues = [];
    for (const classification of classifications) {
        incrementV2SnakeReason(reasonCounts, classification.reason);
        if (classification.graphValid) {
            aggregate.graphValidCandidates += 1;
        }
        if (classification.immediateLocked) {
            aggregate.immediateLockedCandidates += 1;
        }
        if (classification.graphValid && !(classification.immediateLocked && classification.appleForwardValid) && hasApple) {
            aggregate.nonImmediateCandidates += 1;
        }
        if (classification.transitionSearchAttempted) {
            aggregate.transitionCandidatesAfterPrefilter += 1;
            aggregate.transitionSearchesStarted += 1;
        }
        if (classification.transitionSkippedByPrefilter) {
            aggregate.transitionCandidatesSkippedByPrefilter += 1;
        }
        if (classification.transitionReachable) {
            aggregate.transitionReachableCandidates += 1;
            aggregate.transitionSearchesSucceeded += 1;
        }
        if (classification.usableForSnake) {
            aggregate.snakeUsableCandidates += 1;
        }
        if (classification.graphValid && !classification.lockedCertificateValid) {
            aggregate.rejectedByLockedCertificate += 1;
        }
        if (classification.graphValid && classification.lockedCertificateValid && !classification.appleForwardValid && hasApple) {
            aggregate.rejectedByAppleForward += 1;
        }
        if (classification.graphValid &&
            !classification.usableForSnake &&
            hasApple &&
            classification.reason !== 'immediate-locked-apple-forward-failed') {
            aggregate.rejectedByTransitionSearch += 1;
        }
    }
    for (const ranked of rankedCandidates) {
        const improvement = ranked.features.pathLenImprovement;
        if (improvement !== null && improvement > 0) {
            aggregate.improvingCandidates += 1;
            improvingValues.push(improvement);
        }
    }
    aggregate.bestCandidate = rankedCandidates[0]?.features ?? null;
    aggregate.bestImprovement = improvingValues.length > 0 ? Math.max(...improvingValues) : null;
    aggregate.averageImprovement = improvingValues.length > 0
        ? improvingValues.reduce((total, value) => total + value, 0) / improvingValues.length
        : null;
    aggregate.topRejectionReasons = topV2SnakeReasons(reasonCounts);
    return aggregate;
}
function createEmptyV2FourExitSnakeAggregateDiagnostics() {
    return {
        graphValidCandidates: 0,
        immediateLockedCandidates: 0,
        nonImmediateCandidates: 0,
        transitionCandidatesAfterPrefilter: 0,
        transitionCandidatesSkippedByPrefilter: 0,
        transitionSearchesStarted: 0,
        transitionSearchesSucceeded: 0,
        transitionReachableCandidates: 0,
        snakeUsableCandidates: 0,
        improvingCandidates: 0,
        bestImprovement: null,
        averageImprovement: null,
        bestCandidate: null,
        rejectedByLockedCertificate: 0,
        rejectedByAppleForward: 0,
        rejectedByTransitionSearch: 0,
        prefilterRejectedButWouldHaveSucceeded: null,
        topRejectionReasons: []
    };
}
function compareRankedV2FourExitSnakeCandidates(left, right) {
    return compareV2FourExitMutationFeaturesForRanking(left.features, right.features);
}
function v2CandidateIdForTransition(coverSignature) {
    return `v2-four-exit-${shortSignature(coverSignature)}`;
}
function patchIdForRect(rect) {
    return `rect-${rect.x}-${rect.y}-${rect.width}x${rect.height}`;
}
function shortSignature(signature) {
    let hash = 0;
    for (let index = 0; index < signature.length; index += 1) {
        hash = ((hash * 31) + signature.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
}
function buildRectangleGridAdjacency(graph, rect) {
    const nodeByCoord = new Map(graph.nodes.map((node) => [`${node.x},${node.y}`, node]));
    const adjacency = new Map();
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
            const node = nodeByCoord.get(`${x},${y}`);
            if (!node) {
                continue;
            }
            const neighbors = new Set();
            const neighborCoords = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
            for (const [nx, ny] of neighborCoords) {
                const neighbor = nodeByCoord.get(`${nx},${ny}`);
                if (neighbor &&
                    nx >= rect.x &&
                    nx < rect.x + rect.width &&
                    ny >= rect.y &&
                    ny < rect.y + rect.height) {
                    neighbors.add(neighbor.id);
                }
            }
            adjacency.set(node.id, neighbors);
        }
    }
    return adjacency;
}
function orderedGridNeighbors(current, adjacency, visited, end, requiredFinalSize) {
    return [...(adjacency.get(current) ?? [])]
        .filter((nodeId) => !visited.has(nodeId))
        .filter((nodeId) => requiredFinalSize === undefined || nodeId !== end || visited.size + 1 === requiredFinalSize)
        .sort((left, right) => {
        const leftDegree = onwardDegree(left, adjacency, visited);
        const rightDegree = onwardDegree(right, adjacency, visited);
        return leftDegree - rightDegree || left.localeCompare(right);
    });
}
function onwardDegree(nodeId, adjacency, visited) {
    return [...(adjacency.get(nodeId) ?? [])].filter((neighbor) => !visited.has(neighbor)).length;
}
function findHamiltonPathsThroughRemaining(start, end, remaining, adjacency, context, maxExpansions, maxPaths) {
    if (maxPaths <= 0 ||
        !remaining.has(start) ||
        !remaining.has(end) ||
        !isConnectedWithinAllowed(start, end, remaining, adjacency)) {
        return [];
    }
    const paths = [];
    const visited = new Set([start]);
    const path = [start];
    const dfs = (current) => {
        if (paths.length >= maxPaths || context.budgetExhausted) {
            return;
        }
        if (!consumeExpansion(context, maxExpansions)) {
            return;
        }
        if (current === end) {
            if (visited.size === remaining.size) {
                paths.push([...path]);
            }
            return;
        }
        for (const next of orderedGridNeighbors(current, adjacency, visited, end, remaining.size)) {
            if (!remaining.has(next)) {
                continue;
            }
            visited.add(next);
            path.push(next);
            const unvisited = new Set([...remaining].filter((nodeId) => !visited.has(nodeId)));
            const shouldContinue = next === end ||
                unvisited.size === 0 ||
                canStillReachEndFrom(next, end, unvisited, adjacency);
            if (shouldContinue) {
                dfs(next);
            }
            path.pop();
            visited.delete(next);
            if (paths.length >= maxPaths || context.budgetExhausted) {
                break;
            }
        }
    };
    dfs(start);
    return paths;
}
function canStillConnectSecondPair(remaining, pair, adjacency) {
    return remaining.has(pair.terminalA) &&
        remaining.has(pair.terminalB) &&
        isConnectedWithinAllowed(pair.terminalA, pair.terminalB, remaining, adjacency);
}
function canStillReachEndFrom(current, end, unvisited, adjacency) {
    const allowed = new Set(unvisited);
    allowed.add(current);
    return allowed.has(end) && isConnectedWithinAllowed(current, end, allowed, adjacency);
}
function isConnectedWithinAllowed(start, end, allowed, adjacency) {
    if (!allowed.has(start) || !allowed.has(end)) {
        return false;
    }
    const stack = [start];
    const seen = new Set();
    while (stack.length > 0) {
        const nodeId = stack.pop();
        if (seen.has(nodeId)) {
            continue;
        }
        seen.add(nodeId);
        for (const neighbor of adjacency.get(nodeId) ?? []) {
            if (allowed.has(neighbor) && !seen.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }
    return [...allowed].every((nodeId) => seen.has(nodeId));
}
function consumeExpansion(context, maxExpansions) {
    if (context.expansions >= maxExpansions) {
        context.budgetExhausted = true;
        return false;
    }
    context.expansions += 1;
    return true;
}
function areAdjacentInGrid(from, to, adjacency) {
    return adjacency.get(from)?.has(to) ?? false;
}
function originalCoverSignature(patch) {
    const paths = patch.fourExitDecomposition?.terminalPairs.map((pair) => pair.originalPath) ?? [];
    return edgeSignatureForPaths(paths);
}
function edgeSignatureForPaths(paths) {
    const edges = [];
    for (const path of paths) {
        for (let index = 0; index < path.length - 1; index += 1) {
            edges.push([path[index], path[index + 1]].sort().join('--'));
        }
    }
    return edges.sort().join('|');
}
function createBasePatchDiagnostics(rect, vertexCount, fullRectangle) {
    return {
        rect,
        vertexCount,
        fullRectangle,
        crossingCount: 0,
        terminals: [],
        repeatedTerminalCount: 0,
        exitClass: 'other',
        fourExitDecomposition: null
    };
}
function classifyExitCount(crossingCount) {
    switch (crossingCount) {
        case 2:
            return 'two';
        case 4:
            return 'four';
        case 6:
            return 'six';
        case 8:
            return 'eight';
        default:
            return 'other';
    }
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
function calculateInternalDegrees(rectNodeSet, internalEdges) {
    const degrees = zeroDegreeMap(rectNodeSet);
    for (const edge of internalEdges) {
        degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
        degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    }
    return degrees;
}
function calculateCutDegrees(rectNodeSet, crossingEdges) {
    const degrees = zeroDegreeMap(rectNodeSet);
    for (const crossing of crossingEdges) {
        degrees.set(crossing.insideNode, (degrees.get(crossing.insideNode) ?? 0) + 1);
    }
    return degrees;
}
function zeroDegreeMap(rectNodeSet) {
    return new Map([...rectNodeSet].sort().map((nodeId) => [nodeId, 0]));
}
function hasValidCycleDegreeAccounting(rectNodeSet, internalDegree, cutDegree) {
    return [...rectNodeSet].every((nodeId) => (internalDegree.get(nodeId) ?? 0) + (cutDegree.get(nodeId) ?? 0) === 2);
}
function hasExpectedTerminalInternalDegrees(terminalSet, internalDegree) {
    return [...terminalSet].every((nodeId) => (internalDegree.get(nodeId) ?? 0) === 1);
}
function hasExpectedNonterminalInternalDegrees(rectNodeSet, terminalSet, internalDegree) {
    return [...rectNodeSet]
        .filter((nodeId) => !terminalSet.has(nodeId))
        .every((nodeId) => (internalDegree.get(nodeId) ?? 0) === 2);
}
function buildInternalAdjacency(rectNodeSet, internalEdges) {
    const adjacency = new Map([...rectNodeSet].sort().map((nodeId) => [nodeId, new Set()]));
    for (const edge of internalEdges) {
        adjacency.get(edge.from)?.add(edge.to);
        adjacency.get(edge.to)?.add(edge.from);
    }
    return adjacency;
}
function connectedComponents(rectNodeSet, adjacency, terminalSet) {
    const seen = new Set();
    const components = [];
    for (const start of [...rectNodeSet].sort()) {
        if (seen.has(start)) {
            continue;
        }
        const stack = [start];
        const nodes = [];
        let degreeSum = 0;
        while (stack.length > 0) {
            const nodeId = stack.pop();
            if (seen.has(nodeId)) {
                continue;
            }
            seen.add(nodeId);
            nodes.push(nodeId);
            const neighbors = [...(adjacency.get(nodeId) ?? [])].sort();
            degreeSum += neighbors.length;
            for (const neighbor of neighbors) {
                if (!seen.has(neighbor)) {
                    stack.push(neighbor);
                }
            }
        }
        nodes.sort();
        components.push({
            nodes,
            edgeCount: degreeSum / 2,
            terminalNodes: nodes.filter((nodeId) => terminalSet.has(nodeId)).sort()
        });
    }
    return components.sort((left, right) => left.nodes[0].localeCompare(right.nodes[0]));
}
function isSimplePathComponent(component, adjacency) {
    if (component.nodes.length < 2 || component.edgeCount !== component.nodes.length - 1) {
        return false;
    }
    const endpointCount = component.nodes.filter((nodeId) => (adjacency.get(nodeId)?.size ?? 0) === 1).length;
    const hasOnlyPathDegrees = component.nodes.every((nodeId) => {
        const degree = adjacency.get(nodeId)?.size ?? 0;
        return degree === 1 || degree === 2;
    });
    return endpointCount === 2 && hasOnlyPathDegrees;
}
function terminalPairFromComponent(component, adjacency) {
    const [terminalA, terminalB] = component.terminalNodes;
    if (!terminalA || !terminalB) {
        return null;
    }
    const orderedTerminals = [terminalA, terminalB].sort();
    const originalPath = walkPath(orderedTerminals[0], orderedTerminals[1], adjacency);
    if (!originalPath) {
        return null;
    }
    return {
        terminalA: orderedTerminals[0],
        terminalB: orderedTerminals[1],
        originalPath
    };
}
function walkPath(start, end, adjacency) {
    const path = [start];
    const seen = new Set([start]);
    let previous = null;
    let current = start;
    while (current !== end) {
        const nextCandidates = [...(adjacency.get(current) ?? [])]
            .filter((nodeId) => nodeId !== previous)
            .sort();
        const next = nextCandidates.find((nodeId) => !seen.has(nodeId) || nodeId === end);
        if (!next) {
            return null;
        }
        previous = current;
        current = next;
        if (seen.has(current) && current !== end) {
            return null;
        }
        seen.add(current);
        path.push(current);
    }
    return path;
}
function compareTerminalPairs(left, right) {
    return left.terminalA.localeCompare(right.terminalA) || left.terminalB.localeCompare(right.terminalB);
}
function degreeRecord(degrees) {
    return Object.fromEntries([...degrees.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
function hasPlausibleSixExitDegreePattern(graph, cycle, rect) {
    const rectNodeSet = buildRectNodeSet(graph, rect);
    const crossings = (0, two_terminal_patch_mutation_js_1.getCycleCutCrossings)(cycle, rectNodeSet);
    const internalDegree = calculateInternalDegrees(rectNodeSet, (0, two_terminal_patch_mutation_js_1.extractInsideCycleEdges)(cycle, rectNodeSet));
    const cutDegree = calculateCutDegrees(rectNodeSet, crossings);
    const terminals = new Set(crossings.map((crossing) => crossing.insideNode));
    return crossings.length === 6 &&
        terminals.size === 6 &&
        hasValidCycleDegreeAccounting(rectNodeSet, internalDegree, cutDegree) &&
        hasExpectedTerminalInternalDegrees(terminals, internalDegree);
}
function applyRectangleScanBudget(rectangles, maxPatchRectsScanned) {
    if (maxPatchRectsScanned === undefined || maxPatchRectsScanned >= rectangles.length) {
        return rectangles;
    }
    return rectangles.slice(0, Math.max(0, maxPatchRectsScanned));
}
function createEmptyAggregateDiagnostics() {
    return {
        rectanglesScanned: 0,
        fullRectangles: 0,
        twoExitRectangles: 0,
        fourExitRectangles: 0,
        sixExitRectangles: 0,
        eightExitRectangles: 0,
        otherExitRectangles: 0,
        repeatedTerminalRectangles: 0,
        fourExitDecompositionAttempts: 0,
        validFourExitDecompositions: 0,
        invalidDegreeAccounting: 0,
        invalidTerminalDegree: 0,
        invalidNonterminalDegree: 0,
        invalidComponentCount: 0,
        invalidComponentPath: 0,
        componentsMissingVertices: 0,
        sixExitPlausibleDegreePattern: 0,
        eightExitCountOnly: 0,
        topRejectionReasons: []
    };
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
function incrementPathCoverReason(counts, reason) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
}
function incrementV2SnakeReason(counts, reason) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
}
function topPathCoverReasons(counts) {
    return [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
        .slice(0, 8);
}
function topV2FourExitSpliceReasons(counts) {
    return [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
        .slice(0, 8);
}
function topV2SnakeReasons(counts) {
    return [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
        .slice(0, 8);
}
