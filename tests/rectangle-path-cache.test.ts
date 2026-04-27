import assert from 'node:assert/strict';
import {
  buildRectanglePathCache,
  getRectanglePaths,
  localCoord,
  localIndex,
  validateLocalHamiltonianPath
} from '../src/core/rectangle-path-cache';
import { describe, it } from './testkit';

function assertEveryPathIsValid(
  width: number,
  height: number,
  terminalA: number,
  terminalB: number,
  paths: number[][]
): void {
  for (const path of paths) {
    assert.equal(path[0], terminalA);
    assert.equal(path[path.length - 1], terminalB);
    assert.equal(new Set(path).size, width * height);
    assert.equal(validateLocalHamiltonianPath(width, height, path, terminalA, terminalB), true);
  }
}

describe('Rectangle path cache', () => {
  it('localIndex/localCoord round trip', () => {
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = localIndex(x, y, 5);
        assert.deepEqual(localCoord(index, 5), { x, y });
      }
    }
  });

  it('valid path validates', () => {
    assert.equal(validateLocalHamiltonianPath(2, 3, [0, 1, 3, 5, 4, 2], 0, 2), true);
  });

  it('path with duplicate cell fails validation', () => {
    assert.equal(validateLocalHamiltonianPath(2, 3, [0, 1, 3, 5, 4, 4], 0, 4), false);
  });

  it('path missing a cell fails validation', () => {
    assert.equal(validateLocalHamiltonianPath(2, 3, [0, 1, 3, 5, 4], 0, 4), false);
  });

  it('path with non-adjacent step fails validation', () => {
    assert.equal(validateLocalHamiltonianPath(2, 3, [0, 3, 1, 5, 4, 2], 0, 2), false);
  });

  it('2x3 cache returns at least one Hamiltonian path for a possible terminal pair', () => {
    const paths = getRectanglePaths(2, 3, 0, 2);

    assert.ok(paths.length > 0);
    assertEveryPathIsValid(2, 3, 0, 2, paths);
  });

  it('impossible terminal pair returns an empty list', () => {
    const paths = getRectanglePaths(2, 2, 0, 3);

    assert.deepEqual(paths, []);
  });

  it('every returned path starts and ends at requested terminals and visits every cell exactly once', () => {
    const paths = getRectanglePaths(2, 4, 0, 6);

    assert.ok(paths.length > 0);
    assertEveryPathIsValid(2, 4, 0, 6, paths);
  });

  it('maxArea is respected', () => {
    const cache = buildRectanglePathCache({ maxArea: 5 });
    const paths = cache.getPaths(2, 3, 0, 2);

    assert.deepEqual(paths, []);
    assert.deepEqual(cache.getLastDiagnostics(), {
      width: 2,
      height: 3,
      terminalA: 0,
      terminalB: 2,
      area: 6,
      searchAttempted: false,
      unsupported: true,
      nodesExpanded: 0,
      budgetExhausted: false,
      pathsFound: 0
    });
  });

  it('maxPathsPerTerminalPair is respected', () => {
    const paths = getRectanglePaths(3, 3, 0, 8, { maxPathsPerTerminalPair: 2 });

    assert.equal(paths.length, 2);
    assertEveryPathIsValid(3, 3, 0, 8, paths);
  });

  it('output is deterministic across repeated calls', () => {
    const first = getRectanglePaths(3, 3, 0, 8, { maxPathsPerTerminalPair: 8 });
    const second = getRectanglePaths(3, 3, 0, 8, { maxPathsPerTerminalPair: 8 });
    const cache = buildRectanglePathCache({ maxPathsPerTerminalPair: 8 });
    const fromCacheFirst = cache.getPaths(3, 3, 0, 8);
    const fromCacheSecond = cache.getPaths(3, 3, 0, 8);

    assert.deepEqual(first, second);
    assert.deepEqual(fromCacheFirst, fromCacheSecond);
    assert.deepEqual(first, fromCacheFirst);
  });
});
