"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneCoord = cloneCoord;
exports.clonePortalPair = clonePortalPair;
exports.cloneDraft = cloneDraft;
exports.cloneSavedMap = cloneSavedMap;
exports.coordListToSet = coordListToSet;
exports.portalCellMap = portalCellMap;
exports.createEmptyDraft = createEmptyDraft;
const coords_js_1 = require("./coords.js");
function cloneCoord(coord) {
    return { x: coord.x, y: coord.y };
}
function clonePortalPair(portal) {
    return {
        id: portal.id,
        a: cloneCoord(portal.a),
        b: cloneCoord(portal.b)
    };
}
function cloneDraft(draft) {
    return {
        ...draft,
        walls: draft.walls.map(cloneCoord),
        portals: draft.portals.map(clonePortalPair),
        snakeSpawn: draft.snakeSpawn ? cloneCoord(draft.snakeSpawn) : null
    };
}
function cloneSavedMap(map) {
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
function coordListToSet(coords) {
    return new Set(coords.map(coords_js_1.coordKey));
}
function portalCellMap(portals) {
    const map = new Map();
    for (const portal of portals) {
        map.set((0, coords_js_1.coordKey)(portal.a), { portalId: portal.id, pairCoord: portal.b });
        map.set((0, coords_js_1.coordKey)(portal.b), { portalId: portal.id, pairCoord: portal.a });
    }
    return map;
}
function createEmptyDraft(width, height, name = 'Untitled Map') {
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
