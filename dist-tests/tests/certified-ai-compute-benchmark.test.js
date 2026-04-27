"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const certified_ai_compute_benchmark_1 = require("../src/core/certified-ai-compute-benchmark");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const testkit_1 = require("./testkit");
function withoutTiming(result) {
    return JSON.parse(JSON.stringify(result, (key, value) => key === 'timing' || key.endsWith('Ms') ? undefined : value));
}
(0, testkit_1.describe)('Certified AI compute benchmark', () => {
    (0, testkit_1.it)('is deterministic in game results for fixed seeds', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
        const options = {
            variant: 'v1-v2',
            cacheMode: 'on',
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
        strict_1.default.deepEqual(withoutTiming((0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, options)), withoutTiming((0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, options)));
    });
    (0, testkit_1.it)('declares a headless synchronous methodology with no intentional delay', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
        const result = (0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, { maxSteps: 10 });
        strict_1.default.deepEqual(result.methodology, {
            headless: true,
            synchronous: true,
            intentionalDelayMs: 0,
            rendering: false,
            timers: false,
            hotLoopLogging: false,
            timer: 'performance.now'
        });
    });
    (0, testkit_1.it)('cache-on and cache-off produce the same move and source sequence for fixed seeds', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
        const baseOptions = {
            variant: 'v1-v2',
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
        const cacheOff = (0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, { ...baseOptions, cacheMode: 'off' });
        const cacheOn = (0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, { ...baseOptions, cacheMode: 'on' });
        strict_1.default.equal(cacheOff.quality.invariantFailures, 0);
        strict_1.default.equal(cacheOn.quality.invariantFailures, 0);
        strict_1.default.deepEqual(cacheOn.trace, cacheOff.trace);
        strict_1.default.deepEqual(cacheOn.quality, cacheOff.quality);
    });
    (0, testkit_1.it)('reports compute timing fields without requiring deterministic timing equality', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'bench-4x4', name: 'Benchmark 4x4', width: 4, height: 4 });
        const result = (0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, {
            variant: 'v1',
            cacheMode: 'on',
            maxSteps: 40,
            seed: 5,
            initialAppleSeed: 0.2,
            patchOptions: {
                maxPatchWidth: 4,
                maxPatchHeight: 4,
                maxPatchArea: 16
            }
        });
        strict_1.default.equal(result.timing.evaluationRuntimeMs >= 0, true);
        strict_1.default.equal(result.timing.totalAiDecisionMs >= 0, true);
        strict_1.default.equal(result.timing.totalLockedMoveDecisionMs >= 0, true);
        strict_1.default.equal(result.timing.totalTransitionMoveDecisionMs >= 0, true);
        strict_1.default.equal(result.timing.totalPostApplePlanningMs >= 0, true);
        strict_1.default.equal(result.timing.avgAiDecisionMsPerTick >= 0, true);
        strict_1.default.equal(result.timing.maxSingleDecisionMs >= 0, true);
        strict_1.default.equal(result.timing.p95DecisionMs >= 0, true);
        strict_1.default.equal(result.timing.v1GenerationMs >= 0, true);
        strict_1.default.equal(result.timing.transitionSearchMs >= 0, true);
        strict_1.default.equal(result.timing.certificationMs >= 0, true);
        strict_1.default.equal(result.timing.scoringMs >= 0, true);
    });
    (0, testkit_1.it)('has no invariant failures on a supported 6x6 benchmark run', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'bench-6x6', name: 'Benchmark 6x6', width: 6, height: 6 });
        const result = (0, certified_ai_compute_benchmark_1.runCertifiedAiComputeBenchmark)(map, {
            variant: 'v1',
            cacheMode: 'on',
            maxSteps: 120,
            seed: 202,
            initialAppleSeed: 0.37
        });
        strict_1.default.equal(result.quality.deaths, 0);
        strict_1.default.equal(result.quality.invariantFailures, 0);
    });
});
