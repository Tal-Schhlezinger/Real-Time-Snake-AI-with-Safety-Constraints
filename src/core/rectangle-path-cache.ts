export type LocalCoord = {
  x: number;
  y: number;
};

export type RectanglePathCacheOptions = {
  maxArea?: number;
  maxPathsPerTerminalPair?: number;
  maxExpansions?: number;
  includeReverseLookup?: boolean;
};

export type RectanglePathSearchDiagnostics = {
  width: number;
  height: number;
  terminalA: number;
  terminalB: number;
  area: number;
  searchAttempted: boolean;
  unsupported: boolean;
  nodesExpanded: number;
  budgetExhausted: boolean;
  pathsFound: number;
};

type NormalizedRectanglePathCacheOptions = Required<RectanglePathCacheOptions>;

const DEFAULT_OPTIONS: NormalizedRectanglePathCacheOptions = {
  maxArea: 20,
  maxPathsPerTerminalPair: 64,
  maxExpansions: 100_000,
  includeReverseLookup: true
};

export function localIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function localCoord(index: number, width: number): LocalCoord {
  return {
    x: index % width,
    y: Math.floor(index / width)
  };
}

export function validateLocalHamiltonianPath(
  width: number,
  height: number,
  path: number[],
  terminalA: number,
  terminalB: number
): boolean {
  const area = width * height;

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return false;
  }

  if (path.length !== area || path[0] !== terminalA || path[path.length - 1] !== terminalB) {
    return false;
  }

  const seen = new Set<number>();

  for (let i = 0; i < path.length; i += 1) {
    const current = path[i]!;

    if (!isValidLocalIndex(current, area) || seen.has(current)) {
      return false;
    }

    seen.add(current);

    if (i > 0 && !areAdjacent(path[i - 1]!, current, width)) {
      return false;
    }
  }

  return seen.size === area;
}

export class RectanglePathCache {
  private readonly options: NormalizedRectanglePathCacheOptions;
  private readonly cache = new Map<string, number[][]>();
  private lastDiagnostics: RectanglePathSearchDiagnostics | null = null;

  constructor(options: RectanglePathCacheOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    };
  }

  getPaths(width: number, height: number, terminalA: number, terminalB: number): number[][] {
    const key = cacheKey(width, height, terminalA, terminalB);
    const cached = this.cache.get(key);

    if (cached) {
      this.lastDiagnostics = createDiagnostics(width, height, terminalA, terminalB, {
        searchAttempted: false,
        unsupported: false,
        nodesExpanded: 0,
        budgetExhausted: false,
        pathsFound: cached.length
      });
      return clonePaths(cached);
    }

    const area = width * height;
    const invalidShape =
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      area > this.options.maxArea ||
      !isValidLocalIndex(terminalA, area) ||
      !isValidLocalIndex(terminalB, area);

    if (invalidShape) {
      this.lastDiagnostics = createDiagnostics(width, height, terminalA, terminalB, {
        searchAttempted: false,
        unsupported: true,
        nodesExpanded: 0,
        budgetExhausted: false,
        pathsFound: 0
      });
      this.cache.set(key, []);
      return [];
    }

    const result = enumeratePaths(width, height, terminalA, terminalB, this.options);
    this.cache.set(key, result.paths);

    if (this.options.includeReverseLookup) {
      const reverseKey = cacheKey(width, height, terminalB, terminalA);
      if (!this.cache.has(reverseKey)) {
        this.cache.set(
          reverseKey,
          result.paths.map((path) => [...path].reverse())
        );
      }
    }

    this.lastDiagnostics = createDiagnostics(width, height, terminalA, terminalB, {
      searchAttempted: true,
      unsupported: false,
      nodesExpanded: result.nodesExpanded,
      budgetExhausted: result.budgetExhausted,
      pathsFound: result.paths.length
    });

    return clonePaths(result.paths);
  }

  getLastDiagnostics(): RectanglePathSearchDiagnostics | null {
    return this.lastDiagnostics ? { ...this.lastDiagnostics } : null;
  }
}

export function buildRectanglePathCache(options: RectanglePathCacheOptions = {}): RectanglePathCache {
  return new RectanglePathCache(options);
}

export function getRectanglePaths(
  width: number,
  height: number,
  terminalA: number,
  terminalB: number,
  options: RectanglePathCacheOptions = {}
): number[][] {
  return buildRectanglePathCache(options).getPaths(width, height, terminalA, terminalB);
}

function enumeratePaths(
  width: number,
  height: number,
  terminalA: number,
  terminalB: number,
  options: NormalizedRectanglePathCacheOptions
): { paths: number[][]; nodesExpanded: number; budgetExhausted: boolean } {
  const area = width * height;
  const paths: number[][] = [];
  const visited = new Set<number>([terminalA]);
  const path = [terminalA];
  let nodesExpanded = 0;
  let budgetExhausted = false;

  const dfs = (current: number): void => {
    if (paths.length >= options.maxPathsPerTerminalPair || budgetExhausted) {
      return;
    }

    if (nodesExpanded >= options.maxExpansions) {
      budgetExhausted = true;
      return;
    }

    nodesExpanded += 1;

    if (path.length === area) {
      if (current === terminalB) {
        paths.push([...path]);
      }
      return;
    }

    if (!remainingCellsAreConnected(width, height, current, terminalB, visited)) {
      return;
    }

    const candidates = neighborsOf(current, width, height)
      .filter((neighbor) => !visited.has(neighbor))
      .filter((neighbor) => neighbor !== terminalB || path.length === area - 1)
      .sort((a, b) => {
        const degreeA = onwardDegree(a, width, height, visited, terminalB, path.length + 1, area);
        const degreeB = onwardDegree(b, width, height, visited, terminalB, path.length + 1, area);
        return degreeA - degreeB || a - b;
      });

    for (const candidate of candidates) {
      visited.add(candidate);
      path.push(candidate);
      dfs(candidate);
      path.pop();
      visited.delete(candidate);

      if (paths.length >= options.maxPathsPerTerminalPair || budgetExhausted) {
        break;
      }
    }
  };

  dfs(terminalA);

  return {
    paths,
    nodesExpanded,
    budgetExhausted
  };
}

function remainingCellsAreConnected(
  width: number,
  height: number,
  current: number,
  terminalB: number,
  visited: Set<number>
): boolean {
  const area = width * height;
  const allowed = new Set<number>([current]);

  for (let index = 0; index < area; index += 1) {
    if (!visited.has(index) || index === terminalB) {
      allowed.add(index);
    }
  }

  const stack = [current];
  const seen = new Set<number>();

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node)) {
      continue;
    }

    seen.add(node);

    for (const neighbor of neighborsOf(node, width, height)) {
      if (allowed.has(neighbor) && !seen.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return seen.size === allowed.size;
}

function onwardDegree(
  index: number,
  width: number,
  height: number,
  visited: Set<number>,
  terminalB: number,
  nextPathLength: number,
  area: number
): number {
  let degree = 0;

  for (const neighbor of neighborsOf(index, width, height)) {
    if (visited.has(neighbor)) {
      continue;
    }

    if (neighbor === terminalB && nextPathLength !== area - 1) {
      continue;
    }

    degree += 1;
  }

  return degree;
}

function neighborsOf(index: number, width: number, height: number): number[] {
  const { x, y } = localCoord(index, width);
  const neighbors: number[] = [];

  if (x > 0) {
    neighbors.push(localIndex(x - 1, y, width));
  }
  if (x < width - 1) {
    neighbors.push(localIndex(x + 1, y, width));
  }
  if (y > 0) {
    neighbors.push(localIndex(x, y - 1, width));
  }
  if (y < height - 1) {
    neighbors.push(localIndex(x, y + 1, width));
  }

  return neighbors;
}

function areAdjacent(a: number, b: number, width: number): boolean {
  const coordA = localCoord(a, width);
  const coordB = localCoord(b, width);
  return Math.abs(coordA.x - coordB.x) + Math.abs(coordA.y - coordB.y) === 1;
}

function isValidLocalIndex(index: number, area: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < area;
}

function cacheKey(width: number, height: number, terminalA: number, terminalB: number): string {
  return `${width}x${height}:${terminalA}->${terminalB}`;
}

function clonePaths(paths: number[][]): number[][] {
  return paths.map((path) => [...path]);
}

function createDiagnostics(
  width: number,
  height: number,
  terminalA: number,
  terminalB: number,
  details: Pick<
    RectanglePathSearchDiagnostics,
    'searchAttempted' | 'unsupported' | 'nodesExpanded' | 'budgetExhausted' | 'pathsFound'
  >
): RectanglePathSearchDiagnostics {
  return {
    width,
    height,
    terminalA,
    terminalB,
    area: width * height,
    ...details
  };
}
