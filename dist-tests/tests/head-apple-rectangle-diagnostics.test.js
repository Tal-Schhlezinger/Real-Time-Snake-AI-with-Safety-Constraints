"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const head_apple_rectangle_diagnostics_1 = require("../src/core/head-apple-rectangle-diagnostics");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const patch_mutation_scenarios_1 = require("../src/core/patch-mutation-scenarios");
const testkit_1 = require("./testkit");
function withoutTiming(value) {
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => key.endsWith('Ms') ? undefined : nestedValue));
}
(0, testkit_1.describe)('Head-apple rectangle grow diagnostics', () => {
    (0, testkit_1.it)('generates deterministic targeted rectangles around head/apple and arc chunks', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'target-6x6', name: 'Target 6x6', width: 6, height: 6 });
        const state = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map).find((scenario) => scenario.kind === 'initial-far').state;
        const options = { maxWidth: 6, maxHeight: 6, maxArea: 20, maxTargetRectangles: 16 };
        strict_1.default.deepEqual((0, head_apple_rectangle_diagnostics_1.generateTargetedRectangles)(state, 'combined-targeted', options), (0, head_apple_rectangle_diagnostics_1.generateTargetedRectangles)(state, 'combined-targeted', options));
    });
    (0, testkit_1.it)('evaluates fewer targeted rectangles than a broad scan under the same budget', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'target-6x6', name: 'Target 6x6', width: 6, height: 6 });
        const state = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map).find((scenario) => scenario.kind === 'initial-far').state;
        const diagnostics = (0, head_apple_rectangle_diagnostics_1.analyzeHeadAppleRectangleGrowSearch)(state, {
            maxWidth: 6,
            maxHeight: 6,
            maxArea: 20,
            maxTargetRectangles: 24,
            maxExitDiagnostics: 3,
            transitionOptions: { maxPaths: 4, slack: 1 }
        });
        const broad = diagnostics.modes.find((mode) => mode.mode === 'broad-scan');
        const targeted = diagnostics.modes.find((mode) => mode.mode === 'combined-targeted');
        strict_1.default.equal(targeted.rectanglesEvaluated <= broad.rectanglesEvaluated, true);
        strict_1.default.equal(diagnostics.modes.every((mode) => mode.invariantFailures === 0), true);
    });
    (0, testkit_1.it)('reports exit-count side diagnostics and alternative/covers flags', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'target-4x4', name: 'Target 4x4', width: 4, height: 4 });
        const state = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map).find((scenario) => scenario.kind === 'initial-far').state;
        const diagnostics = (0, head_apple_rectangle_diagnostics_1.analyzeHeadAppleRectangleGrowSearch)(state, {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxTargetRectangles: 8,
            maxExitDiagnostics: 4,
            transitionOptions: { maxPaths: 4, slack: 1 }
        });
        const describedRect = diagnostics.modes.flatMap((mode) => mode.exitDiagnostics)[0];
        strict_1.default.ok(describedRect);
        strict_1.default.equal(typeof describedRect.exitCount, 'number');
        strict_1.default.equal([2, 4, 6, 8].includes(describedRect.closestTargetExitCount), true);
        strict_1.default.equal(typeof describedRect.sideExitCounts.expandLeft === 'number' || describedRect.sideExitCounts.expandLeft === null, true);
        strict_1.default.equal(typeof describedRect.hasV1Alternatives, 'boolean');
        strict_1.default.equal(typeof describedRect.hasV2Covers, 'boolean');
    });
    (0, testkit_1.it)('does not mutate game state and is deterministic except for timing fields', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'target-4x4', name: 'Target 4x4', width: 4, height: 4 });
        const state = (0, patch_mutation_scenarios_1.createPatchMutationScenarioStates)(map).find((scenario) => scenario.kind === 'initial-far').state;
        const before = JSON.parse(JSON.stringify(state));
        const options = {
            maxWidth: 4,
            maxHeight: 4,
            maxArea: 16,
            maxTargetRectangles: 8,
            maxExitDiagnostics: 3,
            transitionOptions: { maxPaths: 4, slack: 1 }
        };
        const first = (0, head_apple_rectangle_diagnostics_1.analyzeHeadAppleRectangleGrowSearch)(state, options);
        const second = (0, head_apple_rectangle_diagnostics_1.analyzeHeadAppleRectangleGrowSearch)(state, options);
        strict_1.default.deepEqual(state, before);
        strict_1.default.deepEqual(withoutTiming(first), withoutTiming(second));
    });
});
