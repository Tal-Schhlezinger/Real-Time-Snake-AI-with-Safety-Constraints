"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const certified_patch_mutation_evaluation_1 = require("../src/core/certified-patch-mutation-evaluation");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const testkit_1 = require("./testkit");
const evaluationOptions = {
    maxSteps: 160,
    seed: 20260425,
    initialAppleSeed: 0,
    cycleLibraryOptions: {
        maxCycles: 8,
        maxAttempts: 24,
        minDiversity: 0.2
    },
    patchOptions: {
        enablePatchMutation: true,
        maxPatchWidth: 6,
        maxPatchHeight: 6,
        maxPatchArea: 20,
        maxTransitionPathsPerCandidate: 32,
        maxTransitionSlack: 4,
        enableV2PatchMutation: true,
        maxV2FillRatio: 0.15,
        maxV2RectsScanned: 120,
        maxV2Candidates: 32,
        maxV2PatchArea: 16,
        maxV2TransitionPathsPerCandidate: 4,
        maxV2TransitionSlack: 1,
        maxV2TransitionPathLength: 8,
        maxV2TransitionSearchStates: 1_000,
        maxV2SolverExpansions: 20_000
    }
};
(0, testkit_1.describe)('Certified patch mutation evaluation', () => {
    (0, testkit_1.it)('is deterministic for fixed seed and options', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
        const first = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedPatchMutationOnMap)(map, evaluationOptions);
        const second = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedPatchMutationOnMap)(map, evaluationOptions);
        strict_1.default.equal(first.variants.every((variant) => variant.profile.v1GenerationMs >= 0), true);
        strict_1.default.deepEqual(withoutTiming(second), withoutTiming(first));
    });
    (0, testkit_1.it)('patch mutation disabled variants report zero patch selections', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
        const baseline = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-baseline', evaluationOptions);
        const library = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-cycle-library', evaluationOptions);
        strict_1.default.equal(baseline.patchSelectedCandidates, 0);
        strict_1.default.equal(library.patchSelectedCandidates, 0);
        strict_1.default.equal(baseline.v2SelectedCandidates, 0);
        strict_1.default.equal(library.v2SelectedCandidates, 0);
        strict_1.default.equal(baseline.patchMutationAttempts, 0);
        strict_1.default.equal(library.patchMutationAttempts, 0);
        strict_1.default.equal(baseline.v2PatchAttempts, 0);
        strict_1.default.equal(library.v2PatchAttempts, 0);
    });
    (0, testkit_1.it)('patch mutation enabled variant reports patch diagnostics fields', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
        const result = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-library-patch-mutation', evaluationOptions);
        strict_1.default.equal(result.patchMutationAttempts > 0, true);
        strict_1.default.equal(result.patchGraphValidCandidates >= 0, true);
        strict_1.default.equal(result.patchSnakeUsableCandidates >= 0, true);
        strict_1.default.equal(result.selectedCandidateSourceCounts['v1-patch'] >= 0, true);
        strict_1.default.equal(result.selectedCandidateSourceCounts.transition >= 0, true);
    });
    (0, testkit_1.it)('V1 plus V2 variant reports V2 diagnostics fields', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
        const result = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedVariant)(map, 'certified-library-v1-v2-patch-mutation', evaluationOptions);
        strict_1.default.equal(result.v2PatchAttempts >= 0, true);
        strict_1.default.equal(result.v2GraphValidCandidates >= 0, true);
        strict_1.default.equal(result.v2SnakeUsableCandidates >= 0, true);
        strict_1.default.equal(result.v2SelectedCandidates >= 0, true);
        strict_1.default.equal(result.selectedCandidateSourceCounts['v2-patch'] >= 0, true);
    });
    (0, testkit_1.it)('has no invariant failures on supported test boards', () => {
        const maps = [
            (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 }),
            (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-6x6', name: 'Eval 6x6', width: 6, height: 6 })
        ];
        for (const map of maps) {
            const report = (0, certified_patch_mutation_evaluation_1.evaluateCertifiedPatchMutationOnMap)(map, evaluationOptions);
            strict_1.default.equal(report.variants.every((variant) => variant.invariantFailures === 0), true);
        }
    });
    (0, testkit_1.it)('does not mutate shared map state across runs', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
        const before = JSON.stringify(map);
        (0, certified_patch_mutation_evaluation_1.evaluateCertifiedPatchMutationOnMap)(map, evaluationOptions);
        (0, certified_patch_mutation_evaluation_1.evaluateCertifiedPatchMutationOnMap)(map, evaluationOptions);
        strict_1.default.equal(JSON.stringify(map), before);
    });
});
function withoutTiming(value) {
    const timingKeys = new Set([
        'profile',
        'patchGenerationMs',
        'v1GenerationMs',
        'v1CertificationMs',
        'v1TransitionSearchMs',
        'v1ScoringMs',
        'v2DetectionMs',
        'v2PathCoverSolvingMs',
        'v2SplicingValidationMs',
        'v2GenerationMs',
        'v2CertificationMs',
        'v2TransitionSearchMs',
        'v2ScoringMs'
    ]);
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => timingKeys.has(key) ? undefined : nestedValue));
}
