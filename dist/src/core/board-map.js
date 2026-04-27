import { coordKey } from './coords.js';
export function cloneCoord(coord) {
    return { x: coord.x, y: coord.y };
}
export function clonePortalPair(portal) {
    return {
        id: portal.id,
        a: cloneCoord(portal.a),
        b: cloneCoord(portal.b)
    };
}
export function cloneDraft(draft) {
    return {
        ...draft,
        walls: draft.walls.map(cloneCoord),
        portals: draft.portals.map(clonePortalPair),
        snakeSpawn: draft.snakeSpawn ? cloneCoord(draft.snakeSpawn) : null
    };
}
export function cloneSavedMap(map) {
    return {
        ...map,
        walls: map.walls.map(cloneCoord),
        portals: map.portals.map(clonePortalPair),
        snakeSpawn: cloneCoord(map.snakeSpawn),
        graph: {
            nodes: map.graph.nodes.map((node) => ({ ...node })),
            edges: map.graph.edges.map((edge) => ({ ...edge }))
        },
        hamiltonianCycle: [...map.hamiltonianCycle]
    };
}
export function coordListToSet(coords) {
    return new Set(coords.map(coordKey));
}
export function portalCellMap(portals) {
    const map = new Map();
    for (const portal of portals) {
        map.set(coordKey(portal.a), { portalId: portal.id, pairCoord: portal.b });
        map.set(coordKey(portal.b), { portalId: portal.id, pairCoord: portal.a });
    }
    return map;
}
export function createEmptyDraft(width, height, name = 'Untitled Map') {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        name,
        width,
        height,
        walls: [],
        portals: [],
        snakeSpawn: null,
        createdAt: now,
        updatedAt: now
    };
}
