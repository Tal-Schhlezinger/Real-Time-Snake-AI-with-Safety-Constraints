"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const apple_spawner_1 = require("../src/core/apple-spawner");
const game_engine_1 = require("../src/core/game-engine");
const coords_1 = require("../src/core/coords");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const helpers_1 = require("./helpers");
(0, testkit_1.describe)('game engine', () => {
    (0, testkit_1.it)('moves the snake one cell per tick', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [(0, coords_1.nodeIdForCoord)({ x: 0, y: 0 })],
                direction: 'right',
                pendingGrowth: 0
            }
        });
        const next = (0, game_engine_1.advanceGame)(state, 'right', 140);
        strict_1.default.equal(next.snake.segments[0], (0, coords_1.nodeIdForCoord)({ x: 1, y: 0 }));
        strict_1.default.equal(next.elapsedMs, 140);
    });
    (0, testkit_1.it)('grows after eating an apple', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [(0, coords_1.nodeIdForCoord)({ x: 0, y: 0 })],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: (0, coords_1.nodeIdForCoord)({ x: 1, y: 0 })
        });
        const next = (0, game_engine_1.advanceGame)(state, 'right', 140, { next: () => 0 });
        strict_1.default.equal(next.snake.segments.length, 2);
        strict_1.default.equal(next.applesEaten, 1);
        strict_1.default.equal(next.finalAppleTimeMs, 140);
    });
    (0, testkit_1.it)('spawns apples only on legal free graph cells', () => {
        const draft = (0, helpers_1.makeDraft)({
            width: 5,
            height: 4,
            walls: [{ x: 2, y: 0 }],
            portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } }],
            snakeSpawn: { x: 0, y: 0 }
        });
        const map = (0, helpers_1.makeSavedMap)(draft);
        const occupied = [(0, coords_1.nodeIdForCoord)({ x: 0, y: 0 }), (0, coords_1.nodeIdForCoord)({ x: 0, y: 1 })];
        const spawnable = (0, apple_spawner_1.collectSpawnableNodeIds)(map.graph, occupied);
        strict_1.default.equal(spawnable.includes((0, coords_1.nodeIdForCoord)({ x: 2, y: 0 })), false);
        strict_1.default.equal(spawnable.includes((0, coords_1.nodeIdForCoord)({ x: 1, y: 1 })), false);
        strict_1.default.equal(spawnable.includes((0, coords_1.nodeIdForCoord)({ x: 3, y: 1 })), false);
        strict_1.default.equal(spawnable.includes((0, coords_1.nodeIdForCoord)({ x: 0, y: 0 })), false);
        strict_1.default.equal(spawnable.includes((0, coords_1.nodeIdForCoord)({ x: 4, y: 1 })), true);
    });
    (0, testkit_1.it)('loses on wall collision', () => {
        const map = (0, helpers_1.makeSavedMap)((0, helpers_1.makeDraft)({
            width: 4,
            height: 4,
            walls: [{ x: 1, y: 0 }]
        }));
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [(0, coords_1.nodeIdForCoord)({ x: 0, y: 0 })],
                direction: 'right',
                pendingGrowth: 0
            }
        });
        const next = (0, game_engine_1.advanceGame)(state, 'right', 140);
        strict_1.default.equal(next.isOver, true);
        strict_1.default.equal(next.deathReason, 'wall');
    });
    (0, testkit_1.it)('loses on self collision', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [
                    (0, coords_1.nodeIdForCoord)({ x: 2, y: 1 }),
                    (0, coords_1.nodeIdForCoord)({ x: 1, y: 1 }),
                    (0, coords_1.nodeIdForCoord)({ x: 1, y: 2 }),
                    (0, coords_1.nodeIdForCoord)({ x: 2, y: 2 })
                ],
                direction: 'left',
                pendingGrowth: 0
            }
        });
        const next = (0, game_engine_1.advanceGame)(state, 'left', 140);
        strict_1.default.equal(next.isOver, true);
        strict_1.default.equal(next.deathReason, 'self');
    });
    (0, testkit_1.it)('loses on out-of-bounds collision', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [(0, coords_1.nodeIdForCoord)({ x: 0, y: 0 })],
                direction: 'left',
                pendingGrowth: 0
            }
        });
        const next = (0, game_engine_1.advanceGame)(state, 'left', 140);
        strict_1.default.equal(next.isOver, true);
        strict_1.default.equal(next.deathReason, 'out-of-bounds');
    });
    (0, testkit_1.it)('teleports through portals', () => {
        const map = (0, helpers_1.makeSavedMap)((0, helpers_1.makeDraft)({
            width: 5,
            height: 4,
            portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } }],
            snakeSpawn: { x: 0, y: 1 }
        }));
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [(0, coords_1.nodeIdForCoord)({ x: 0, y: 1 })],
                direction: 'right',
                pendingGrowth: 0
            }
        });
        const next = (0, game_engine_1.advanceGame)(state, 'right', 140);
        strict_1.default.equal(next.snake.segments[0], (0, coords_1.nodeIdForCoord)({ x: 4, y: 1 }));
        strict_1.default.equal(next.lastMove?.edgeKind, 'portal');
    });
    (0, testkit_1.it)('dies on invalid portal teleport', () => {
        const map = (0, helpers_1.makeSavedMap)((0, helpers_1.makeDraft)({
            width: 5,
            height: 4,
            portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 4, y: 1 } }],
            snakeSpawn: { x: 0, y: 1 }
        }));
        const state = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [(0, coords_1.nodeIdForCoord)({ x: 0, y: 1 })],
                direction: 'right',
                pendingGrowth: 0
            }
        });
        const next = (0, game_engine_1.advanceGame)(state, 'right', 140);
        strict_1.default.equal(next.isOver, true);
        strict_1.default.equal(next.deathReason, 'invalid-portal');
    });
    (0, testkit_1.it)('requires one extra legal move to win after filling the board', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'tiny', name: 'Tiny', width: 2, height: 2 });
        const fillState = (0, helpers_1.makeGameState)({
            map,
            snake: {
                segments: [
                    (0, coords_1.nodeIdForCoord)({ x: 1, y: 1 }),
                    (0, coords_1.nodeIdForCoord)({ x: 1, y: 0 }),
                    (0, coords_1.nodeIdForCoord)({ x: 0, y: 0 })
                ],
                direction: 'left',
                pendingGrowth: 0
            },
            appleNodeId: (0, coords_1.nodeIdForCoord)({ x: 0, y: 1 }),
            applesEaten: 2
        });
        const fullBoard = (0, game_engine_1.advanceGame)(fillState, 'left', 140, { next: () => 0 });
        strict_1.default.equal(fullBoard.isOver, false);
        strict_1.default.equal(fullBoard.pendingWinCheck, true);
        strict_1.default.equal(fullBoard.outcome, null);
        const winState = (0, game_engine_1.advanceGame)(fullBoard, 'up', 140, { next: () => 0 });
        strict_1.default.equal(winState.isOver, true);
        strict_1.default.equal(winState.outcome, 'win');
    });
});
