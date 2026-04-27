import { oppositeDirection } from './coords.js';
export function createSnake(spawnNodeId, direction) {
    return {
        segments: [spawnNodeId],
        direction,
        pendingGrowth: 0
    };
}
export function normalizeRequestedDirection(snake, requestedDirection) {
    if (!requestedDirection) {
        return snake.direction;
    }
    if (snake.segments.length > 1 && oppositeDirection(snake.direction) === requestedDirection) {
        return snake.direction;
    }
    return requestedDirection;
}
export function occupiedNodeSet(snake) {
    return new Set(snake.segments);
}
