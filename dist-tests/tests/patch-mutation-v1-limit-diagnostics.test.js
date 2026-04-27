"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const default_maps_1 = require("../src/data/default-maps");
const certified_patch_mutation_evaluation_1 = require("../src/core/certified-patch-mutation-evaluation");
const patch_mutation_v1_limit_diagnostics_1 = require("../src/core/patch-mutation-v1-limit-diagnostics");
const patch_mutation_scenarios_1 = require("../src/core/patch-mutation-scenarios");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const testkit_1 = require("./testkit");
const tightConfig = {
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
const largerConfig = {
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
(0, testkit_1.describe)('Patch mutation V1 limit diagnostics', () => {
    (0, testkit_1.it)('diagnostics are deterministic for fixed scenarios and options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v1-limit-4x4', name: 'V1 Limit 4x4', width: 4, height: 4 });
        const scenarios = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
            seedValues: [],
            midGameFillRatios: [],
            maxSimulationSteps: 40
        }).slice(0, 2);
        const first = (0, patch_mutation_v1_limit_diagnostics_1.analyzePatchMutationV1LimitDiagnostics)(map, {
            configs: [tightConfig],
            scenarios
        });
        const second = (0, patch_mutation_v1_limit_diagnostics_1.analyzePatchMutationV1LimitDiagnostics)(map, {
            configs: [tightConfig],
            scenarios
        });
        strict_1.default.deepEqual(second, first);
    });
    (0, testkit_1.it)('increasing diagnostic limits does not affect certified runtime behavior', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v1-limit-runtime-4x4', name: 'V1 Runtime 4x4', width: 4, height: 4 });
        const before = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-cycle-library', {
            maxSteps: 80,
            seed: 3,
            initialAppleSeed: 0.2
        });
        (0, patch_mutation_v1_limit_diagnostics_1.analyzePatchMutationV1LimitDiagnostics)(map, {
            configs: [largerConfig],
            scenarios: (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
                seedValues: [],
                midGameFillRatios: [],
                maxSimulationSteps: 40
            }).slice(0, 2)
        });
        const after = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-cycle-library', {
            maxSteps: 80,
            seed: 3,
            initialAppleSeed: 0.2
        });
        strict_1.default.deepEqual(after, before);
    });
    (0, testkit_1.it)('reports multi-exit counts without using them for V1 candidate selection', () => {
        const map = (0, default_maps_1.createDefaultMaps)()[0];
        const scenarios = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, {
            seedValues: [],
            midGameFillRatios: [],
            maxSimulationSteps: 80
        }).slice(0, 1);
        const report = (0, patch_mutation_v1_limit_diagnostics_1.analyzePatchMutationV1LimitDiagnostics)(map, {
            configs: [largerConfig],
            scenarios
        });
        const config = report.configs[0];
        strict_1.default.equal(typeof config.multiExitRectangles.cut4, 'number');
        strict_1.default.equal(typeof config.multiExitRectangles.cut6, 'number');
        strict_1.default.equal(typeof config.multiExitRectangles.cut8, 'number');
        strict_1.default.equal(typeof config.multiExitRectangles.plausibleCut4, 'number');
        strict_1.default.equal(config.graphValidCandidates, config.workCounters.classifications);
    });
    (0, testkit_1.it)('keeps current default certified behavior patch-free unless patch mutation is enabled', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v1-limit-default-6x6', name: 'V1 Default 6x6', width: 6, height: 6 });
        const result = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-cycle-library', {
            maxSteps: 120,
            seed: 1,
            initialAppleSeed: 0
        });
        strict_1.default.equal(result.patchMutationAttempts, 0);
        strict_1.default.equal(result.patchSelectedCandidates, 0);
        strict_1.default.equal(result.invariantFailures, 0);
    });
    (0, testkit_1.it)('reports no invariant failures in a patch-enabled diagnostic evaluation run', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v1-limit-patch-6x6', name: 'V1 Patch 6x6', width: 6, height: 6 });
        const result = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-library-patch-mutation', {
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
        strict_1.default.equal(result.invariantFailures, 0);
    });
});
