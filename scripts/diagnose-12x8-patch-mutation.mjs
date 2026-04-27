import {
  analyzePatchMutationV1LimitDiagnostics,
  DEFAULT_12X8_PATCH_LIMIT_CONFIGS
} from '../dist/src/core/patch-mutation-v1-limit-diagnostics.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const defaultMap = createDefaultMaps().find((map) => map.id === 'classic-12x8') ?? createDefaultMaps()[0];

if (!defaultMap) {
  throw new Error('No default map is available for patch mutation diagnostics.');
}

const report = analyzePatchMutationV1LimitDiagnostics(defaultMap, {
  configs: DEFAULT_12X8_PATCH_LIMIT_CONFIGS
});

const configTable = report.configs.map((config) => ({
  configId: config.configId,
  rectanglesScanned: config.rectanglesScanned,
  validTwoTerminalPatches: config.validTwoTerminalPatches,
  alternativesConsidered: config.alternativesConsidered,
  graphValidCandidates: config.graphValidCandidates,
  snakeUsableCandidates: config.snakeUsableCandidates,
  improvingCandidates: config.improvingCandidates,
  selectedCandidatesUnderCurrentScoring: config.selectedCandidatesUnderCurrentScoring,
  bestImprovement: config.bestImprovement,
  budgetExhaustedScenarios: config.budgetExhaustedScenarios,
  multiExitCut4: config.multiExitRectangles.cut4,
  multiExitCut6: config.multiExitRectangles.cut6,
  multiExitCut8: config.multiExitRectangles.cut8,
  plausibleCut4: config.multiExitRectangles.plausibleCut4,
  plausibleCut6: config.multiExitRectangles.plausibleCut6,
  plausibleCut8: config.multiExitRectangles.plausibleCut8,
  deterministicWork: config.workCounters,
  topPatchRejectionReasons: config.topPatchRejectionReasons,
  topCandidateRejectionReasons: config.topCandidateRejectionReasons,
  topSnakeRejectionReasons: config.topSnakeRejectionReasons
}));

console.log(JSON.stringify({
  mapId: report.mapId,
  mapName: report.mapName,
  boardSize: report.boardSize,
  scenarioCount: report.scenarioCount,
  configs: configTable
}, null, 2));
