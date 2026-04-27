export const DIRECTIONS = ['up', 'right', 'down', 'left'];
export const DIRECTION_VECTORS = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
};
export function addCoords(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}
export function coordEquals(a, b) {
    return a.x === b.x && a.y === b.y;
}
export function coordKey(coord) {
    return `${coord.x},${coord.y}`;
}
export function nodeIdForCoord(coord) {
    return `n-${coord.x}-${coord.y}`;
}
export function coordFromNodeId(nodeId) {
    const [, x, y] = nodeId.split('-');
    return { x: Number(x), y: Number(y) };
}
export function inBounds(coord, width, height) {
    return coord.x >= 0 && coord.x < width && coord.y >= 0 && coord.y < height;
}
export function directionBetween(a, b) {
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
export function oppositeDirection(direction) {
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
