"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RectanglePathCache = void 0;
exports.localIndex = localIndex;
exports.localCoord = localCoord;
exports.validateLocalHamiltonianPath = validateLocalHamiltonianPath;
exports.buildRectanglePathCache = buildRectanglePathCache;
exports.getRectanglePaths = getRectanglePaths;
const DEFAULT_OPTIONS = {
    maxArea: 20,
    maxPathsPerTerminalPair: 64,
    maxExpansions: 100_000,
    includeReverseLookup: true
};
function localIndex(x, y, width) {
    return y * width + x;
}
function localCoord(index, width) {
    return {
        x: index % width,
        y: Math.floor(index / width)
    };
}
function validateLocalHamiltonianPath(width, height, path, terminalA, terminalB) {
    const area = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        return false;
    }
    if (path.length !== area || path[0] !== terminalA || path[path.length - 1] !== terminalB) {
        return false;
    }
    const seen = new Set();
    for (let i = 0; i < path.length; i += 1) {
        const current = path[i];
        if (!isValidLocalIndex(current, area) || seen.has(current)) {
            return false;
        }
        seen.add(current);
        if (i > 0 && !areAdjacent(path[i - 1], current, width)) {
            return false;
        }
    }
    return seen.size === area;
}
class RectanglePathCache {
    options;
    cache = new Map();
    lastDiagnostics = null;
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options
        };
    }
    getPaths(width, height, terminalA, terminalB) {
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
        const invalidShape = !Number.isInteger(width) ||
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
                this.cache.set(reverseKey, result.paths.map((path) => [...path].reverse()));
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
    getLastDiagnostics() {
        return this.lastDiagnostics ? { ...this.lastDiagnostics } : null;
    }
}
exports.RectanglePathCache = RectanglePathCache;
function buildRectanglePathCache(options = {}) {
    return new RectanglePathCache(options);
}
function getRectanglePaths(width, height, terminalA, terminalB, options = {}) {
    return buildRectanglePathCache(options).getPaths(width, height, terminalA, terminalB);
}
function enumeratePaths(width, height, terminalA, terminalB, options) {
    const area = width * height;
    const paths = [];
    const visited = new Set([terminalA]);
    const path = [terminalA];
    let nodesExpanded = 0;
    let budgetExhausted = false;
    const dfs = (current) => {
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
function remainingCellsAreConnected(width, height, current, terminalB, visited) {
    const area = width * height;
    const allowed = new Set([current]);
    for (let index = 0; index < area; index += 1) {
        if (!visited.has(index) || index === terminalB) {
            allowed.add(index);
        }
    }
    const stack = [current];
    const seen = new Set();
    while (stack.length > 0) {
        const node = stack.pop();
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
function onwardDegree(index, width, height, visited, terminalB, nextPathLength, area) {
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
function neighborsOf(index, width, height) {
    const { x, y } = localCoord(index, width);
    const neighbors = [];
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
function areAdjacent(a, b, width) {
    const coordA = localCoord(a, width);
    const coordB = localCoord(b, width);
    return Math.abs(coordA.x - coordB.x) + Math.abs(coordA.y - coordB.y) === 1;
}
function isValidLocalIndex(index, area) {
    return Number.isInteger(index) && index >= 0 && index < area;
}
function cacheKey(width, height, terminalA, terminalB) {
    return `${width}x${height}:${terminalA}->${terminalB}`;
}
function clonePaths(paths) {
    return paths.map((path) => [...path]);
}
function createDiagnostics(width, height, terminalA, terminalB, details) {
    return {
        width,
        height,
        terminalA,
        terminalB,
        area: width * height,
        ...details
    };
}
