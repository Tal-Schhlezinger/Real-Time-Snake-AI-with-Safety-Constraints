import { evaluateCertifiedPatchMutationOnMaps } from '../dist/src/core/certified-patch-mutation-evaluation.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const maps = [
  createRectangularSavedMap({ id: 'eval-4x4', name: 'Evaluation 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'eval-6x6', name: 'Evaluation 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const reports = evaluateCertifiedPatchMutationOnMaps(maps, {
  maxSteps: 1_000,
  seed: 20260425,
  initialAppleSeed: 0,
  cycleLibraryOptions: {
    maxCycles: 10,
    maxAttempts: 64,
    minDiversity: 0.2
  },
  patchOptions: {
    enablePatchMutation: true,
    maxPatchWidth: 6,
    maxPatchHeight: 6,
    maxPatchArea: 20,
    maxTransitionPathsPerCandidate: 64,
    maxTransitionSlack: 6,
    enableV2PatchMutation: true,
    maxV2FillRatio: 0.15,
    maxV2RectsScanned: 500,
    maxV2Candidates: 300,
    maxV2PatchArea: 24,
    maxV2TransitionPathsPerCandidate: 8,
    maxV2TransitionSlack: 2,
    maxV2TransitionPathLength: 16,
    maxV2TransitionSearchStates: 10_000,
    maxV2SolverExpansions: 100_000
  }
});

console.log(JSON.stringify(reports, null, 2));
