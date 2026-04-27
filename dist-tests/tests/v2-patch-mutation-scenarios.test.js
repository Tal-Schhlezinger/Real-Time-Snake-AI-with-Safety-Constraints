"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const patch_mutation_scenarios_1 = require("../src/core/patch-mutation-scenarios");
const v2_patch_mutation_scenarios_1 = require("../src/core/v2-patch-mutation-scenarios");
const testkit_1 = require("./testkit");
const scenarioOptions = {
    maxWidth: 4,
    maxHeight: 4,
    maxArea: 16,
    maxPatchArea4Exit: 9,
    maxCoversPerPatch: 8,
    maxSolverExpansionsPerPatch: 20_000,
    transitionOptions: {
        maxPaths: 32,
        slack: 4
    },
    seedValues: [0, 0.47],
    midGameFillRatios: [0.1, 0.25],
    topCandidateCount: 3
};
(0, testkit_1.describe)('V2 patch mutation scenario diagnostics', () => {
    (0, testkit_1.it)('scenario diagnostics are deterministic for fixed options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 });
        const first = (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenarios)(map, scenarioOptions);
        const second = (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenarios)(map, scenarioOptions);
        strict_1.default.deepEqual(second, first);
    });
    (0, testkit_1.it)('setting a far apple changes currentPathLen', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 });
        const scenarios = (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenarios)(map, scenarioOptions).scenarios;
        const near = scenarios.find((scenario) => scenario.kind === 'initial-near');
        const far = scenarios.find((scenario) => scenario.kind === 'initial-far');
        strict_1.default.ok(near);
        strict_1.default.ok(far);
        strict_1.default.notEqual(far.apple, near.apple);
        strict_1.default.ok((far.currentLockedCyclePathLen ?? 0) > (near.currentLockedCyclePathLen ?? 0));
    });
    (0, testkit_1.it)('diagnostics include currentPathLen and best improvement', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 });
        const scenario = (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenarios)(map, scenarioOptions).scenarios[0];
        strict_1.default.ok(scenario);
        strict_1.default.equal(typeof scenario.currentLockedCyclePathLen, 'number');
        strict_1.default.equal(scenario.bestImprovement === null || typeof scenario.bestImprovement === 'number', true);
        strict_1.default.equal(typeof scenario.v2GraphValidCandidates, 'number');
        strict_1.default.equal(typeof scenario.v2SnakeUsableCandidates, 'number');
        strict_1.default.equal(typeof scenario.immediateLockedCandidates, 'number');
        strict_1.default.equal(typeof scenario.transitionReachableCandidates, 'number');
        strict_1.default.equal(typeof scenario.improvingCandidates, 'number');
    });
    (0, testkit_1.it)('diagnostics do not mutate gameplay state', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 });
        const scenario = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map, scenarioOptions)
            .find((candidate) => candidate.kind === 'initial-far');
        strict_1.default.ok(scenario);
        const before = JSON.stringify(scenario.state);
        (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenario)(scenario, scenarioOptions);
        const after = JSON.stringify(scenario.state);
        strict_1.default.equal(after, before);
    });
    (0, testkit_1.it)('evaluates at least one controlled far-apple scenario', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 });
        const report = (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenarios)(map, scenarioOptions);
        const farScenarios = report.scenarios.filter((scenario) => (scenario.kind === 'initial-far' || scenario.kind === 'manual-far') &&
            (scenario.currentLockedCyclePathLen ?? 0) > 1);
        strict_1.default.ok(farScenarios.length >= 1);
    });
    (0, testkit_1.it)('V2 diagnostics do not affect V1 patch mutation scenario diagnostics', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 });
        const before = (0, patch_mutation_scenarios_1.analyzePatchMutationScenarios)(map, scenarioOptions);
        (0, v2_patch_mutation_scenarios_1.analyzeV2PatchMutationScenarios)(map, scenarioOptions);
        strict_1.default.deepEqual((0, patch_mutation_scenarios_1.analyzePatchMutationScenarios)(map, scenarioOptions), before);
    });
});
