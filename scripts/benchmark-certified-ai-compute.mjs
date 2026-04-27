import { runCertifiedAiComputeBenchmark } from '../dist/src/core/certified-ai-compute-benchmark.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const maps = [
  createRectangularSavedMap({ id: 'bench-6x6', name: 'Benchmark 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const variants = [
  { variant: 'library-only', cacheMode: 'off' },
  { variant: 'v1', cacheMode: 'off' },
  { variant: 'v1', cacheMode: 'on' },
  { variant: 'v1-v2', cacheMode: 'off' },
  { variant: 'v1-v2', cacheMode: 'on' }
];

const commonOptions = {
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
    maxV2SolverExpansions: 100_000,
    maxV2PathCoversPerPatch: 64
  }
};

const results = [];
for (const map of maps) {
  for (const variant of variants) {
    results.push(runCertifiedAiComputeBenchmark(map, {
      ...commonOptions,
      ...variant
    }));
  }
}

const table = results.map((result) => ({
  board: result.boardSize,
  variant: result.variant,
  cache: result.cacheMode,
  apples: result.quality.applesEaten,
  avgStepsPerApple: round(result.quality.averageStepsPerApple),
  maxStepsBetweenApples: result.quality.maxStepsBetweenApples,
  invariantFailures: result.quality.invariantFailures,
  aiDecisionMs: round(result.timing.totalAiDecisionMs),
  postApplePlanningMs: round(result.timing.totalPostApplePlanningMs),
  transitionSearchMs: round(result.timing.transitionSearchMs),
  certificationMs: round(result.timing.certificationMs),
  scoringMs: round(result.timing.scoringMs),
  v1GenerationMs: round(result.timing.v1GenerationMs),
  v2GenerationMs: round(result.timing.v2GenerationMs),
  evalRuntimeMs: round(result.timing.evaluationRuntimeMs),
  v1Selections: result.candidates.patchSelectedCandidates,
  v2Selections: result.candidates.v2SelectedCandidates,
  v1Cache: `${result.candidates.v1CandidateCacheHits}/${result.candidates.v1CandidateCacheMisses}`,
  v2Cache: `${result.candidates.v2CandidateCacheHits}/${result.candidates.v2CandidateCacheMisses}`
}));

console.log(JSON.stringify({ table, results: results.map(compactResult) }, null, 2));
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

function compactResult(result) {
  return {
    mapId: result.mapId,
    mapName: result.mapName,
    boardSize: result.boardSize,
    variant: result.variant,
    cacheMode: result.cacheMode,
    methodology: result.methodology,
    quality: result.quality,
    timing: result.timing,
    candidates: result.candidates
  };
}
