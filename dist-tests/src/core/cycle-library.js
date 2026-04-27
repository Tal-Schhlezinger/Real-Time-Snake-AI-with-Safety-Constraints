"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBaseCycleLibraryEntryId = createBaseCycleLibraryEntryId;
exports.cycleEdgeSignature = cycleEdgeSignature;
exports.cycleDistance = cycleDistance;
exports.cycleOrderDistance = cycleOrderDistance;
exports.isCycleLibrarySupportedMap = isCycleLibrarySupportedMap;
exports.generateDiverseHamiltonianCycles = generateDiverseHamiltonianCycles;
const coords_js_1 = require("./coords.js");
const hamiltonian_cycle_solver_js_1 = require("./hamiltonian-cycle-solver.js");
const map_validator_js_1 = require("./map-validator.js");
const rectangular_cycle_js_1 = require("./rectangular-cycle.js");
const DEFAULT_CYCLE_LIBRARY_OPTIONS = {
    maxCycles: 10,
    maxAttempts: 64,
    minDiversity: 0.2,
    attemptTimeLimitMs: 500
};
function createEmptyCycleLibraryDiagnostics() {
    return {
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
    };
}
function createBaseCycleLibraryEntryId(mapId) {
    return `${mapId}:base`;
}
function createCycleEntryId(mapId, source, suffix) {
    return `${mapId}:${source}:${suffix}`;
}
function cycleEdgeSignature(cycle) {
    const edges = [];
    for (let index = 0; index < cycle.length; index += 1) {
        edges.push(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
    }
    edges.sort();
    return edges.join('|');
}
function buildCycleEdgeSet(cycle) {
    const edges = new Set();
    for (let index = 0; index < cycle.length; index += 1) {
        edges.add(`${cycle[index]}->${cycle[(index + 1) % cycle.length]}`);
    }
    return edges;
}
function cycleDistance(left, right) {
    if (left.length === 0 || left.length !== right.length) {
        return 1;
    }
    const leftEdges = buildCycleEdgeSet(left);
    const rightEdges = buildCycleEdgeSet(right);
    let symmetricDifference = 0;
    for (const edge of leftEdges) {
        if (!rightEdges.has(edge)) {
            symmetricDifference += 1;
        }
    }
    for (const edge of rightEdges) {
        if (!leftEdges.has(edge)) {
            symmetricDifference += 1;
        }
    }
    return symmetricDifference / (2 * left.length);
}
function rotateCycleToAnchor(cycle, anchor) {
    const anchorIndex = cycle.indexOf(anchor);
    if (anchorIndex <= 0) {
        return [...cycle];
    }
    return [...cycle.slice(anchorIndex), ...cycle.slice(0, anchorIndex)];
}
function cycleOrderDistance(left, right) {
    if (left.length === 0 || left.length !== right.length) {
        return 1;
    }
    const rightNodeSet = new Set(right);
    if (left.some((nodeId) => !rightNodeSet.has(nodeId))) {
        return 1;
    }
    const anchor = [...left].sort()[0];
    if (!anchor) {
        return 1;
    }
    const rotatedLeft = rotateCycleToAnchor(left, anchor);
    const rotatedRight = rotateCycleToAnchor(right, anchor);
    const rightIndexByNode = new Map();
    for (let index = 0; index < rotatedRight.length; index += 1) {
        rightIndexByNode.set(rotatedRight[index], index);
    }
    const normalizer = Math.max(1, Math.floor(left.length / 2));
    let total = 0;
    for (let index = 0; index < rotatedLeft.length; index += 1) {
        const rightIndex = rightIndexByNode.get(rotatedLeft[index]);
        if (rightIndex === undefined) {
            return 1;
        }
        const delta = Math.abs(index - rightIndex);
        total += Math.min(delta, left.length - delta) / normalizer;
    }
    return total / left.length;
}
function isCycleLibrarySupportedMap(map) {
    return (map.walls.length === 0 &&
        map.portals.length === 0 &&
        map.graph.nodes.length === map.width * map.height &&
        (map.width % 2 === 0 || map.height % 2 === 0));
}
function deterministicAttemptSeed(mapId, attempt) {
    let hash = 2166136261 ^ attempt;
    for (let index = 0; index < mapId.length; index += 1) {
        hash ^= mapId.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function buildStartNodeOrder(map) {
    if (map.hamiltonianCycle.length === 0) {
        return [];
    }
    const oddStride = map.hamiltonianCycle.length > 2 ? map.hamiltonianCycle.length - 1 : 1;
    const ordered = [];
    const seen = new Set();
    for (let offset = 0; offset < map.hamiltonianCycle.length; offset += 1) {
        const nodeId = map.hamiltonianCycle[(offset * oddStride) % map.hamiltonianCycle.length];
        if (seen.has(nodeId)) {
            continue;
        }
        seen.add(nodeId);
        ordered.push(nodeId);
    }
    return ordered;
}
function reverseCycle(cycle) {
    return [cycle[0], ...cycle.slice(1).reverse()];
}
function minimumEdgeDistanceToAccepted(acceptedEntries, cycle) {
    if (acceptedEntries.length === 0) {
        return null;
    }
    return Math.min(...acceptedEntries.map((entry) => cycleDistance(entry.cycle, cycle)));
}
function minimumOrderDistanceToAccepted(acceptedEntries, cycle) {
    if (acceptedEntries.length === 0) {
        return null;
    }
    return Math.min(...acceptedEntries.map((entry) => cycleOrderDistance(entry.cycle, cycle)));
}
function appendAcceptedEntry(acceptedEntries, cycle, id, source, archetypeName) {
    acceptedEntries.push({
        id,
        cycle: [...cycle],
        source,
        archetypeName,
        minDistanceToAccepted: minimumEdgeDistanceToAccepted(acceptedEntries, cycle) ?? 0,
        minOrderDistanceToAccepted: minimumOrderDistanceToAccepted(acceptedEntries, cycle) ?? 0
    });
}
function recordAttemptDiagnostic(diagnostics, attempt) {
    diagnostics.entryAttempts.push({
        ...attempt,
        edgeDiversityFromAccepted: attempt.edgeDiversityFromAccepted ?? null,
        orderDiversityFromAccepted: attempt.orderDiversityFromAccepted ?? null
    });
}
function tryAcceptCycle(acceptedEntries, seenSignatures, candidateCycle, minDiversity, id, source, archetypeName, diagnostics) {
    const signature = cycleEdgeSignature(candidateCycle);
    const edgeDistance = minimumEdgeDistanceToAccepted(acceptedEntries, candidateCycle);
    const orderDistance = minimumOrderDistanceToAccepted(acceptedEntries, candidateCycle);
    if (seenSignatures.has(signature)) {
        diagnostics.duplicateRejections += 1;
        recordAttemptDiagnostic(diagnostics, {
            id,
            source,
            archetypeName,
            accepted: false,
            rejectionReason: 'duplicate',
            edgeDiversityFromAccepted: edgeDistance,
            orderDiversityFromAccepted: orderDistance
        });
        return false;
    }
    if (edgeDistance !== null && edgeDistance < minDiversity) {
        diagnostics.lowDiversityRejections += 1;
        recordAttemptDiagnostic(diagnostics, {
            id,
            source,
            archetypeName,
            accepted: false,
            rejectionReason: 'low-diversity',
            edgeDiversityFromAccepted: edgeDistance,
            orderDiversityFromAccepted: orderDistance
        });
        return false;
    }
    seenSignatures.add(signature);
    appendAcceptedEntry(acceptedEntries, candidateCycle, id, source, archetypeName);
    if (source !== 'base') {
        diagnostics.generatedCycles += 1;
    }
    recordAttemptDiagnostic(diagnostics, {
        id,
        source,
        archetypeName,
        accepted: true,
        rejectionReason: 'accepted',
        edgeDiversityFromAccepted: edgeDistance,
        orderDiversityFromAccepted: orderDistance
    });
    return true;
}
function pairwiseDistances(entries, metric) {
    const distances = [];
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
            distances.push(metric(entries[leftIndex].cycle, entries[rightIndex].cycle));
        }
    }
    distances.sort((left, right) => left - right);
    return distances;
}
function summarizeDistances(distances) {
    if (distances.length === 0) {
        return {
            min: null,
            max: null,
            average: null
        };
    }
    const total = distances.reduce((sum, distance) => sum + distance, 0);
    return {
        min: distances[0],
        max: distances[distances.length - 1],
        average: total / distances.length
    };
}
function finalizeCycleLibraryDiagnostics(diagnostics, acceptedEntries) {
    const diversityDistances = pairwiseDistances(acceptedEntries, cycleDistance);
    const orderDiversityDistances = pairwiseDistances(acceptedEntries, cycleOrderDistance);
    const edgeSummary = summarizeDistances(diversityDistances);
    const orderSummary = summarizeDistances(orderDiversityDistances);
    return {
        ...diagnostics,
        diversityDistances,
        minDiversityDistance: edgeSummary.min,
        maxDiversityDistance: edgeSummary.max,
        averageDiversityDistance: edgeSummary.average,
        orderDiversityDistances,
        minOrderDiversityDistance: orderSummary.min,
        maxOrderDiversityDistance: orderSummary.max,
        averageOrderDiversityDistance: orderSummary.average
    };
}
function mirrorX(coord, width) {
    return { x: width - 1 - coord.x, y: coord.y };
}
function mirrorY(coord, _width, height) {
    return { x: coord.x, y: height - 1 - coord.y };
}
function ringIndex(coord, width, height) {
    return Math.min(coord.x, coord.y, width - 1 - coord.x, height - 1 - coord.y);
}
function ringClockwiseRank(coord, width, height) {
    const ring = ringIndex(coord, width, height);
    const left = ring;
    const top = ring;
    const right = width - 1 - ring;
    const bottom = height - 1 - ring;
    if (coord.y === top) {
        return coord.x - left;
    }
    const topSpan = right - left;
    if (coord.x === right) {
        return topSpan + (coord.y - top);
    }
    const rightSpan = bottom - top;
    if (coord.y === bottom) {
        return topSpan + rightSpan + (right - coord.x);
    }
    const bottomSpan = right - left;
    return topSpan + rightSpan + bottomSpan + (bottom - coord.y);
}
function horizontalBandRank(coord, width) {
    const band = Math.floor(coord.y / 2);
    const withinBand = coord.y % 2;
    if (withinBand === 0) {
        return band * width * 2 + coord.x;
    }
    return band * width * 2 + width + (width - 1 - coord.x);
}
function verticalBandRank(coord, height) {
    const band = Math.floor(coord.x / 2);
    const withinBand = coord.x % 2;
    if (withinBand === 0) {
        return band * height * 2 + coord.y;
    }
    return band * height * 2 + height + (height - 1 - coord.y);
}
function buildRankNeighborBias(rank) {
    return (_current, next) => rank((0, coords_js_1.coordFromNodeId)(next));
}
function createArchetypeAttempts(map, resolved, startNodeOrder) {
    const attempts = [];
    const addArchetypeAttempt = (suffix, archetypeName, build) => {
        attempts.push({
            id: createCycleEntryId(map.id, 'archetype', suffix),
            source: 'archetype',
            archetypeName,
            build
        });
    };
    const addSolverAttempt = (suffix, archetypeName, build) => {
        attempts.push({
            id: createCycleEntryId(map.id, 'solver', suffix),
            source: 'solver',
            archetypeName,
            build
        });
    };
    const horizontal = (0, rectangular_cycle_js_1.generateHorizontalSerpentineCycle)(map.width, map.height);
    const vertical = (0, rectangular_cycle_js_1.generateVerticalSerpentineCycle)(map.width, map.height);
    addArchetypeAttempt('horizontal-serpentine', 'horizontal-serpentine', () => horizontal ? [...horizontal] : null);
    addArchetypeAttempt('horizontal-serpentine-reverse', 'horizontal-serpentine-reverse', () => horizontal ? reverseCycle(horizontal) : null);
    addArchetypeAttempt('horizontal-serpentine-mirror-x', 'horizontal-serpentine-mirror-x', () => {
        return horizontal ? (0, rectangular_cycle_js_1.transformRectangleCycle)(horizontal, map.width, map.height, (coord, width) => mirrorX(coord, width)) : null;
    });
    addArchetypeAttempt('horizontal-serpentine-mirror-y', 'horizontal-serpentine-mirror-y', () => {
        return horizontal ? (0, rectangular_cycle_js_1.transformRectangleCycle)(horizontal, map.width, map.height, mirrorY) : null;
    });
    addArchetypeAttempt('vertical-serpentine', 'vertical-serpentine', () => vertical ? [...vertical] : null);
    addArchetypeAttempt('vertical-serpentine-reverse', 'vertical-serpentine-reverse', () => vertical ? reverseCycle(vertical) : null);
    addArchetypeAttempt('vertical-serpentine-mirror-x', 'vertical-serpentine-mirror-x', () => {
        return vertical ? (0, rectangular_cycle_js_1.transformRectangleCycle)(vertical, map.width, map.height, (coord, width) => mirrorX(coord, width)) : null;
    });
    addArchetypeAttempt('vertical-serpentine-mirror-y', 'vertical-serpentine-mirror-y', () => {
        return vertical ? (0, rectangular_cycle_js_1.transformRectangleCycle)(vertical, map.width, map.height, mirrorY) : null;
    });
    const topLeftNode = startNodeOrder[0] ?? map.hamiltonianCycle[0];
    const topRightNode = startNodeOrder.find((nodeId) => (0, coords_js_1.coordFromNodeId)(nodeId).y === 0 && (0, coords_js_1.coordFromNodeId)(nodeId).x === map.width - 1) ?? topLeftNode;
    addSolverAttempt('spiral-biased', 'spiral-biased', () => {
        const solved = (0, hamiltonian_cycle_solver_js_1.solveHamiltonianCycle)(map.graph, {
            timeLimitMs: resolved.attemptTimeLimitMs,
            startNodeId: topLeftNode,
            neighborOrderSeed: deterministicAttemptSeed(map.id, 10_001),
            neighborBias: buildRankNeighborBias((coord) => {
                return ringIndex(coord, map.width, map.height) * map.width * map.height + ringClockwiseRank(coord, map.width, map.height);
            })
        });
        return solved.status === 'found' ? solved.cycle : null;
    });
    addSolverAttempt('band-horizontal-biased', 'band-horizontal-biased', () => {
        const solved = (0, hamiltonian_cycle_solver_js_1.solveHamiltonianCycle)(map.graph, {
            timeLimitMs: resolved.attemptTimeLimitMs,
            startNodeId: topLeftNode,
            neighborOrderSeed: deterministicAttemptSeed(map.id, 10_002),
            neighborBias: buildRankNeighborBias((coord) => horizontalBandRank(coord, map.width))
        });
        return solved.status === 'found' ? solved.cycle : null;
    });
    addSolverAttempt('band-vertical-biased', 'band-vertical-biased', () => {
        const solved = (0, hamiltonian_cycle_solver_js_1.solveHamiltonianCycle)(map.graph, {
            timeLimitMs: resolved.attemptTimeLimitMs,
            startNodeId: topRightNode,
            neighborOrderSeed: deterministicAttemptSeed(map.id, 10_003),
            neighborBias: buildRankNeighborBias((coord) => verticalBandRank(coord, map.height))
        });
        return solved.status === 'found' ? solved.cycle : null;
    });
    return attempts;
}
function generateDiverseHamiltonianCycles(map, options = {}) {
    const resolved = {
        ...DEFAULT_CYCLE_LIBRARY_OPTIONS,
        ...options
    };
    const acceptedEntries = [];
    const seenSignatures = new Set();
    const diagnostics = createEmptyCycleLibraryDiagnostics();
    if (!(0, map_validator_js_1.validateHamiltonianCycle)(map.graph, map.hamiltonianCycle)) {
        diagnostics.graphInvalidCandidates += 1;
        recordAttemptDiagnostic(diagnostics, {
            id: createBaseCycleLibraryEntryId(map.id),
            source: 'base',
            archetypeName: 'base',
            accepted: false,
            rejectionReason: 'graph-invalid'
        });
        return {
            mapId: map.id,
            status: 'failed',
            entries: [],
            diagnostics: finalizeCycleLibraryDiagnostics(diagnostics, acceptedEntries)
        };
    }
    tryAcceptCycle(acceptedEntries, seenSignatures, map.hamiltonianCycle, resolved.minDiversity, createBaseCycleLibraryEntryId(map.id), 'base', 'base', diagnostics);
    if (!isCycleLibrarySupportedMap(map)) {
        return {
            mapId: map.id,
            status: 'unsupported',
            entries: acceptedEntries,
            diagnostics: finalizeCycleLibraryDiagnostics(diagnostics, acceptedEntries)
        };
    }
    const startNodeOrder = buildStartNodeOrder(map);
    const archetypeAttempts = createArchetypeAttempts(map, resolved, startNodeOrder);
    for (const attempt of archetypeAttempts) {
        if (acceptedEntries.length >= resolved.maxCycles) {
            break;
        }
        diagnostics.generationAttempts += 1;
        const candidateCycle = attempt.build();
        if (!candidateCycle) {
            recordAttemptDiagnostic(diagnostics, {
                id: attempt.id,
                source: attempt.source,
                archetypeName: attempt.archetypeName,
                accepted: false,
                rejectionReason: attempt.source === 'solver' ? 'solver-not-found' : 'not-generated'
            });
            continue;
        }
        if (!(0, map_validator_js_1.validateHamiltonianCycle)(map.graph, candidateCycle)) {
            diagnostics.graphInvalidCandidates += 1;
            recordAttemptDiagnostic(diagnostics, {
                id: attempt.id,
                source: attempt.source,
                archetypeName: attempt.archetypeName,
                accepted: false,
                rejectionReason: 'graph-invalid',
                edgeDiversityFromAccepted: minimumEdgeDistanceToAccepted(acceptedEntries, candidateCycle),
                orderDiversityFromAccepted: minimumOrderDistanceToAccepted(acceptedEntries, candidateCycle)
            });
            continue;
        }
        tryAcceptCycle(acceptedEntries, seenSignatures, candidateCycle, resolved.minDiversity, attempt.id, attempt.source, attempt.archetypeName, diagnostics);
    }
    for (let attempt = 0; attempt < resolved.maxAttempts && acceptedEntries.length < resolved.maxCycles; attempt += 1) {
        diagnostics.generationAttempts += 1;
        const startNodeId = startNodeOrder[attempt % Math.max(1, startNodeOrder.length)];
        const seed = deterministicAttemptSeed(map.id, attempt);
        const solveOptions = {
            timeLimitMs: resolved.attemptTimeLimitMs,
            startNodeId,
            neighborOrderSeed: seed
        };
        const solved = (0, hamiltonian_cycle_solver_js_1.solveHamiltonianCycle)(map.graph, solveOptions);
        const entryId = createCycleEntryId(map.id, 'solver', `attempt-${attempt}`);
        if (solved.status !== 'found') {
            recordAttemptDiagnostic(diagnostics, {
                id: entryId,
                source: 'solver',
                archetypeName: 'randomized-solver',
                accepted: false,
                rejectionReason: 'solver-not-found'
            });
            continue;
        }
        if (!(0, map_validator_js_1.validateHamiltonianCycle)(map.graph, solved.cycle)) {
            diagnostics.graphInvalidCandidates += 1;
            recordAttemptDiagnostic(diagnostics, {
                id: entryId,
                source: 'solver',
                archetypeName: 'randomized-solver',
                accepted: false,
                rejectionReason: 'graph-invalid',
                edgeDiversityFromAccepted: minimumEdgeDistanceToAccepted(acceptedEntries, solved.cycle),
                orderDiversityFromAccepted: minimumOrderDistanceToAccepted(acceptedEntries, solved.cycle)
            });
            continue;
        }
        tryAcceptCycle(acceptedEntries, seenSignatures, solved.cycle, resolved.minDiversity, entryId, 'solver', 'randomized-solver', diagnostics);
    }
    return {
        mapId: map.id,
        status: 'ready',
        entries: acceptedEntries,
        diagnostics: finalizeCycleLibraryDiagnostics(diagnostics, acceptedEntries)
    };
}
