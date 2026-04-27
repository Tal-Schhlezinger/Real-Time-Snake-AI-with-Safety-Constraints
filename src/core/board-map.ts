import { coordKey } from './coords.js';
import type { Coord, EditableMapDraft, PortalPair, SavedMap } from './types.js';

export function cloneCoord(coord: Coord): Coord {
  return { x: coord.x, y: coord.y };
}

export function clonePortalPair(portal: PortalPair): PortalPair {
  return {
    id: portal.id,
    a: cloneCoord(portal.a),
    b: cloneCoord(portal.b)
  };
}

export function cloneDraft(draft: EditableMapDraft): EditableMapDraft {
  return {
    ...draft,
    walls: draft.walls.map(cloneCoord),
    portals: draft.portals.map(clonePortalPair),
    snakeSpawn: draft.snakeSpawn ? cloneCoord(draft.snakeSpawn) : null
  };
}

export function cloneSavedMap(map: SavedMap): SavedMap {
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

export function coordListToSet(coords: Coord[]): Set<string> {
  return new Set(coords.map(coordKey));
}

export function portalCellMap(portals: PortalPair[]): Map<string, { portalId: string; pairCoord: Coord }> {
  const map = new Map<string, { portalId: string; pairCoord: Coord }>();
  for (const portal of portals) {
    map.set(coordKey(portal.a), { portalId: portal.id, pairCoord: portal.b });
    map.set(coordKey(portal.b), { portalId: portal.id, pairCoord: portal.a });
  }
  return map;
}

export function createEmptyDraft(width: number, height: number, name = 'Untitled Map'): EditableMapDraft {
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
