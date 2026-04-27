"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultMaps = createDefaultMaps;
const rectangular_cycle_js_1 = require("../core/rectangular-cycle.js");
function createDefaultMaps() {
    return [
        (0, rectangular_cycle_js_1.createRectangularSavedMap)({
            id: 'classic-12x8',
            name: 'Classic 12x8',
            width: 12,
            height: 8
        }),
        (0, rectangular_cycle_js_1.createRectangularSavedMap)({
            id: 'compact-8x8',
            name: 'Compact 8x8',
            width: 8,
            height: 8
        }),
        (0, rectangular_cycle_js_1.createRectangularSavedMap)({
            id: 'wide-10x6',
            name: 'Wide 10x6',
            width: 10,
            height: 6
        })
    ];
}
