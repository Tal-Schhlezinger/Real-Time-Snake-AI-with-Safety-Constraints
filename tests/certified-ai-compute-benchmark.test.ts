import assert from 'node:assert/strict';
import {
  runCertifiedAiComputeBenchmark,
  type CertifiedAiComputeBenchmarkResult
} from '../src/core/certified-ai-compute-benchmark';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { describe, it } from './testkit';

function withoutTiming(result: CertifiedAiComputeBenchmarkResult): unknown {
  return JSON.parse(JSON.stringify(result, (key, value) =>
    key === 'timing' || key.endsWith('Ms') ? undefined : value
  ));
}

describe('Certified AI compute benchmark', () => {
  it('is deterministic in game results for fixed seeds', () => {
    const map = createRectangularSavedMap({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
    const options = {
      variant: 'v1-v2' as const,
      cacheMode: 'on' as const,
      maxSteps: 80,
      seed: 17,
      initialAppleSeed: 0.37,
      includeTrace: true,
      patchOptions: {
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        maxV2PatchArea: 16,
        maxV2RectsScanned: 80,
        maxV2Candidates: 20,
        maxV2FillRatio: 1
      }
    };

    assert.deepEqual(
      withoutTiming(runCertifiedAiComputeBenchmark(map, options)),
      withoutTiming(runCertifiedAiComputeBenchmark(map, options))
    );
  });

  it('declares a headless synchronous methodology with no intentional delay', () => {
    const map = createRectangularSavedMap({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
    const result = runCertifiedAiComputeBenchmark(map, { maxSteps: 10 });

    assert.deepEqual(result.methodology, {
      headless: true,
      synchronous: true,
      intentionalDelayMs: 0,
      rendering: false,
      timers: false,
      hotLoopLogging: false,
      timer: 'performance.now'
    });
  });

  it('cache-on and cache-off produce the same move and source sequence for fixed seeds', () => {
    const map = createRectangularSavedMap({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
    const baseOptions = {
      variant: 'v1-v2' as const,
      maxSteps: 80,
      seed: 11,
      initialAppleSeed: 0.37,
      includeTrace: true,
      patchOptions: {
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16,
        maxV2PatchArea: 16,
        maxV2RectsScanned: 80,
        maxV2Candidates: 20,
        maxV2FillRatio: 1
      }
    };
    const cacheOff = runCertifiedAiComputeBenchmark(map, { ...baseOptions, cacheMode: 'off' });
    const cacheOn = runCertifiedAiComputeBenchmark(map, { ...baseOptions, cacheMode: 'on' });

    assert.equal(cacheOff.quality.invariantFailures, 0);
    assert.equal(cacheOn.quality.invariantFailures, 0);
    assert.deepEqual(cacheOn.trace, cacheOff.trace);
    assert.deepEqual(cacheOn.quality, cacheOff.quality);
  });

  it('reports compute timing fields without requiring deterministic timing equality', () => {
    const map = createRectangularSavedMap({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
    const result = runCertifiedAiComputeBenchmark(map, {
      variant: 'v1' as const,
      cacheMode: 'on' as const,
      maxSteps: 40,
      seed: 5,
      initialAppleSeed: 0.2,
      patchOptions: {
        maxPatchWidth: 4,
        maxPatchHeight: 4,
        maxPatchArea: 16
      }
    });

    assert.equal(result.timing.evaluationRuntimeMs >= 0, true);
    assert.equal(result.timing.totalAiDecisionMs >= 0, true);
    assert.equal(result.timing.totalLockedMoveDecisionMs >= 0, true);
    assert.equal(result.timing.totalTransitionMoveDecisionMs >= 0, true);
    assert.equal(result.timing.totalPostApplePlanningMs >= 0, true);
    assert.equal(result.timing.avgAiDecisionMsPerTick >= 0, true);
    assert.equal(result.timing.maxSingleDecisionMs >= 0, true);
    assert.equal(result.timing.p95DecisionMs >= 0, true);
    assert.equal(result.timing.v1GenerationMs >= 0, true);
    assert.equal(result.timing.transitionSearchMs >= 0, true);
    assert.equal(result.timing.certificationMs >= 0, true);
    assert.equal(result.timing.scoringMs >= 0, true);
  });

  it('has no invariant failures on a supported 6x6 benchmark run', () => {
    const map = createRectangularSavedMap({ id: 'bench-6x6', name: 'Benchmark 6x6', width: 6, height: 6 });
    const result = runCertifiedAiComputeBenchmark(map, {
      variant: 'v1' as const,
      cacheMode: 'on' as const,
      maxSteps: 120,
      seed: 202,
      initialAppleSeed: 0.37
    });

    assert.equal(result.quality.deaths, 0);
    assert.equal(result.quality.invariantFailures, 0);
  });
});
