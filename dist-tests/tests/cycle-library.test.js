"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const cycle_library_1 = require("../src/core/cycle-library");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
(0, testkit_1.describe)('Cycle library', () => {
    (0, testkit_1.it)('horizontal serpentine validates on supported rectangles', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 6, height: 4 });
        const cycle = (0, rectangular_cycle_1.generateHorizontalSerpentineCycle)(map.width, map.height);
        strict_1.default.ok(cycle);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, cycle), true);
    });
    (0, testkit_1.it)('vertical serpentine validates on supported rectangles where possible', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 6 });
        const cycle = (0, rectangular_cycle_1.generateVerticalSerpentineCycle)(map.width, map.height);
        strict_1.default.ok(cycle);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, cycle), true);
    });
    (0, testkit_1.it)('supported open rectangles build a ready library with multiple archetype styles', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 6, height: 6 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 12 });
        strict_1.default.equal((0, cycle_library_1.isCycleLibrarySupportedMap)(map), true);
        strict_1.default.equal(library.status, 'ready');
        strict_1.default.equal(library.entries[0]?.id, (0, cycle_library_1.createBaseCycleLibraryEntryId)(map.id));
        strict_1.default.ok(library.entries.length >= 3);
        strict_1.default.equal(library.entries.every((entry) => (0, map_validator_1.validateHamiltonianCycle)(map.graph, entry.cycle)), true);
        strict_1.default.equal(new Set(library.entries.map((entry) => (0, cycle_library_1.cycleEdgeSignature)(entry.cycle))).size, library.entries.length);
        strict_1.default.equal(library.entries.slice(1).every((entry) => entry.minDistanceToAccepted >= 0.2), true);
        strict_1.default.equal(library.entries.some((entry) => entry.source === 'archetype'), true);
        strict_1.default.equal(library.entries.some((entry) => entry.archetypeName === 'vertical-serpentine'), true);
        strict_1.default.equal(library.diagnostics.generatedCycles, library.entries.filter((entry) => entry.source !== 'base').length);
        strict_1.default.equal(library.diagnostics.diversityDistances.length > 0, true);
        strict_1.default.equal(library.diagnostics.entryAttempts.length >= library.entries.length, true);
        strict_1.default.equal(library.diagnostics.entryAttempts.some((attempt) => attempt.archetypeName === 'horizontal-serpentine'), true);
        strict_1.default.equal(library.diagnostics.entryAttempts.some((attempt) => attempt.archetypeName === 'vertical-serpentine' && attempt.accepted), true);
    });
    (0, testkit_1.it)('cycleDistance is 0 for identical cycles and order distance distinguishes order variants', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const reversed = [map.hamiltonianCycle[0], ...map.hamiltonianCycle.slice(1).reverse()];
        strict_1.default.equal((0, cycle_library_1.cycleDistance)(map.hamiltonianCycle, map.hamiltonianCycle), 0);
        strict_1.default.ok((0, cycle_library_1.cycleDistance)(map.hamiltonianCycle, reversed) > 0);
        strict_1.default.ok((0, cycle_library_1.cycleOrderDistance)(map.hamiltonianCycle, reversed) > 0);
    });
    (0, testkit_1.it)('duplicate or reverse-equivalent archetypes are either deduplicated or diagnosed clearly', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map, { maxAttempts: 4, maxCycles: 6 });
        const reverseAttempt = library.diagnostics.entryAttempts.find((attempt) => attempt.archetypeName === 'horizontal-serpentine-reverse');
        strict_1.default.ok(reverseAttempt);
        strict_1.default.equal(['accepted', 'duplicate', 'low-diversity'].includes(reverseAttempt.rejectionReason), true);
    });
    (0, testkit_1.it)('unsupported maps return the base cycle only', () => {
        const map = {
            ...(0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 }),
            walls: [{ x: 1, y: 1 }]
        };
        const library = (0, cycle_library_1.generateDiverseHamiltonianCycles)(map);
        strict_1.default.equal((0, cycle_library_1.isCycleLibrarySupportedMap)(map), false);
        strict_1.default.equal(library.status, 'unsupported');
        strict_1.default.equal(library.entries.length, 1);
        strict_1.default.equal(library.entries[0]?.id, (0, cycle_library_1.createBaseCycleLibraryEntryId)(map.id));
        strict_1.default.equal(library.diagnostics.generatedCycles, 0);
    });
});
