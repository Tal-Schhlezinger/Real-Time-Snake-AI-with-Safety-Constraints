import { analyzeV2PatchMutationScenarios } from '../dist/src/core/v2-patch-mutation-scenarios.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const scanOptions = {
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 24,
  maxPatchArea4Exit: 24,
  maxCoversPerPatch: 64,
  maxSolverExpansionsPerPatch: 100_000,
  transitionOptions: {
    maxPaths: 8,
    slack: 2,
    maxPathLength: 16,
    maxSearchStates: 10_000
  },
  seedValues: [0, 0.23, 0.47, 0.71],
  midGameFillRatios: [0.1, 0.25, 0.4],
  topCandidateCount: 5
};

const maps = [
  createRectangularSavedMap({ id: 'v2-scenario-4x4', name: 'V2 Scenario 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'v2-scenario-6x6', name: 'V2 Scenario 6x6', width: 6, height: 6 }),
  createDefaultMaps().find((map) => map.id === 'classic-12x8') ?? createDefaultMaps()[0]
].filter(Boolean);

const reports = maps.map((map) => analyzeV2PatchMutationScenarios(map, scanOptions));

console.log(JSON.stringify(reports, null, 2));
