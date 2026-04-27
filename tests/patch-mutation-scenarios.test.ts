import assert from 'node:assert/strict';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import {
  analyzePatchMutationScenario,
  analyzePatchMutationScenarios,
  createPatchMutationScenarioStates
} from '../src/core/patch-mutation-scenarios';
import { describe, it } from './testkit';

const scenarioOptions = {
  maxWidth: 4,
  maxHeight: 4,
  maxArea: 16,
  pathCacheOptions: {
    maxArea: 16,
    maxPathsPerTerminalPair: 32,
    maxExpansions: 50_000
  },
  transitionOptions: {
    maxPaths: 32,
    slack: 4
  },
  seedValues: [0, 0.47],
  midGameFillRatios: [0.1, 0.25],
  topCandidateCount: 3
};

describe('Patch mutation scenario diagnostics', () => {
  it('scenario diagnostics are deterministic for fixed options', () => {
    const map = createRectangularSavedMap({ id: 'scenario-4x4', name: 'Scenario 4x4', width: 4, height: 4 });
    const first = analyzePatchMutationScenarios(map, scenarioOptions);
    const second = analyzePatchMutationScenarios(map, scenarioOptions);

    assert.deepEqual(second, first);
  });

  it('setting a far apple changes currentPathLen', () => {
    const map = createRectangularSavedMap({ id: 'scenario-4x4', name: 'Scenario 4x4', width: 4, height: 4 });
    const scenarios = analyzePatchMutationScenarios(map, scenarioOptions).scenarios;
    const near = scenarios.find((scenario) => scenario.kind === 'initial-near');
    const far = scenarios.find((scenario) => scenario.kind === 'initial-far');

    assert.ok(near);
    assert.ok(far);
    assert.notEqual(far.apple, near.apple);
    assert.ok((far.currentLockedCyclePathLen ?? 0) > (near.currentLockedCyclePathLen ?? 0));
  });

  it('diagnostics include currentPathLen and best improvement', () => {
    const map = createRectangularSavedMap({ id: 'scenario-4x4', name: 'Scenario 4x4', width: 4, height: 4 });
    const scenario = analyzePatchMutationScenarios(map, scenarioOptions).scenarios[0];

    assert.ok(scenario);
    assert.equal(typeof scenario.currentLockedCyclePathLen, 'number');
    assert.equal(
      scenario.bestImprovement === null || typeof scenario.bestImprovement === 'number',
      true
    );
    assert.equal(typeof scenario.graphValidPatchCandidates, 'number');
    assert.equal(typeof scenario.snakeUsableCandidates, 'number');
    assert.equal(typeof scenario.improvingCandidates, 'number');
  });

  it('diagnostics do not mutate gameplay state', () => {
    const map = createRectangularSavedMap({ id: 'scenario-4x4', name: 'Scenario 4x4', width: 4, height: 4 });
    const scenario = createPatchMutationScenarioStates(map, scenarioOptions)
      .find((candidate) => candidate.kind === 'initial-far');

    assert.ok(scenario);

    const before = JSON.stringify(scenario.state);
    analyzePatchMutationScenario(scenario, scenarioOptions);
    const after = JSON.stringify(scenario.state);

    assert.equal(after, before);
  });

  it('evaluates at least one controlled far-apple scenario even when no improvement is found', () => {
    const map = createRectangularSavedMap({ id: 'scenario-4x4', name: 'Scenario 4x4', width: 4, height: 4 });
    const report = analyzePatchMutationScenarios(map, scenarioOptions);
    const farScenarios = report.scenarios.filter((scenario) =>
      (scenario.kind === 'initial-far' || scenario.kind === 'manual-far') &&
      (scenario.currentLockedCyclePathLen ?? 0) > 1
    );

    assert.ok(farScenarios.length >= 1);
  });
});
