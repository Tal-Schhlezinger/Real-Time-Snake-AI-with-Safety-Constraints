"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHorizontalSerpentineCycle = generateHorizontalSerpentineCycle;
exports.generateVerticalSerpentineCycle = generateVerticalSerpentineCycle;
exports.transformRectangleCycle = transformRectangleCycle;
exports.generateEmptyRectangleCycle = generateEmptyRectangleCycle;
exports.createRectangularSavedMap = createRectangularSavedMap;
exports.buildGraphForCycleSnapshot = buildGraphForCycleSnapshot;
const graph_js_1 = require("./graph.js");
const coords_js_1 = require("./coords.js");
function generateEvenWidthCycle(width, height) {
    const coords = [{ x: 0, y: 0 }];
    for (let x = 1; x < width; x += 1) {
        coords.push({ x, y: 0 });
    }
    for (let y = 1; y < height; y += 1) {
        if (y % 2 === 1) {
            coords.push({ x: width - 1, y });
            for (let x = width - 2; x >= 1; x -= 1) {
                coords.push({ x, y });
            }
        }
        else {
            coords.push({ x: 1, y });
            for (let x = 2; x < width; x += 1) {
                coords.push({ x, y });
            }
        }
    }
    for (let y = height - 1; y >= 1; y -= 1) {
        coords.push({ x: 0, y });
    }
    return coords;
}
function generateHorizontalSerpentineCycle(width, height) {
    if (width < 2 || height < 2 || width % 2 !== 0) {
        return null;
    }
    return generateEvenWidthCycle(width, height).map(coords_js_1.nodeIdForCoord);
}
function generateVerticalSerpentineCycle(width, height) {
    if (width < 2 || height < 2 || height % 2 !== 0) {
        return null;
    }
    return generateEvenWidthCycle(height, width)
        .map((coord) => ({ x: coord.y, y: coord.x }))
        .map(coords_js_1.nodeIdForCoord);
}
function transformRectangleCycle(cycle, width, height, transform) {
    return cycle.map((nodeId) => (0, coords_js_1.nodeIdForCoord)(transform((0, coords_js_1.coordFromNodeId)(nodeId), width, height)));
}
function generateEmptyRectangleCycle(width, height) {
    return generateHorizontalSerpentineCycle(width, height) ?? generateVerticalSerpentineCycle(width, height);
}
function createRectangularSavedMap(options) {
    const draft = {
        id: options.id,
        name: options.name,
        width: options.width,
        height: options.height,
        walls: [],
        portals: [],
        snakeSpawn: options.snakeSpawn ?? { x: 0, y: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const graph = (0, graph_js_1.buildGraphFromDraft)(draft).graph;
    const cycle = generateEmptyRectangleCycle(options.width, options.height);
    if (!cycle) {
        throw new Error(`Cannot generate a rectangle Hamiltonian cycle for ${options.width}x${options.height}.`);
    }
    return {
        ...draft,
        snakeSpawn: draft.snakeSpawn,
        graph,
        hamiltonianCycle: cycle
    };
}
function buildGraphForCycleSnapshot(graph, cycle) {
    return {
        nodes: graph.nodes,
        edges: graph.edges.filter((edge) => cycle.includes(edge.from) && cycle.includes(edge.to))
    };
}
