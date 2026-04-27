import { DIRECTIONS } from './coords.js';
import { computeCycleFeatures, defaultCycleScoreWeights, scoreCycleFeatures } from './cycle-scoring.js';
import { cycleEdgeSignature } from './cycle-library.js';
import { advanceGame } from './game-engine.js';
import { hydrateGraph } from './graph.js';
import { explainLockedCertificateFailure } from './hamiltonian-certificate.js';
const DEFAULT_OPTIONS = {
    slack: 6,
    maxPaths: 64,
    maxPathLength: Number.POSITIVE_INFINITY,
    maxSearchStates: 50_000
};
function resolvedOptions(options) {
    return {
        ...DEFAULT_OPTIONS,
        ...options
    };
}
function currentLockedCycle(state) {
    return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}
function currentLockedSignature(state) {
    return cycleEdgeSignature(currentLockedCycle(state));
}
function isCurrentLockedEntry(state, entry) {
    if (state.lockedHamiltonianCycleId && state.lockedHamiltonianCycleId === entry.id) {
        return true;
    }
    return cycleEdgeSignature(entry.cycle) === currentLockedSignature(state);
}
function shortestGraphDistance(state, from, to) {
    const graph = hydrateGraph(state.map.graph);
    const queue = [{ node: from, distance: 0 }];
    const visited = new Set([from]);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current.node === to) {
            return current.distance;
        }
        for (const edge of graph.outgoing.get(current.node) ?? []) {
            if (visited.has(edge.to)) {
                continue;
            }
            visited.add(edge.to);
            queue.push({ node: edge.to, distance: current.distance + 1 });
        }
    }
    return null;
}
function sortedOutgoingEdges(state, nodeId) {
    const graph = hydrateGraph(state.map.graph);
    return [...(graph.outgoing.get(nodeId) ?? [])].sort((left, right) => {
        const directionDifference = DIRECTIONS.indexOf(left.direction) - DIRECTIONS.indexOf(right.direction);
        if (directionDifference !== 0) {
            return directionDifference;
        }
        return left.to.localeCompare(right.to);
    });
}
export function generateCandidatePathsToApple(state, options = {}) {
    const head = state.snake.segments[0] ?? null;
    const apple = state.appleNodeId;
    if (!head || !apple) {
        return {
            paths: [],
            shortestDistance: null,
            budgetExceeded: false
        };
    }
    const resolved = resolvedOptions(options);
    const shortestDistance = shortestGraphDistance(state, head, apple);
    if (shortestDistance === null) {
        return {
            paths: [],
            shortestDistance,
            budgetExceeded: false
        };
    }
    const maxPathLength = Math.min(resolved.maxPathLength, shortestDistance + resolved.slack);
    if (maxPathLength < shortestDistance) {
        return {
            paths: [],
            shortestDistance,
            budgetExceeded: false
        };
    }
    const paths = [];
    let budgetExceeded = false;
    let searchStates = 0;
    const queue = [{
            node: head,
            directions: [],
            visited: new Set([head])
        }];
    while (queue.length > 0 && paths.length < resolved.maxPaths) {
        searchStates += 1;
        if (searchStates > resolved.maxSearchStates) {
            budgetExceeded = true;
            break;
        }
        const current = queue.shift();
        if (current.node === apple) {
            paths.push(current.directions);
            continue;
        }
        if (current.directions.length >= maxPathLength) {
            continue;
        }
        for (const edge of sortedOutgoingEdges(state, current.node)) {
            if (current.visited.has(edge.to) && edge.to !== apple) {
                continue;
            }
            const nextVisited = new Set(current.visited);
            nextVisited.add(edge.to);
            queue.push({
                node: edge.to,
                directions: [...current.directions, edge.direction],
                visited: nextVisited
            });
        }
    }
    if (queue.length > 0 && paths.length >= resolved.maxPaths) {
        budgetExceeded = true;
    }
    return {
        paths,
        shortestDistance,
        budgetExceeded
    };
}
function simulatePathUntilApple(state, path) {
    const initialApplesEaten = state.applesEaten;
    let current = state;
    for (const direction of path) {
        current = advanceGame(current, direction, 0, { next: () => 0 });
        if (current.applesEaten > initialApplesEaten) {
            return {
                status: 'apple-eaten',
                state: current
            };
        }
        if (current.isOver) {
            return {
                status: current.deathReason ? 'collision-before-apple' : 'simulation-ended-before-apple',
                state: current
            };
        }
    }
    return {
        status: current.isOver ? 'simulation-ended-before-apple' : 'apple-not-reached',
        state: current
    };
}
function createFailureReasons(budgetExceeded) {
    return {
        noPathGenerated: 0,
        collisionBeforeApple: 0,
        appleNotReached: 0,
        postAppleLockedCertificateFailed: 0,
        simulationEndedBeforeApple: 0,
        budgetExceeded: budgetExceeded ? 1 : 0
    };
}
function analyzeTargetCycle(state, entry, paths, shortestDistance, budgetExceeded) {
    const failureReasons = createFailureReasons(budgetExceeded);
    const lockedCertificateFailures = new Set();
    let safePathsToApple = 0;
    let successfulTransitionPaths = 0;
    let bestSuccessfulPath = null;
    let bestTransitionState = null;
    if (paths.length === 0) {
        failureReasons.noPathGenerated = 1;
    }
    for (const path of paths) {
        const simulated = simulatePathUntilApple(state, path);
        if (simulated.status === 'collision-before-apple') {
            failureReasons.collisionBeforeApple += 1;
            continue;
        }
        if (simulated.status === 'simulation-ended-before-apple') {
            failureReasons.simulationEndedBeforeApple += 1;
            continue;
        }
        if (simulated.status === 'apple-not-reached') {
            failureReasons.appleNotReached += 1;
            continue;
        }
        safePathsToApple += 1;
        const lockedFailure = explainLockedCertificateFailure(simulated.state.snake.segments, entry.cycle);
        if (lockedFailure) {
            failureReasons.postAppleLockedCertificateFailed += 1;
            lockedCertificateFailures.add(lockedFailure);
            continue;
        }
        successfulTransitionPaths += 1;
        if (!bestSuccessfulPath || path.length < bestSuccessfulPath.length) {
            bestSuccessfulPath = path;
            bestTransitionState = simulated.state;
        }
    }
    const targetFeatures = bestTransitionState
        ? computeCycleFeatures(bestTransitionState, currentLockedCycle(state), entry.cycle)
        : null;
    return {
        targetCycleId: entry.id,
        source: entry.source,
        archetypeName: entry.archetypeName,
        isCurrentLockedCycle: isCurrentLockedEntry(state, entry),
        shortestDistanceToApple: shortestDistance,
        pathsGenerated: paths.length,
        pathsSimulated: paths.length,
        safePathsToApple,
        successfulTransitionPaths,
        bestSuccessfulPathLength: bestSuccessfulPath?.length ?? null,
        bestSuccessfulPath,
        targetPathLenAfterTransition: targetFeatures?.pathLen ?? null,
        targetScoreAfterTransition: targetFeatures ? scoreCycleFeatures(targetFeatures, defaultCycleScoreWeights) : null,
        failureReasons,
        lockedCertificateFailures: [...lockedCertificateFailures]
    };
}
export function analyzeCertifiedTransitionTargets(state, cycleLibrary, options = {}) {
    const generated = generateCandidatePathsToApple(state, options);
    const targets = cycleLibrary.entries.map((entry) => analyzeTargetCycle(state, entry, generated.paths, generated.shortestDistance, generated.budgetExceeded));
    const successfulTargets = targets.filter((target) => target.successfulTransitionPaths > 0);
    const bestTarget = successfulTargets
        .filter((target) => target.bestSuccessfulPathLength !== null)
        .sort((left, right) => {
        const leftLength = left.bestSuccessfulPathLength ?? Number.POSITIVE_INFINITY;
        const rightLength = right.bestSuccessfulPathLength ?? Number.POSITIVE_INFINITY;
        if (leftLength !== rightLength) {
            return leftLength - rightLength;
        }
        if (left.isCurrentLockedCycle !== right.isCurrentLockedCycle) {
            return left.isCurrentLockedCycle ? -1 : 1;
        }
        return left.targetCycleId.localeCompare(right.targetCycleId);
    })[0] ?? null;
    return {
        snakeLength: state.snake.segments.length,
        applePosition: state.appleNodeId,
        head: state.snake.segments[0] ?? null,
        tail: state.snake.segments[state.snake.segments.length - 1] ?? null,
        librarySize: cycleLibrary.entries.length,
        targetCyclesChecked: targets.length,
        targetsWithSuccessfulTransition: successfulTargets.length,
        totalSuccessfulTransitionPaths: targets.reduce((sum, target) => sum + target.successfulTransitionPaths, 0),
        bestTargetCycleId: bestTarget?.targetCycleId ?? null,
        bestPathLength: bestTarget?.bestSuccessfulPathLength ?? null,
        bestPath: bestTarget?.bestSuccessfulPath ?? null,
        currentLockedCycleId: state.lockedHamiltonianCycleId,
        shortestDistanceToApple: generated.shortestDistance,
        pathsGenerated: generated.paths.length,
        budgetExceeded: generated.budgetExceeded,
        targets
    };
}
