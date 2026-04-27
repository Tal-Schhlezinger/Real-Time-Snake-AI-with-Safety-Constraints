import type { Coord, Direction, NodeId } from './types.js';

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

export const DIRECTION_VECTORS: Record<Direction, Coord> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

export function addCoords(a: Coord, b: Coord): Coord {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function coordEquals(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function nodeIdForCoord(coord: Coord): NodeId {
  return `n-${coord.x}-${coord.y}`;
}

export function coordFromNodeId(nodeId: NodeId): Coord {
  const [, x, y] = nodeId.split('-');
  return { x: Number(x), y: Number(y) };
}

export function inBounds(coord: Coord, width: number, height: number): boolean {
  return coord.x >= 0 && coord.x < width && coord.y >= 0 && coord.y < height;
}

export function directionBetween(a: Coord, b: Coord): Direction | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) {
    return 'right';
  }
  if (dx === -1 && dy === 0) {
    return 'left';
  }
  if (dx === 0 && dy === 1) {
    return 'down';
  }
  if (dx === 0 && dy === -1) {
    return 'up';
  }
  return null;
}

export function oppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case 'up':
      return 'down';
    case 'right':
      return 'left';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
  }
}
