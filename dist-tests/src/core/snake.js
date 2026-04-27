"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSnake = createSnake;
exports.normalizeRequestedDirection = normalizeRequestedDirection;
exports.occupiedNodeSet = occupiedNodeSet;
const coords_js_1 = require("./coords.js");
function createSnake(spawnNodeId, direction) {
    return {
        segments: [spawnNodeId],
        direction,
        pendingGrowth: 0
    };
}
function normalizeRequestedDirection(snake, requestedDirection) {
    if (!requestedDirection) {
        return snake.direction;
    }
    if (snake.segments.length > 1 && (0, coords_js_1.oppositeDirection)(snake.direction) === requestedDirection) {
        return snake.direction;
    }
    return requestedDirection;
}
function occupiedNodeSet(snake) {
    return new Set(snake.segments);
}
