import { runCertifiedAiComputeBenchmark } from '../dist/src/core/certified-ai-compute-benchmark.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';

const maps = [
  createRectangularSavedMap({ id: 'targeted-bench-6x6', name: 'Targeted Benchmark 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const searchModes = [
  'broad',
  'arc-chunk',
  'combined-targeted',
  'targeted-then-broad-fallback'
];

const commonOptions = {
  variant: 'v1-v2',
  cacheMode: 'on',
  maxSteps: 600,
  seed: 20260425,
  initialAppleSeed: 0.71,
  cycleLibraryOptions: {
    maxCycles: 10,
    maxAttempts: 64,
    minDiversity: 0.2
  },
  patchOptions: {
    enablePatchMutation: true,
    enableV2PatchMutation: true,
    maxPatchWidth: 6,
    maxPatchHeight: 6,
    maxPatchArea: 20,
    maxPatchRectsScanned: 64,
    maxPatchCandidates: 300,
    maxTransitionPathsPerCandidate: 64,
    maxTransitionSlack: 6,
    maxV2FillRatio: 0.15,
    maxV2RectsScanned: 64,
    maxV2Candidates: 300,
    maxV2PatchArea: 24,
    maxV2TransitionPathsPerCandidate: 8,
    maxV2TransitionSlack: 2,
    maxV2TransitionPathLength: 16,
    maxV2TransitionSearchStates: 10_000,
    maxV2SolverExpansions: 100_000,
    maxV2PathCoversPerPatch: 64,
    arcChunkSize: 8,
    arcChunkStride: 4,
    arcGrowShrinkRadius: 1,
    maxTargetedRectangles: 64
  }
};

const results = [];
for (const map of maps) {
  for (const searchMode of searchModes) {
    results.push(runCertifiedAiComputeBenchmark(map, {
      ...commonOptions,
      patchOptions: {
        ...commonOptions.patchOptions,
        patchRectangleSearchMode: searchMode,
        fallbackToBroadIfNoCandidates: searchMode === 'targeted-then-broad-fallback'
      }
    }));
  }
}

const table = results.map((result) => {
  const diagnostics = result.diagnostics;
  const graphValidCandidates = diagnostics.patchGraphValidCandidates + diagnostics.v2GraphValidCandidates;
  const usableCandidates = diagnostics.patchSnakeUsableCandidates + diagnostics.v2SnakeUsableCandidates;
  const improvingCandidates = diagnostics.patchImprovingCandidates + diagnostics.v2ImprovingCandidates;

  return {
    board: result.boardSize,
    mode: diagnostics.rectangleSearchMode,
    apples: result.quality.applesEaten,
    avgStepsPerApple: round(result.quality.averageStepsPerApple),
    postApplePlanningMs: round(result.timing.totalPostApplePlanningMs),
    transitionSearchMs: round(result.timing.transitionSearchMs),
    graphValidCandidates,
    usableCandidates,
    improvingCandidates,
    v1Selections: result.candidates.patchSelectedCandidates,
    v2Selections: result.candidates.v2SelectedCandidates,
    invariantFailures: result.quality.invariantFailures,
    maxPlanningSpikeMs: round(result.timing.maxSinglePlanningMs),
    targetedRectanglesUsed: diagnostics.targetedRectanglesUsed,
    broadFallbackUsed: diagnostics.broadFallbackUsed,
    candidateYieldPerRectangle: round(diagnostics.candidateYieldPerRectangle),
    improvingYieldPerRectangle: round(diagnostics.improvingYieldPerRectangle)
  };
});

console.log(JSON.stringify({ table, results: results.map(compactResult) }, null, 2));
console.error('\nTargeted rectangle search benchmark:');
console.error(formatTable(table));

function compactResult(result) {
  return {
    mapId: result.mapId,
    mapName: result.mapName,
    boardSize: result.boardSize,
    variant: result.variant,
    cacheMode: result.cacheMode,
    quality: result.quality,
    timing: result.timing,
    candidates: result.candidates,
    rectangleSearch: {
      mode: result.diagnostics.rectangleSearchMode,
      targetedRectanglesGenerated: result.diagnostics.targetedRectanglesGenerated,
      targetedRectanglesUsed: result.diagnostics.targetedRectanglesUsed,
      broadFallbackUsed: result.diagnostics.broadFallbackUsed,
      arcChunkRectangles: result.diagnostics.arcChunkRectangles,
      headAppleRectangles: result.diagnostics.headAppleRectangles,
      candidateYieldPerRectangle: result.diagnostics.candidateYieldPerRectangle,
      improvingYieldPerRectangle: result.diagnostics.improvingYieldPerRectangle
    }
  };
}

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
