import { analyzeHeadAppleRectangleGrowSearch } from '../dist/src/core/head-apple-rectangle-diagnostics.js';
import { createPatchMutationScenarioStates } from '../dist/src/core/patch-mutation-scenarios.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const maps = [
  createRectangularSavedMap({ id: 'diag-6x6', name: 'Diagnostics 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const options = {
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 24,
  maxTargetRectangles: 64,
  maxExitDiagnostics: 5,
  arcChunkSize: 8,
  arcChunkStride: 4,
  maxPatchCandidates: 300,
  transitionOptions: {
    maxPaths: 16,
    slack: 3,
    maxPathLength: 24,
    maxSearchStates: 20_000
  },
  maxPatchArea4Exit: 24,
  maxCoversPerPatch: 64,
  maxSolverExpansionsPerPatch: 100_000
};

const reports = maps.map((map) => {
  const scenarios = createPatchMutationScenarioStates(map, {
    seedValues: [0.71],
    midGameFillRatios: [],
    maxSimulationSteps: 200
  }).filter((scenario) => scenario.kind === 'initial-near' || scenario.kind === 'initial-far' || scenario.scenarioId.endsWith('seed-0_71'));

  return {
    mapId: map.id,
    mapName: map.name,
    boardSize: `${map.width}x${map.height}`,
    scenarios: scenarios.map((scenario) => {
      const diagnostics = analyzeHeadAppleRectangleGrowSearch(scenario.state, options);
      return {
        scenarioId: scenario.scenarioId,
        kind: scenario.kind,
        head: diagnostics.head,
        apple: diagnostics.apple,
        currentLockedCyclePathLen: diagnostics.currentLockedCyclePathLen,
        recommendation: diagnostics.recommendation,
        modes: diagnostics.modes.map((mode) => ({
          mode: mode.mode,
          rectanglesEvaluated: mode.rectanglesEvaluated,
          v1ValidPatches: mode.v1ValidPatches,
          v2ValidPatches: mode.v2ValidPatches,
          graphValidCandidates: mode.graphValidCandidates,
          snakeUsableCandidates: mode.snakeUsableCandidates,
          improvingCandidates: mode.improvingCandidates,
          bestImprovement: mode.bestImprovement,
          bestRectangle: mode.bestRectangle,
          postApplePlanningMs: round(mode.postApplePlanningMs),
          transitionSearchMs: round(mode.transitionSearchMs),
          avgStepsPerAppleShortEval: mode.avgStepsPerAppleShortEval,
          invariantFailures: mode.invariantFailures,
          examples: mode.exitDiagnostics.slice(0, 3).map((rect) => ({
            rect: rect.rect,
            score: round(rect.score),
            exitCount: rect.exitCount,
            closestTargetExitCount: rect.closestTargetExitCount,
            arcCoverageRatio: round(rect.arcCoverageRatio),
            hasV1Alternatives: rect.hasV1Alternatives,
            hasV2Covers: rect.hasV2Covers,
            sideExitCounts: rect.sideExitCounts
          }))
        }))
      };
    })
  };
});

const table = reports.flatMap((report) => report.scenarios.flatMap((scenario) =>
  scenario.modes.map((mode) => ({
    board: report.boardSize,
    scenario: scenario.kind,
    mode: mode.mode,
    pathLen: scenario.currentLockedCyclePathLen,
    rects: mode.rectanglesEvaluated,
    validPatches: mode.v1ValidPatches + mode.v2ValidPatches,
    graphValid: mode.graphValidCandidates,
    usable: mode.snakeUsableCandidates,
    improving: mode.improvingCandidates,
    bestImprovement: mode.bestImprovement,
    planningMs: mode.postApplePlanningMs,
    transitionMs: mode.transitionSearchMs
  }))
));

console.log(JSON.stringify({ table, reports }, null, 2));
console.error('\nCompact table:');
console.error(formatTable(table));

function round(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function formatTable(rows) {
  const headers = Object.keys(rows[0] ?? {});
  const widths = headers.map((header) =>
    Math.max(header.length, ...rows.map((row) => String(row[header]).length))
  );
  const line = headers.map((header, index) => header.padEnd(widths[index])).join('  ');
  const divider = widths.map((width) => '-'.repeat(width)).join('  ');
  const body = rows.map((row) =>
    headers.map((header, index) => String(row[header]).padEnd(widths[index])).join('  ')
  );
  return [line, divider, ...body].join('\n');
}
