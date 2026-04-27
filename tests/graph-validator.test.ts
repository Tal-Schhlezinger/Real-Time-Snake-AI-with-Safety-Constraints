import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { buildGraphFromDraft } from '../src/core/graph';
import { validateDraftMap, validateHamiltonianCycle, validateLoadedMap } from '../src/core/map-validator';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { nodeIdForCoord } from '../src/core/coords';
import { makeDraft } from './helpers';

describe('graph generation and map validation', () => {
  it('builds graph nodes and portal edges from the grid', () => {
    const draft = makeDraft({
      width: 5,
      height: 4,
      walls: [{ x: 2, y: 0 }],
      portals: [{ id: 'portal-a', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } }],
      snakeSpawn: { x: 0, y: 0 }
    });

    const result = buildGraphFromDraft(draft);
    const nodeIds = result.graph.nodes.map((node) => node.id);
    const portalEdge = result.graph.edges.find(
      (edge) => edge.from === nodeIdForCoord({ x: 0, y: 1 }) && edge.direction === 'right'
    );

    assert.equal(nodeIds.includes(nodeIdForCoord({ x: 1, y: 1 })), false);
    assert.equal(nodeIds.includes(nodeIdForCoord({ x: 3, y: 1 })), false);
    assert.equal(nodeIds.includes(nodeIdForCoord({ x: 2, y: 0 })), false);
    assert.equal(portalEdge?.to, nodeIdForCoord({ x: 4, y: 1 }));
    assert.equal(portalEdge?.kind, 'portal');
  });

  it('rejects a saved map when the saved graph no longer matches the grid', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const corrupted = {
      ...map,
      graph: {
        nodes: map.graph.nodes.slice(0, -1),
        edges: map.graph.edges
      }
    };

    const result = validateLoadedMap(corrupted);

    assert.equal(result.isValid, false);
    assert.equal(result.reasons.some((reason) => reason.code === 'graph-grid-mismatch'), true);
  });

  it('accepts a valid Hamiltonian-cycle map', () => {
    const draft = makeDraft({
      width: 4,
      height: 4,
      snakeSpawn: { x: 0, y: 0 }
    });

    const result = validateDraftMap(draft, { timeLimitMs: 2_000 });

    assert.equal(result.isValid, true);
    assert.equal(result.cycle.length, result.graph.nodes.length);
  });

  it('rejects a disconnected playable graph', () => {
    const draft = makeDraft({
      width: 4,
      height: 4,
      walls: [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 1, y: 3 }
      ],
      snakeSpawn: { x: 0, y: 0 }
    });

    const result = validateDraftMap(draft, { timeLimitMs: 2_000 });

    assert.equal(result.isValid, false);
    assert.equal(result.reasons.some((reason) => reason.code === 'disconnected-playable-graph'), true);
  });

  it('rejects a map with a dead-end cell', () => {
    const draft = makeDraft({
      width: 4,
      height: 4,
      walls: [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 2, y: 1 }
      ],
      snakeSpawn: { x: 1, y: 1 }
    });

    const result = validateDraftMap(draft, { timeLimitMs: 2_000 });

    assert.equal(result.isValid, false);
    assert.equal(result.reasons.some((reason) => reason.code === 'dead-end-cell'), true);
  });

  it('rejects a map with a bridge / cut edge when applicable', () => {
    const draft = makeDraft({
      width: 6,
      height: 2,
      walls: [
        { x: 2, y: 1 },
        { x: 3, y: 1 }
      ],
      snakeSpawn: { x: 0, y: 0 }
    });

    const result = validateDraftMap(draft, { timeLimitMs: 2_000 });

    assert.equal(result.isValid, false);
    assert.equal(result.reasons.some((reason) => reason.code === 'bridge-edge'), true);
  });

  it('rejects a connected non-Hamiltonian map', () => {
    const draft = makeDraft({
      width: 3,
      height: 3,
      snakeSpawn: { x: 0, y: 0 }
    });

    const result = validateDraftMap(draft, { timeLimitMs: 2_000 });

    assert.equal(result.isValid, false);
    assert.equal(result.reasons.some((reason) => reason.code === 'no-hamiltonian-cycle'), true);
  });

  it('stores a Hamiltonian cycle that visits every playable node exactly once and uses only legal edges', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });

    assert.equal(new Set(map.hamiltonianCycle).size, map.graph.nodes.length);
    assert.equal(validateHamiltonianCycle(map.graph, map.hamiltonianCycle), true);
  });
});
