import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { collectSpawnableNodeIds } from '../src/core/apple-spawner';
import { advanceGame } from '../src/core/game-engine';
import { nodeIdForCoord } from '../src/core/coords';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { makeDraft, makeGameState, makeSavedMap } from './helpers';

describe('game engine', () => {
  it('moves the snake one cell per tick', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      snake: {
        segments: [nodeIdForCoord({ x: 0, y: 0 })],
        direction: 'right',
        pendingGrowth: 0
      }
    });

    const next = advanceGame(state, 'right', 140);

    assert.equal(next.snake.segments[0], nodeIdForCoord({ x: 1, y: 0 }));
    assert.equal(next.elapsedMs, 140);
  });

  it('grows after eating an apple', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      snake: {
        segments: [nodeIdForCoord({ x: 0, y: 0 })],
        direction: 'right',
        pendingGrowth: 0
      },
      appleNodeId: nodeIdForCoord({ x: 1, y: 0 })
    });

    const next = advanceGame(state, 'right', 140, { next: () => 0 });

    assert.equal(next.snake.segments.length, 2);
    assert.equal(next.applesEaten, 1);
    assert.equal(next.finalAppleTimeMs, 140);
  });

  it('spawns apples only on legal free graph cells', () => {
    const draft = makeDraft({
      width: 5,
      height: 4,
      walls: [{ x: 2, y: 0 }],
      portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } }],
      snakeSpawn: { x: 0, y: 0 }
    });
    const map = makeSavedMap(draft);
    const occupied = [nodeIdForCoord({ x: 0, y: 0 }), nodeIdForCoord({ x: 0, y: 1 })];

    const spawnable = collectSpawnableNodeIds(map.graph, occupied);

    assert.equal(spawnable.includes(nodeIdForCoord({ x: 2, y: 0 })), false);
    assert.equal(spawnable.includes(nodeIdForCoord({ x: 1, y: 1 })), false);
    assert.equal(spawnable.includes(nodeIdForCoord({ x: 3, y: 1 })), false);
    assert.equal(spawnable.includes(nodeIdForCoord({ x: 0, y: 0 })), false);
    assert.equal(spawnable.includes(nodeIdForCoord({ x: 4, y: 1 })), true);
  });

  it('loses on wall collision', () => {
    const map = makeSavedMap(
      makeDraft({
        width: 4,
        height: 4,
        walls: [{ x: 1, y: 0 }]
      })
    );
    const state = makeGameState({
      map,
      snake: {
        segments: [nodeIdForCoord({ x: 0, y: 0 })],
        direction: 'right',
        pendingGrowth: 0
      }
    });

    const next = advanceGame(state, 'right', 140);

    assert.equal(next.isOver, true);
    assert.equal(next.deathReason, 'wall');
  });

  it('loses on self collision', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      snake: {
        segments: [
          nodeIdForCoord({ x: 2, y: 1 }),
          nodeIdForCoord({ x: 1, y: 1 }),
          nodeIdForCoord({ x: 1, y: 2 }),
          nodeIdForCoord({ x: 2, y: 2 })
        ],
        direction: 'left',
        pendingGrowth: 0
      }
    });

    const next = advanceGame(state, 'left', 140);

    assert.equal(next.isOver, true);
    assert.equal(next.deathReason, 'self');
  });

  it('loses on out-of-bounds collision', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const state = makeGameState({
      map,
      snake: {
        segments: [nodeIdForCoord({ x: 0, y: 0 })],
        direction: 'left',
        pendingGrowth: 0
      }
    });

    const next = advanceGame(state, 'left', 140);

    assert.equal(next.isOver, true);
    assert.equal(next.deathReason, 'out-of-bounds');
  });

  it('teleports through portals', () => {
    const map = makeSavedMap(
      makeDraft({
        width: 5,
        height: 4,
        portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } }],
        snakeSpawn: { x: 0, y: 1 }
      })
    );
    const state = makeGameState({
      map,
      snake: {
        segments: [nodeIdForCoord({ x: 0, y: 1 })],
        direction: 'right',
        pendingGrowth: 0
      }
    });

    const next = advanceGame(state, 'right', 140);

    assert.equal(next.snake.segments[0], nodeIdForCoord({ x: 4, y: 1 }));
    assert.equal(next.lastMove?.edgeKind, 'portal');
  });

  it('dies on invalid portal teleport', () => {
    const map = makeSavedMap(
      makeDraft({
        width: 5,
        height: 4,
        portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 4, y: 1 } }],
        snakeSpawn: { x: 0, y: 1 }
      })
    );
    const state = makeGameState({
      map,
      snake: {
        segments: [nodeIdForCoord({ x: 0, y: 1 })],
        direction: 'right',
        pendingGrowth: 0
      }
    });

    const next = advanceGame(state, 'right', 140);

    assert.equal(next.isOver, true);
    assert.equal(next.deathReason, 'invalid-portal');
  });

  it('requires one extra legal move to win after filling the board', () => {
    const map = createRectangularSavedMap({ id: 'tiny', name: 'Tiny', width: 2, height: 2 });
    const fillState = makeGameState({
      map,
      snake: {
        segments: [
          nodeIdForCoord({ x: 1, y: 1 }),
          nodeIdForCoord({ x: 1, y: 0 }),
          nodeIdForCoord({ x: 0, y: 0 })
        ],
        direction: 'left',
        pendingGrowth: 0
      },
      appleNodeId: nodeIdForCoord({ x: 0, y: 1 }),
      applesEaten: 2
    });

    const fullBoard = advanceGame(fillState, 'left', 140, { next: () => 0 });
    assert.equal(fullBoard.isOver, false);
    assert.equal(fullBoard.pendingWinCheck, true);
    assert.equal(fullBoard.outcome, null);

    const winState = advanceGame(fullBoard, 'up', 140, { next: () => 0 });
    assert.equal(winState.isOver, true);
    assert.equal(winState.outcome, 'win');
  });
});
