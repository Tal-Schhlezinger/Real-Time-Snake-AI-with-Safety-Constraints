import { coordFromNodeId } from '../core/coords.js';
const PORTAL_COLORS = ['#f97316', '#06b6d4', '#ef4444', '#84cc16', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899'];
function centerOf(cell, cellSize) {
    return {
        x: cell.x * cellSize + cellSize / 2,
        y: cell.y * cellSize + cellSize / 2
    };
}
function colorForPortal(index) {
    return PORTAL_COLORS[index % PORTAL_COLORS.length];
}
export class CanvasRenderer {
    canvas;
    constructor(canvas) {
        this.canvas = canvas;
    }
    configure(mapWidth, mapHeight, cellSize) {
        this.canvas.width = mapWidth * cellSize;
        this.canvas.height = mapHeight * cellSize;
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('2D canvas context is unavailable.');
        }
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        return context;
    }
    drawBoardBase(context, mapWidth, mapHeight, cellSize) {
        context.fillStyle = '#f7f1df';
        context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        context.strokeStyle = 'rgba(80, 60, 20, 0.12)';
        context.lineWidth = 1;
        for (let x = 0; x <= mapWidth; x += 1) {
            context.beginPath();
            context.moveTo(x * cellSize, 0);
            context.lineTo(x * cellSize, this.canvas.height);
            context.stroke();
        }
        for (let y = 0; y <= mapHeight; y += 1) {
            context.beginPath();
            context.moveTo(0, y * cellSize);
            context.lineTo(this.canvas.width, y * cellSize);
            context.stroke();
        }
    }
    drawWalls(context, walls, cellSize) {
        context.fillStyle = '#2f3437';
        for (const wall of walls) {
            context.fillRect(wall.x * cellSize + 2, wall.y * cellSize + 2, cellSize - 4, cellSize - 4);
        }
    }
    drawPortals(context, portals, cellSize, showLinks) {
        portals.forEach((portal, index) => {
            const color = colorForPortal(index);
            for (const cell of [portal.a, portal.b]) {
                context.fillStyle = color;
                context.fillRect(cell.x * cellSize + 4, cell.y * cellSize + 4, cellSize - 8, cellSize - 8);
                context.fillStyle = '#fff9f2';
                context.font = `${Math.max(10, Math.floor(cellSize * 0.32))}px "Trebuchet MS", "Segoe UI", sans-serif`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(portal.id.replace('portal-', 'P'), cell.x * cellSize + cellSize / 2, cell.y * cellSize + cellSize / 2);
            }
            if (showLinks) {
                const start = centerOf(portal.a, cellSize);
                const end = centerOf(portal.b, cellSize);
                context.strokeStyle = color;
                context.setLineDash([6, 6]);
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(start.x, start.y);
                context.lineTo(end.x, end.y);
                context.stroke();
                context.setLineDash([]);
            }
        });
    }
    drawGraphOverlay(context, graph, cellSize) {
        if (!graph) {
            return;
        }
        context.strokeStyle = 'rgba(16, 76, 66, 0.18)';
        context.lineWidth = 2;
        for (const edge of graph.edges) {
            const from = centerOf(coordFromNodeId(edge.from), cellSize);
            const to = centerOf(coordFromNodeId(edge.to), cellSize);
            context.beginPath();
            if (edge.kind === 'portal') {
                const midX = (from.x + to.x) / 2;
                const midY = Math.min(from.y, to.y) - cellSize * 0.35;
                context.moveTo(from.x, from.y);
                context.quadraticCurveTo(midX, midY, to.x, to.y);
            }
            else {
                context.moveTo(from.x, from.y);
                context.lineTo(to.x, to.y);
            }
            context.stroke();
        }
        context.fillStyle = '#1d4d42';
        for (const node of graph.nodes) {
            const center = centerOf({ x: node.x, y: node.y }, cellSize);
            context.beginPath();
            context.arc(center.x, center.y, Math.max(2, Math.floor(cellSize * 0.1)), 0, Math.PI * 2);
            context.fill();
        }
    }
    drawPathOverlay(context, path, cellSize, strokeStyle, closed) {
        if (path.length === 0) {
            return;
        }
        context.strokeStyle = strokeStyle;
        context.lineWidth = Math.max(2, Math.floor(cellSize * 0.12));
        context.beginPath();
        const first = centerOf(coordFromNodeId(path[0]), cellSize);
        context.moveTo(first.x, first.y);
        for (let index = 1; index < path.length; index += 1) {
            const point = centerOf(coordFromNodeId(path[index]), cellSize);
            context.lineTo(point.x, point.y);
        }
        if (closed) {
            context.lineTo(first.x, first.y);
        }
        context.stroke();
    }
    drawCycleOverlay(context, cycle, cellSize) {
        this.drawPathOverlay(context, cycle, cellSize, 'rgba(194, 123, 15, 0.62)', true);
    }
    drawHover(context, hoverCell, cellSize) {
        if (!hoverCell) {
            return;
        }
        context.fillStyle = 'rgba(18, 110, 90, 0.14)';
        context.fillRect(hoverCell.x * cellSize, hoverCell.y * cellSize, cellSize, cellSize);
    }
    drawGame(state, options) {
        const context = this.configure(state.map.width, state.map.height, options.cellSize);
        this.drawBoardBase(context, state.map.width, state.map.height, options.cellSize);
        this.drawWalls(context, state.map.walls, options.cellSize);
        this.drawPortals(context, state.map.portals, options.cellSize, true);
        if (options.showCycle) {
            this.drawCycleOverlay(context, state.map.hamiltonianCycle, options.cellSize);
        }
        if (options.showAiPath) {
            this.drawPathOverlay(context, state.aiPlannedPath, options.cellSize, 'rgba(11, 133, 94, 0.8)', false);
        }
        if (state.appleNodeId) {
            const apple = coordFromNodeId(state.appleNodeId);
            const center = centerOf(apple, options.cellSize);
            context.fillStyle = '#e63946';
            context.beginPath();
            context.arc(center.x, center.y, options.cellSize * 0.24, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = '#8c271e';
            context.fillRect(center.x - 2, center.y - options.cellSize * 0.28, 4, 8);
        }
        state.snake.segments
            .slice()
            .reverse()
            .forEach((nodeId, reverseIndex) => {
            const segment = coordFromNodeId(nodeId);
            const drawIndex = state.snake.segments.length - reverseIndex - 1;
            context.fillStyle = drawIndex === 0 ? '#126e5a' : `rgba(28, 122, 82, ${0.45 + reverseIndex / Math.max(2, state.snake.segments.length)})`;
            context.fillRect(segment.x * options.cellSize + 3, segment.y * options.cellSize + 3, options.cellSize - 6, options.cellSize - 6);
        });
    }
    drawDesigner(model, options) {
        const context = this.configure(model.mapWidth, model.mapHeight, options.cellSize);
        this.drawBoardBase(context, model.mapWidth, model.mapHeight, options.cellSize);
        this.drawWalls(context, model.walls, options.cellSize);
        this.drawPortals(context, model.portals, options.cellSize, options.showPortalLinks);
        if (options.showGraph) {
            this.drawGraphOverlay(context, model.graph, options.cellSize);
        }
        if (options.showCycle) {
            this.drawCycleOverlay(context, model.cycle, options.cellSize);
        }
        if (model.snakeSpawn) {
            const center = centerOf(model.snakeSpawn, options.cellSize);
            context.fillStyle = '#126e5a';
            context.beginPath();
            context.arc(center.x, center.y, options.cellSize * 0.28, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = '#f7f1df';
            context.lineWidth = 2;
            context.beginPath();
            context.arc(center.x, center.y, options.cellSize * 0.14, 0, Math.PI * 2);
            context.stroke();
        }
        this.drawHover(context, options.hoverCell, options.cellSize);
    }
}
