import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import {
  createBaseCycleLibraryEntryId,
  cycleDistance,
  cycleEdgeSignature,
  cycleOrderDistance,
  generateDiverseHamiltonianCycles,
  isCycleLibrarySupportedMap
} from '../src/core/cycle-library';
import { validateHamiltonianCycle } from '../src/core/map-validator';
import {
  createRectangularSavedMap,
  generateHorizontalSerpentineCycle,
  generateVerticalSerpentineCycle
} from '../src/core/rectangular-cycle';

describe('Cycle library', () => {
  it('horizontal serpentine validates on supported rectangles', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 6, height: 4 });
    const cycle = generateHorizontalSerpentineCycle(map.width, map.height);

    assert.ok(cycle);
    assert.equal(validateHamiltonianCycle(map.graph, cycle), true);
  });

  it('vertical serpentine validates on supported rectangles where possible', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 6 });
    const cycle = generateVerticalSerpentineCycle(map.width, map.height);

    assert.ok(cycle);
    assert.equal(validateHamiltonianCycle(map.graph, cycle), true);
  });

  it('supported open rectangles build a ready library with multiple archetype styles', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 6, height: 6 });

    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 12 });

    assert.equal(isCycleLibrarySupportedMap(map), true);
    assert.equal(library.status, 'ready');
    assert.equal(library.entries[0]?.id, createBaseCycleLibraryEntryId(map.id));
    assert.ok(library.entries.length >= 3);
    assert.equal(library.entries.every((entry) => validateHamiltonianCycle(map.graph, entry.cycle)), true);
    assert.equal(new Set(library.entries.map((entry) => cycleEdgeSignature(entry.cycle))).size, library.entries.length);
    assert.equal(library.entries.slice(1).every((entry) => entry.minDistanceToAccepted >= 0.2), true);
    assert.equal(library.entries.some((entry) => entry.source === 'archetype'), true);
    assert.equal(library.entries.some((entry) => entry.archetypeName === 'vertical-serpentine'), true);
    assert.equal(library.diagnostics.generatedCycles, library.entries.filter((entry) => entry.source !== 'base').length);
    assert.equal(library.diagnostics.diversityDistances.length > 0, true);
    assert.equal(library.diagnostics.entryAttempts.length >= library.entries.length, true);
    assert.equal(
      library.diagnostics.entryAttempts.some((attempt) => attempt.archetypeName === 'horizontal-serpentine'),
      true
    );
    assert.equal(
      library.diagnostics.entryAttempts.some(
        (attempt) => attempt.archetypeName === 'vertical-serpentine' && attempt.accepted
      ),
      true
    );
  });

  it('cycleDistance is 0 for identical cycles and order distance distinguishes order variants', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const reversed = [map.hamiltonianCycle[0]!, ...map.hamiltonianCycle.slice(1).reverse()];

    assert.equal(cycleDistance(map.hamiltonianCycle, map.hamiltonianCycle), 0);
    assert.ok(cycleDistance(map.hamiltonianCycle, reversed) > 0);
    assert.ok(cycleOrderDistance(map.hamiltonianCycle, reversed) > 0);
  });

  it('duplicate or reverse-equivalent archetypes are either deduplicated or diagnosed clearly', () => {
    const map = createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 });
    const library = generateDiverseHamiltonianCycles(map, { maxAttempts: 4, maxCycles: 6 });
    const reverseAttempt = library.diagnostics.entryAttempts.find(
      (attempt) => attempt.archetypeName === 'horizontal-serpentine-reverse'
    );

    assert.ok(reverseAttempt);
    assert.equal(['accepted', 'duplicate', 'low-diversity'].includes(reverseAttempt.rejectionReason), true);
  });

  it('unsupported maps return the base cycle only', () => {
    const map = {
      ...createRectangularSavedMap({ id: 'rect', name: 'Rect', width: 4, height: 4 }),
      walls: [{ x: 1, y: 1 }]
    };

    const library = generateDiverseHamiltonianCycles(map);

    assert.equal(isCycleLibrarySupportedMap(map), false);
    assert.equal(library.status, 'unsupported');
    assert.equal(library.entries.length, 1);
    assert.equal(library.entries[0]?.id, createBaseCycleLibraryEntryId(map.id));
    assert.equal(library.diagnostics.generatedCycles, 0);
  });
});
