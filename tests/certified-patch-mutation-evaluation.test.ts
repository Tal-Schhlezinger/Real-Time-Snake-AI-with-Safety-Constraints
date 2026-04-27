import assert from 'node:assert/strict';
import {
  evaluateCertifiedPatchMutationOnMap,
  evaluateCertifiedVariant
} from '../src/core/certified-patch-mutation-evaluation';
import { createRectangularSavedMap } from '../src/core/rectangular-cycle';
import { describe, it } from './testkit';

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

describe('Certified patch mutation evaluation', () => {
  it('is deterministic for fixed seed and options', () => {
    const map = createRectangularSavedMap({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
    const first = evaluateCertifiedPatchMutationOnMap(map, evaluationOptions);
    const second = evaluateCertifiedPatchMutationOnMap(map, evaluationOptions);

    assert.equal(first.variants.every((variant) => variant.profile.v1GenerationMs >= 0), true);
    assert.deepEqual(withoutTiming(second), withoutTiming(first));
  });

  it('patch mutation disabled variants report zero patch selections', () => {
    const map = createRectangularSavedMap({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
    const baseline = evaluateCertifiedVariant(map, 'certified-baseline', evaluationOptions);
    const library = evaluateCertifiedVariant(map, 'certified-cycle-library', evaluationOptions);

    assert.equal(baseline.patchSelectedCandidates, 0);
    assert.equal(library.patchSelectedCandidates, 0);
    assert.equal(baseline.v2SelectedCandidates, 0);
    assert.equal(library.v2SelectedCandidates, 0);
    assert.equal(baseline.patchMutationAttempts, 0);
    assert.equal(library.patchMutationAttempts, 0);
    assert.equal(baseline.v2PatchAttempts, 0);
    assert.equal(library.v2PatchAttempts, 0);
  });

  it('patch mutation enabled variant reports patch diagnostics fields', () => {
    const map = createRectangularSavedMap({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
    const result = evaluateCertifiedVariant(map, 'certified-library-patch-mutation', evaluationOptions);

    assert.equal(result.patchMutationAttempts > 0, true);
    assert.equal(result.patchGraphValidCandidates >= 0, true);
    assert.equal(result.patchSnakeUsableCandidates >= 0, true);
    assert.equal(result.selectedCandidateSourceCounts['v1-patch'] >= 0, true);
    assert.equal(result.selectedCandidateSourceCounts.transition >= 0, true);
  });

  it('V1 plus V2 variant reports V2 diagnostics fields', () => {
    const map = createRectangularSavedMap({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
    const result = evaluateCertifiedVariant(map, 'certified-library-v1-v2-patch-mutation', evaluationOptions);

    assert.equal(result.v2PatchAttempts >= 0, true);
    assert.equal(result.v2GraphValidCandidates >= 0, true);
    assert.equal(result.v2SnakeUsableCandidates >= 0, true);
    assert.equal(result.v2SelectedCandidates >= 0, true);
    assert.equal(result.selectedCandidateSourceCounts['v2-patch'] >= 0, true);
  });

  it('has no invariant failures on supported test boards', () => {
    const maps = [
      createRectangularSavedMap({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 }),
      createRectangularSavedMap({ id: 'eval-6x6', name: 'Eval 6x6', width: 6, height: 6 })
    ];

    for (const map of maps) {
      const report = evaluateCertifiedPatchMutationOnMap(map, evaluationOptions);
      assert.equal(report.variants.every((variant) => variant.invariantFailures === 0), true);
    }
  });

  it('does not mutate shared map state across runs', () => {
    const map = createRectangularSavedMap({ id: 'eval-4x4', name: 'Eval 4x4', width: 4, height: 4 });
    const before = JSON.stringify(map);

    evaluateCertifiedPatchMutationOnMap(map, evaluationOptions);
    evaluateCertifiedPatchMutationOnMap(map, evaluationOptions);

    assert.equal(JSON.stringify(map), before);
  });
});

function withoutTiming<T>(value: T): T {
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
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => timingKeys.has(key) ? undefined : nestedValue)) as T;
}
