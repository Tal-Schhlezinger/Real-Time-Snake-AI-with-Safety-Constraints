"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIRECTION_VECTORS = exports.DIRECTIONS = void 0;
exports.addCoords = addCoords;
exports.coordEquals = coordEquals;
exports.coordKey = coordKey;
exports.nodeIdForCoord = nodeIdForCoord;
exports.coordFromNodeId = coordFromNodeId;
exports.inBounds = inBounds;
exports.directionBetween = directionBetween;
exports.oppositeDirection = oppositeDirection;
exports.DIRECTIONS = ['up', 'right', 'down', 'left'];
exports.DIRECTION_VECTORS = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
};
function addCoords(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}
function coordEquals(a, b) {
    return a.x === b.x && a.y === b.y;
}
function coordKey(coord) {
    return `${coord.x},${coord.y}`;
}
function nodeIdForCoord(coord) {
    return `n-${coord.x}-${coord.y}`;
}
function coordFromNodeId(nodeId) {
    const [, x, y] = nodeId.split('-');
    return { x: Number(x), y: Number(y) };
}
function inBounds(coord, width, height) {
    return coord.x >= 0 && coord.x < width && coord.y >= 0 && coord.y < height;
}
function directionBetween(a, b) {
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
function oppositeDirection(direction) {
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
