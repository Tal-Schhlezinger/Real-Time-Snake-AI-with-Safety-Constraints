import { analyzePatchMutationScenarios } from '../dist/src/core/patch-mutation-scenarios.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const scanOptions = {
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 20,
  pathCacheOptions: {
    maxArea: 20,
    maxPathsPerTerminalPair: 64,
    maxExpansions: 100_000
  },
  transitionOptions: {
    maxPaths: 64,
    slack: 6
  },
  seedValues: [0, 0.23, 0.47, 0.71],
  midGameFillRatios: [0.1, 0.25, 0.4],
  topCandidateCount: 5
};

const maps = [
  createRectangularSavedMap({ id: 'patch-scenario-4x4', name: 'Patch Scenario 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'patch-scenario-6x6', name: 'Patch Scenario 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const reports = maps.map((map) => analyzePatchMutationScenarios(map, scanOptions));

console.log(JSON.stringify(reports, null, 2));
