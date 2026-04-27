import { addCoords, coordFromNodeId, coordKey, DIRECTION_VECTORS, inBounds } from './coords.js';
import { hydrateGraph } from './graph.js';
import { spawnAppleNode } from './apple-spawner.js';
import { normalizeRequestedDirection, occupiedNodeSet } from './snake.js';
const hydratedGraphCache = new WeakMap();
function getHydratedGraph(map) {
    let hydrated = hydratedGraphCache.get(map);
    if (!hydrated) {
        hydrated = hydrateGraph(map.graph);
        hydratedGraphCache.set(map, hydrated);
    }
    return hydrated;
}
function classifyMissingEdge(map, fromNodeId, direction) {
    const fromCoord = coordFromNodeId(fromNodeId);
    const nextCoord = addCoords(fromCoord, DIRECTION_VECTORS[direction]);
    if (!inBounds(nextCoord, map.width, map.height)) {
        return 'out-of-bounds';
    }
    const wallSet = new Set(map.walls.map(coordKey));
    if (wallSet.has(coordKey(nextCoord))) {
        return 'wall';
    }
    const portalCoords = new Set(map.portals.flatMap((portal) => [coordKey(portal.a), coordKey(portal.b)]));
    if (portalCoords.has(coordKey(nextCoord))) {
        return 'invalid-portal';
    }
    return 'no-next-move';
}
export function listPotentialMoves(state) {
    const graph = getHydratedGraph(state.map);
    const head = state.snake.segments[0];
    return (graph.outgoing.get(head) ?? []).map((edge) => ({
        from: edge.from,
        to: edge.to,
        direction: edge.direction,
        edgeKind: edge.kind,
        viaPortalId: edge.viaPortalId
    }));
}
export function isMoveImmediatelySafe(state, direction) {
    const move = listPotentialMoves(state).find((candidate) => candidate.direction === direction);
    if (!move) {
        return false;
    }
    const occupied = occupiedNodeSet(state.snake);
    const tail = state.snake.segments[state.snake.segments.length - 1];
    const willGrow = move.to === state.appleNodeId;
    if (!occupied.has(move.to)) {
        return true;
    }
    return !willGrow && move.to === tail;
}
export function listSafeDirections(state) {
    return listPotentialMoves(state)
        .filter((move) => isMoveImmediatelySafe(state, move.direction))
        .map((move) => move.direction);
}
export function advanceGame(state, requestedDirection, deltaMs, random = { next: () => Math.random() }) {
    if (state.isOver || state.isPaused) {
        return state;
    }
    const direction = normalizeRequestedDirection(state.snake, requestedDirection);
    const graph = getHydratedGraph(state.map);
    const head = state.snake.segments[0];
    const edge = graph.directionLookup.get(`${head}:${direction}`);
    if (!edge) {
        return {
            ...state,
            elapsedMs: state.elapsedMs + deltaMs,
            isOver: true,
            outcome: 'lose',
            deathReason: classifyMissingEdge(state.map, head, direction),
            aiPlannedPath: []
        };
    }
    const destination = edge.to;
    const occupied = occupiedNodeSet(state.snake);
    const tail = state.snake.segments[state.snake.segments.length - 1];
    const willEatApple = destination === state.appleNodeId;
    const collidesWithBody = occupied.has(destination) && !(destination === tail && !willEatApple);
    if (collidesWithBody) {
        return {
            ...state,
            elapsedMs: state.elapsedMs + deltaMs,
            isOver: true,
            outcome: 'lose',
            deathReason: edge.kind === 'portal' ? 'invalid-portal' : 'self',
            lastMove: {
                from: edge.from,
                to: edge.to,
                direction: edge.direction,
                edgeKind: edge.kind,
                viaPortalId: edge.viaPortalId
            },
            aiPlannedPath: []
        };
    }
    const segments = [destination, ...state.snake.segments];
    if (!willEatApple) {
        segments.pop();
    }
    const elapsedMs = state.elapsedMs + deltaMs;
    const applesEaten = state.applesEaten + (willEatApple ? 1 : 0);
    const finalAppleTimeMs = willEatApple ? elapsedMs : state.finalAppleTimeMs;
    const justFilledBoard = willEatApple && segments.length === state.map.graph.nodes.length;
    const pendingWinCheck = state.pendingWinCheck || justFilledBoard;
    const stepsSinceLastApple = state.aiStrategy === 'certified-hamiltonian'
        ? willEatApple
            ? 0
            : state.stepsSinceLastApple + 1
        : state.stepsSinceLastApple;
    let nextApple = state.appleNodeId;
    if (willEatApple) {
        nextApple = justFilledBoard ? null : spawnAppleNode(state.map.graph, segments, random);
    }
    const nextState = {
        ...state,
        lockedHamiltonianCycle: state.lockedHamiltonianCycle ? [...state.lockedHamiltonianCycle] : null,
        lockedHamiltonianCycleId: state.lockedHamiltonianCycleId,
        certifiedPhase: state.certifiedPhase,
        certifiedMode: state.certifiedMode,
        activeCertifiedTransitionPlan: state.activeCertifiedTransitionPlan
            ? {
                ...state.activeCertifiedTransitionPlan,
                targetCycle: [...state.activeCertifiedTransitionPlan.targetCycle],
                directions: [...state.activeCertifiedTransitionPlan.directions],
                expectedHeadPath: [...state.activeCertifiedTransitionPlan.expectedHeadPath]
            }
            : null,
        snake: {
            segments,
            direction,
            pendingGrowth: 0
        },
        appleNodeId: nextApple,
        applesEaten,
        elapsedMs,
        pendingWinCheck,
        finalAppleTimeMs,
        lastMove: {
            from: edge.from,
            to: edge.to,
            direction: edge.direction,
            edgeKind: edge.kind,
            viaPortalId: edge.viaPortalId
        },
        aiPlannedPath: [],
        stepsSinceLastApple
    };
    if (state.pendingWinCheck && !nextState.isOver) {
        return {
            ...nextState,
            isOver: true,
            outcome: 'win',
            deathReason: null
        };
    }
    return nextState;
}
export function simulateDirections(state, directions) {
    let current = state;
    for (const direction of directions) {
        current = advanceGame(current, direction, 0, { next: () => 0 });
        if (current.isOver) {
            return current;
        }
    }
    return current;
}
