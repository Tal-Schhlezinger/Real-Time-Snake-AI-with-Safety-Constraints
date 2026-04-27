import { advanceGame, isMoveImmediatelySafe, listPotentialMoves, listSafeDirections, simulateDirections } from './game-engine.js';
import { getCertifiedLockedCycle } from './certified-cycle-controller.js';
import { CertifiedHamiltonianInvariantError } from './certified-hamiltonian-error.js';
import { hydrateGraph } from './graph.js';
import { validLockedCertificate } from './hamiltonian-certificate.js';
import { validateHamiltonianCycle } from './map-validator.js';
const cycleIndexCache = new WeakMap();
function getCycleIndex(map, cycle = map.hamiltonianCycle) {
    let cached = cycleIndexCache.get(map);
    if (!cached || cycle !== map.hamiltonianCycle) {
        cached = new Map();
        cycle.forEach((nodeId, index) => cached.set(nodeId, index));
        if (cycle === map.hamiltonianCycle) {
            cycleIndexCache.set(map, cached);
        }
    }
    return cached;
}
function buildCyclePlannedPath(map, cycle, currentNodeId, count = 10) {
    const indexByNode = getCycleIndex(map, cycle);
    const startIndex = indexByNode.get(currentNodeId) ?? 0;
    const path = [];
    for (let offset = 1; offset <= count; offset += 1) {
        path.push(cycle[(startIndex + offset) % cycle.length]);
    }
    return path;
}
function cycleInvariantError(message) {
    throw new CertifiedHamiltonianInvariantError(message);
}
function getCycleSuccessor(map, cycle, head) {
    const cycleIndex = getCycleIndex(map, cycle);
    const currentIndex = cycleIndex.get(head);
    if (currentIndex === undefined) {
        return null;
    }
    return cycle[(currentIndex + 1) % cycle.length] ?? null;
}
function getHamiltonianMove(state) {
    const head = state.snake.segments[0];
    const successor = getCycleSuccessor(state.map, state.map.hamiltonianCycle, head);
    if (!successor) {
        return null;
    }
    const move = listPotentialMoves(state).find((candidate) => candidate.to === successor);
    if (!move || !isMoveImmediatelySafe(state, move.direction)) {
        return null;
    }
    return {
        direction: move.direction,
        plannedPath: buildCyclePlannedPath(state.map, state.map.hamiltonianCycle, head),
        strategyUsed: 'hamiltonian'
    };
}
function getCertifiedHamiltonianMove(state) {
    if (state.certifiedMode === 'transition' && state.activeCertifiedTransitionPlan) {
        return getCertifiedTransitionMove(state);
    }
    const head = state.snake.segments[0];
    const cycle = getCertifiedLockedCycle(state);
    if (!validateHamiltonianCycle(state.map.graph, cycle)) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: locked cycle is not graph-valid.');
    }
    if (!validLockedCertificate(state.snake.segments, cycle)) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: snake body does not satisfy the locked Hamiltonian certificate.');
    }
    const successor = getCycleSuccessor(state.map, cycle, head);
    if (!successor) {
        cycleInvariantError(`Certified Hamiltonian AI invariant failed: head node ${head} is missing from the saved Hamiltonian cycle.`);
    }
    const graph = hydrateGraph(state.map.graph);
    const successorEdge = (graph.outgoing.get(head) ?? []).find((edge) => edge.to === successor);
    if (!successorEdge) {
        cycleInvariantError(`Certified Hamiltonian AI invariant failed: cycle successor ${successor} is not reachable by a legal outgoing edge from head ${head}.`);
    }
    const move = listPotentialMoves(state).find((candidate) => candidate.to === successor);
    if (!move) {
        cycleInvariantError(`Certified Hamiltonian AI invariant failed: no direction from head ${head} maps to the cycle successor ${successor}.`);
    }
    return {
        direction: move.direction,
        plannedPath: buildCyclePlannedPath(state.map, cycle, head),
        strategyUsed: 'certified-hamiltonian'
    };
}
function getCertifiedTransitionMove(state) {
    const plan = state.activeCertifiedTransitionPlan;
    const head = state.snake.segments[0];
    if (!plan) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: transition mode has no active certified plan.');
    }
    if (state.appleNodeId !== plan.certifiedAppleNodeId) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: transition apple changed before plan completion.');
    }
    if (state.applesEaten !== plan.certifiedAtApplesEaten) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: transition apple count changed before plan completion.');
    }
    if (!validateHamiltonianCycle(state.map.graph, plan.targetCycle)) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: transition target cycle is not graph-valid.');
    }
    const expectedHead = plan.expectedHeadPath[plan.nextDirectionIndex];
    if (!expectedHead || expectedHead !== head) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: current head does not match the certified transition path.');
    }
    const direction = plan.directions[plan.nextDirectionIndex];
    const expectedDestination = plan.expectedHeadPath[plan.nextDirectionIndex + 1];
    if (!direction || !expectedDestination) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: transition plan has no next certified move.');
    }
    const move = listPotentialMoves(state).find((candidate) => candidate.direction === direction);
    if (!move || move.to !== expectedDestination) {
        cycleInvariantError('Certified Hamiltonian AI invariant failed: transition next move no longer maps to the certified path.');
    }
    return {
        direction,
        plannedPath: plan.expectedHeadPath.slice(plan.nextDirectionIndex + 1, plan.nextDirectionIndex + 11),
        strategyUsed: 'certified-hamiltonian'
    };
}
function reconstructDirectionPath(parents, target) {
    const directions = [];
    let current = target;
    while (parents.has(current)) {
        const entry = parents.get(current);
        directions.push(entry.direction);
        current = entry.previous;
    }
    directions.reverse();
    return directions;
}
function findPathToTarget(state, target) {
    const graph = hydrateGraph(state.map.graph);
    const start = state.snake.segments[0];
    const blocked = new Set(state.snake.segments);
    const tail = state.snake.segments[state.snake.segments.length - 1];
    blocked.delete(tail);
    const parents = new Map();
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === target) {
            return reconstructDirectionPath(parents, target);
        }
        for (const edge of graph.outgoing.get(current) ?? []) {
            if (visited.has(edge.to)) {
                continue;
            }
            if (blocked.has(edge.to) && edge.to !== target) {
                continue;
            }
            visited.add(edge.to);
            parents.set(edge.to, { previous: current, direction: edge.direction });
            queue.push(edge.to);
        }
    }
    return null;
}
function canReachTail(state) {
    const graph = hydrateGraph(state.map.graph);
    const start = state.snake.segments[0];
    const target = state.snake.segments[state.snake.segments.length - 1];
    const blocked = new Set(state.snake.segments);
    blocked.delete(target);
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === target) {
            return true;
        }
        for (const edge of graph.outgoing.get(current) ?? []) {
            if (visited.has(edge.to) || blocked.has(edge.to)) {
                continue;
            }
            visited.add(edge.to);
            queue.push(edge.to);
        }
    }
    return false;
}
function chooseRoomiestMove(state) {
    const safeDirections = listSafeDirections(state);
    if (safeDirections.length === 0) {
        return null;
    }
    let bestDirection = safeDirections[0];
    let bestReachable = -1;
    for (const direction of safeDirections) {
        const simulated = advanceGame(state, direction, 0, { next: () => 0 });
        const graph = hydrateGraph(simulated.map.graph);
        const blocked = new Set(simulated.snake.segments.slice(1));
        const start = simulated.snake.segments[0];
        const visited = new Set([start]);
        const queue = [start];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const edge of graph.outgoing.get(current) ?? []) {
                if (blocked.has(edge.to) || visited.has(edge.to)) {
                    continue;
                }
                visited.add(edge.to);
                queue.push(edge.to);
            }
        }
        if (visited.size > bestReachable) {
            bestReachable = visited.size;
            bestDirection = direction;
        }
    }
    return {
        direction: bestDirection,
        plannedPath: [],
        strategyUsed: 'greedy'
    };
}
export function decideAiMove(state, preferredStrategy) {
    if (preferredStrategy === 'certified-hamiltonian') {
        return getCertifiedHamiltonianMove(state);
    }
    if (preferredStrategy === 'hamiltonian') {
        return getHamiltonianMove(state) ?? chooseRoomiestMove(state);
    }
    const safeDirections = listSafeDirections(state);
    if (safeDirections.length === 0) {
        return null;
    }
    if (state.appleNodeId) {
        const pathToApple = findPathToTarget(state, state.appleNodeId);
        if (pathToApple && pathToApple.length > 0) {
            const simulated = simulateDirections(state, pathToApple);
            if (!simulated.isOver && canReachTail(simulated)) {
                const head = state.snake.segments[0];
                const graph = hydrateGraph(state.map.graph);
                const plannedPath = [head];
                let current = head;
                for (const direction of pathToApple) {
                    const edge = (graph.outgoing.get(current) ?? []).find((candidate) => candidate.direction === direction);
                    if (!edge) {
                        break;
                    }
                    plannedPath.push(edge.to);
                    current = edge.to;
                }
                return {
                    direction: pathToApple[0],
                    plannedPath,
                    strategyUsed: 'greedy'
                };
            }
        }
    }
    const hamiltonian = getHamiltonianMove(state);
    if (hamiltonian) {
        return {
            ...hamiltonian,
            strategyUsed: 'greedy'
        };
    }
    return chooseRoomiestMove(state);
}
