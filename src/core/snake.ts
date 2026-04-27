import { oppositeDirection } from './coords.js';
import type { Direction, NodeId, SnakeState } from './types.js';

export function createSnake(spawnNodeId: NodeId, direction: Direction): SnakeState {
  return {
    segments: [spawnNodeId],
    direction,
    pendingGrowth: 0
  };
}

export function normalizeRequestedDirection(snake: SnakeState, requestedDirection: Direction | null): Direction {
  if (!requestedDirection) {
    return snake.direction;
  }
  if (snake.segments.length > 1 && oppositeDirection(snake.direction) === requestedDirection) {
    return snake.direction;
  }
  return requestedDirection;
}

export function occupiedNodeSet(snake: SnakeState): Set<NodeId> {
  return new Set(snake.segments);
}
