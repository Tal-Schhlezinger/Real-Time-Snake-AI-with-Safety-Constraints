import assert from 'node:assert/strict';
import { createDefaultMaps } from '../src/data/default-maps';
import { evaluateCertifiedVariant } from '../src/core/certified-patch-mutation-evaluation';
import {
  analyzePatchMutationV1LimitDiagnostics,
  type PatchMutationV1LimitDiagnosticConfig
} from '../src/core/patch-mutation-v1-limit-diagnostics';
import { createPatchMutationScenarioStates } from '../src/core/patch-mutation-scenarios';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { describe, it } from './testkit';

const tightConfig: PatchMutationV1LimitDiagnosticConfig = {
  id: 'tight',
  label: 'Tight deterministic test config',
  maxWidth: 4,
  maxHeight: 4,
  maxArea: 12,
  maxPatchRectsScanned: 80,
  maxPatchCandidates: 32,
  pathCacheOptions: {
    maxArea: 12,
    maxPathsPerTerminalPair: 16,
    maxExpansions: 20_000
  },
  transitionOptions: {
    maxPaths: 12,
    slack: 3
  }
};

const largerConfig: PatchMutationV1LimitDiagnosticConfig = {
  id: 'larger',
  label: 'Larger deterministic test config',
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 20,
  maxPatchRectsScanned: 160,
  maxPatchCandidates: 64,
  pathCacheOptions: {
    maxArea: 20,
    maxPathsPerTerminalPair: 32,
    maxExpansions: 40_000
  },
  transitionOptions: {
    maxPaths: 16,
    slack: 4
  }
};

describe('Patch mutation V1 limit diagnostics', () => {
  it('diagnostics are deterministic for fixed scenarios and options', () => {
    const map = createRectangularSavedMap({ id: 'v1-limit-4x4', name: 'V1 Limit 4x4', width: 4, height: 4 });
    const scenarios = createPatchMutationScenarioStates(map, {
      seedValues: [],
      midGameFillRatios: [],
      maxSimulationSteps: 40
    }).slice(0, 2);

    const first = analyzePatchMutationV1LimitDiagnostics(map, {
      configs: [tightConfig],
      scenarios
    });
    const second = analyzePatchMutationV1LimitDiagnostics(map, {
      configs: [tightConfig],
      scenarios
    });

    assert.deepEqual(second, first);
  });

  it('increasing diagnostic limits does not affect certified runtime behavior', () => {
    const map = createRectangularSavedMap({ id: 'v1-limit-runtime-4x4', name: 'V1 Runtime 4x4', width: 4, height: 4 });
    const before = evaluateCertifiedVariant(map, 'certified-cycle-library', {
      maxSteps: 80,
      seed: 3,
      initialAppleSeed: 0.2
    });

    analyzePatchMutationV1LimitDiagnostics(map, {
      configs: [largerConfig],
      scenarios: createPatchMutationScenarioStates(map, {
        seedValues: [],
        midGameFillRatios: [],
        maxSimulationSteps: 40
      }).slice(0, 2)
    });

    const after = evaluateCertifiedVariant(map, 'certified-cycle-library', {
      maxSteps: 80,
      seed: 3,
      initialAppleSeed: 0.2
    });

    assert.deepEqual(after, before);
  });

  it('reports multi-exit counts without using them for V1 candidate selection', () => {
    const map = createDefaultMaps()[0]!;
    const scenarios = createPatchMutationScenarioStates(map, {
      seedValues: [],
      midGameFillRatios: [],
      maxSimulationSteps: 80
    }).slice(0, 1);
    const report = analyzePatchMutationV1LimitDiagnostics(map, {
      configs: [largerConfig],
      scenarios
    });
    const config = report.configs[0]!;

    assert.equal(typeof config.multiExitRectangles.cut4, 'number');
    assert.equal(typeof config.multiExitRectangles.cut6, 'number');
    assert.equal(typeof config.multiExitRectangles.cut8, 'number');
    assert.equal(typeof config.multiExitRectangles.plausibleCut4, 'number');
    assert.equal(config.graphValidCandidates, config.workCounters.classifications);
  });

  it('keeps current default certified behavior patch-free unless patch mutation is enabled', () => {
    const map = createRectangularSavedMap({ id: 'v1-limit-default-6x6', name: 'V1 Default 6x6', width: 6, height: 6 });
    const result = evaluateCertifiedVariant(map, 'certified-cycle-library', {
      maxSteps: 120,
      seed: 1,
      initialAppleSeed: 0
    });

    assert.equal(result.patchMutationAttempts, 0);
    assert.equal(result.patchSelectedCandidates, 0);
    assert.equal(result.invariantFailures, 0);
  });

  it('reports no invariant failures in a patch-enabled diagnostic evaluation run', () => {
    const map = createRectangularSavedMap({ id: 'v1-limit-patch-6x6', name: 'V1 Patch 6x6', width: 6, height: 6 });
    const result = evaluateCertifiedVariant(map, 'certified-library-patch-mutation', {
      maxSteps: 160,
      seed: 2,
      initialAppleSeed: 0.4,
      patchOptions: {
        enablePatchMutation: true,
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        maxPatchCandidates: 64,
        maxTransitionPathsPerCandidate: 16,
        maxTransitionSlack: 4
      }
    });

    assert.equal(result.invariantFailures, 0);
  });
});
