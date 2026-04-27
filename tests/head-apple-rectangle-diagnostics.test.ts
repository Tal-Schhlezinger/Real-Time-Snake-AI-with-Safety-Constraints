import assert from 'node:assert/strict';
import {
  analyzeHeadAppleRectangleGrowSearch,
  generateTargetedRectangles
} from '../src/core/head-apple-rectangle-diagnostics';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { createPatchMutationScenarioStates } from '../src/core/patch-mutation-scenarios';
import { describe, it } from './testkit';

function withoutTiming<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, nestedValue) =>
    key.endsWith('Ms') ? undefined : nestedValue
  )) as T;
}

describe('Head-apple rectangle grow diagnostics', () => {
  it('generates deterministic targeted rectangles around head/apple and arc chunks', () => {
    const map = createRectangularSavedMap({ id: 'target-6x6', name: 'Target 6x6', width: 6, height: 6 });
    const state = createPatchMutationScenarioStates(map).find((scenario) => scenario.kind === 'initial-far')!.state;
    const options = { maxWidth: 6, maxHeight: 6, maxArea: 20, maxTargetRectangles: 16 };

    assert.deepEqual(
      generateTargetedRectangles(state, 'combined-targeted', options),
      generateTargetedRectangles(state, 'combined-targeted', options)
    );
  });

  it('evaluates fewer targeted rectangles than a broad scan under the same budget', () => {
    const map = createRectangularSavedMap({ id: 'target-6x6', name: 'Target 6x6', width: 6, height: 6 });
    const state = createPatchMutationScenarioStates(map).find((scenario) => scenario.kind === 'initial-far')!.state;
    const diagnostics = analyzeHeadAppleRectangleGrowSearch(state, {
      maxWidth: 6,
      maxHeight: 6,
      maxArea: 20,
      maxTargetRectangles: 24,
      maxExitDiagnostics: 3,
      transitionOptions: { maxPaths: 4, slack: 1 }
    });
    const broad = diagnostics.modes.find((mode) => mode.mode === 'broad-scan')!;
    const targeted = diagnostics.modes.find((mode) => mode.mode === 'combined-targeted')!;

    assert.equal(targeted.rectanglesEvaluated <= broad.rectanglesEvaluated, true);
    assert.equal(diagnostics.modes.every((mode) => mode.invariantFailures === 0), true);
  });

  it('reports exit-count side diagnostics and alternative/covers flags', () => {
    const map = createRectangularSavedMap({ id: 'target-4x4', name: 'Target 4x4', width: 4, height: 4 });
    const state = createPatchMutationScenarioStates(map).find((scenario) => scenario.kind === 'initial-far')!.state;
    const diagnostics = analyzeHeadAppleRectangleGrowSearch(state, {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxTargetRectangles: 8,
      maxExitDiagnostics: 4,
      transitionOptions: { maxPaths: 4, slack: 1 }
    });
    const describedRect = diagnostics.modes.flatMap((mode) => mode.exitDiagnostics)[0];

    assert.ok(describedRect);
    assert.equal(typeof describedRect.exitCount, 'number');
    assert.equal([2, 4, 6, 8].includes(describedRect.closestTargetExitCount), true);
    assert.equal(typeof describedRect.sideExitCounts.expandLeft === 'number' || describedRect.sideExitCounts.expandLeft === null, true);
    assert.equal(typeof describedRect.hasV1Alternatives, 'boolean');
    assert.equal(typeof describedRect.hasV2Covers, 'boolean');
  });

  it('does not mutate game state and is deterministic except for timing fields', () => {
    const map = createRectangularSavedMap({ id: 'target-4x4', name: 'Target 4x4', width: 4, height: 4 });
    const state = createPatchMutationScenarioStates(map).find((scenario) => scenario.kind === 'initial-far')!.state;
    const before = JSON.parse(JSON.stringify(state));
    const options = {
      maxWidth: 4,
      maxHeight: 4,
      maxArea: 16,
      maxTargetRectangles: 8,
      maxExitDiagnostics: 3,
      transitionOptions: { maxPaths: 4, slack: 1 }
    };

    const first = analyzeHeadAppleRectangleGrowSearch(state, options);
    const second = analyzeHeadAppleRectangleGrowSearch(state, options);

    assert.deepEqual(state, before);
    assert.deepEqual(withoutTiming(first), withoutTiming(second));
  });
});
