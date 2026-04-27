"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LateGameFreeSpacePathSolver = void 0;
exports.solveLateGameFreeSpacePath = solveLateGameFreeSpacePath;
const hamiltonian_certificate_js_1 = require("./hamiltonian-certificate.js");
const graph_js_1 = require("./graph.js");
const map_validator_js_1 = require("./map-validator.js");
const DEFAULT_OPTIONS = {
    freeCountThreshold: 20,
    maxExpansions: 100_000
};
function emptyValidity() {
    return {
        graphValid: false,
        lockedCertificateValid: false,
        appleForwardValid: null
    };
}
function makeFailure(freeCount, searchAttempted, nodesExpanded, budgetExhausted, failureReason, overrides = {}) {
    return {
        freeCount,
        searchAttempted,
        nodesExpanded,
        budgetExhausted,
        success: false,
        failureReason,
        appleIndexOnFoundPath: null,
        resultingCycleValidity: emptyValidity(),
        foundPath: null,
        cycle: null,
        ...overrides
    };
}
function hasDirectedEdge(context, from, to) {
    return (context.graph.outgoing.get(from) ?? []).some((edge) => edge.to === to);
}
function remainingFreeNodes(context, visitedFree) {
    return context.freeNodes.filter((nodeId) => !visitedFree.has(nodeId));
}
function remainingGraphConnected(context, current, visitedFree) {
    const allowed = new Set([current, context.tail, ...remainingFreeNodes(context, visitedFree)]);
    const visited = new Set([current]);
    const queue = [current];
    while (queue.length > 0) {
        const node = queue.shift();
        for (const neighbor of context.graph.undirectedNeighbors.get(node) ?? []) {
            if (!allowed.has(neighbor) || visited.has(neighbor)) {
                continue;
            }
            visited.add(neighbor);
            queue.push(neighbor);
        }
    }
    return visited.size === allowed.size;
}
function onwardDegree(context, nodeId, visitedFree) {
    let degree = 0;
    const remaining = remainingFreeNodes(context, visitedFree);
    for (const edge of context.graph.outgoing.get(nodeId) ?? []) {
        if (edge.to === context.tail && remaining.length === 0) {
            degree += 1;
        }
        else if (context.freeSet.has(edge.to) && !visitedFree.has(edge.to)) {
            degree += 1;
        }
    }
    return degree;
}
function candidateNextNodes(context, current, visitedFree) {
    const candidates = [];
    for (const edge of context.graph.outgoing.get(current) ?? []) {
        if (edge.to === context.tail) {
            if (visitedFree.size === context.freeNodes.length) {
                candidates.push(edge.to);
            }
            continue;
        }
        if (context.freeSet.has(edge.to) && !visitedFree.has(edge.to)) {
            candidates.push(edge.to);
        }
    }
    return candidates.sort((left, right) => {
        const leftVisited = new Set(visitedFree);
        const rightVisited = new Set(visitedFree);
        if (context.freeSet.has(left)) {
            leftVisited.add(left);
        }
        if (context.freeSet.has(right)) {
            rightVisited.add(right);
        }
        const leftDegree = onwardDegree(context, left, leftVisited);
        const rightDegree = onwardDegree(context, right, rightVisited);
        const leftForced = leftDegree <= 1 ? 0 : 1;
        const rightForced = rightDegree <= 1 ? 0 : 1;
        if (leftForced !== rightForced) {
            return leftForced - rightForced;
        }
        const leftApple = context.apple === left ? 0 : 1;
        const rightApple = context.apple === right ? 0 : 1;
        if (leftApple !== rightApple) {
            return leftApple - rightApple;
        }
        if (leftDegree !== rightDegree) {
            return leftDegree - rightDegree;
        }
        return left.localeCompare(right);
    });
}
function searchHamiltonPath(context, current, visitedFree, path) {
    if (context.nodesExpanded >= context.maxExpansions) {
        context.budgetExhausted = true;
        return null;
    }
    context.nodesExpanded += 1;
    if (visitedFree.size === context.freeNodes.length) {
        return hasDirectedEdge(context, current, context.tail) ? [...path, context.tail] : null;
    }
    if (!remainingGraphConnected(context, current, visitedFree)) {
        context.disconnectedPrunes += 1;
        return null;
    }
    for (const next of candidateNextNodes(context, current, visitedFree)) {
        if (next === context.tail) {
            continue;
        }
        const nextVisited = new Set(visitedFree);
        nextVisited.add(next);
        const result = searchHamiltonPath(context, next, nextVisited, [...path, next]);
        if (result) {
            return result;
        }
        if (context.budgetExhausted) {
            return null;
        }
    }
    return null;
}
function buildCycleFromBodyAndFreePath(bodySegments, freePath) {
    return [...bodySegments].reverse().concat(freePath.slice(1, -1));
}
class LateGameFreeSpacePathSolver {
    options;
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options
        };
    }
    solve(state) {
        const graph = (0, graph_js_1.hydrateGraph)(state.map.graph);
        const body = state.snake.segments;
        const head = body[0] ?? null;
        const tail = body[body.length - 1] ?? null;
        const occupied = new Set(body);
        const freeNodes = state.map.graph.nodes
            .map((node) => node.id)
            .filter((nodeId) => !occupied.has(nodeId))
            .sort((left, right) => left.localeCompare(right));
        const freeCount = freeNodes.length;
        if (!head || !tail) {
            return makeFailure(freeCount, false, 0, false, 'missing-head-or-tail');
        }
        if (freeCount > this.options.freeCountThreshold) {
            return makeFailure(freeCount, false, 0, false, 'free-count-above-threshold');
        }
        const context = {
            graph,
            freeNodes,
            freeSet: new Set(freeNodes),
            head,
            tail,
            apple: state.appleNodeId,
            maxExpansions: this.options.maxExpansions,
            nodesExpanded: 0,
            budgetExhausted: false,
            disconnectedPrunes: 0
        };
        if (!remainingGraphConnected(context, head, new Set())) {
            return makeFailure(freeCount, true, 0, false, 'disconnected-free-space');
        }
        const foundPath = searchHamiltonPath(context, head, new Set(), [head]);
        if (!foundPath) {
            return makeFailure(freeCount, true, context.nodesExpanded, context.budgetExhausted, context.budgetExhausted ? 'budget-exhausted' : context.disconnectedPrunes > 0 ? 'disconnected-free-space' : 'no-hamilton-path');
        }
        const cycle = buildCycleFromBodyAndFreePath(body, foundPath);
        const graphValid = (0, map_validator_js_1.validateHamiltonianCycle)(state.map.graph, cycle);
        const lockedCertificateValid = (0, hamiltonian_certificate_js_1.validLockedCertificate)(body, cycle);
        const appleForwardValid = state.appleNodeId ? (0, hamiltonian_certificate_js_1.appleForward)(body, state.appleNodeId, cycle) : null;
        const resultingCycleValidity = {
            graphValid,
            lockedCertificateValid,
            appleForwardValid
        };
        const appleIndexOnFoundPath = state.appleNodeId ? foundPath.indexOf(state.appleNodeId) : null;
        const validatorsPass = graphValid && lockedCertificateValid && (state.appleNodeId === null || appleForwardValid === true);
        if (!validatorsPass) {
            return makeFailure(freeCount, true, context.nodesExpanded, false, graphValid && lockedCertificateValid ? 'apple-forward-failed' : 'cycle-validation-failed', {
                appleIndexOnFoundPath: appleIndexOnFoundPath === -1 ? null : appleIndexOnFoundPath,
                resultingCycleValidity,
                foundPath,
                cycle
            });
        }
        return {
            freeCount,
            searchAttempted: true,
            nodesExpanded: context.nodesExpanded,
            budgetExhausted: false,
            success: true,
            failureReason: null,
            appleIndexOnFoundPath: appleIndexOnFoundPath === -1 ? null : appleIndexOnFoundPath,
            resultingCycleValidity,
            foundPath,
            cycle
        };
    }
}
exports.LateGameFreeSpacePathSolver = LateGameFreeSpacePathSolver;
function solveLateGameFreeSpacePath(state, options = {}) {
    return new LateGameFreeSpacePathSolver(options).solve(state);
}
