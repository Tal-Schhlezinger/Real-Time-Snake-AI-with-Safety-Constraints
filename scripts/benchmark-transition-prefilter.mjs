import { runCertifiedAiComputeBenchmark } from '../dist/src/core/certified-ai-compute-benchmark.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const maps = [
  createRectangularSavedMap({ id: 'prefilter-bench-6x6', name: 'Prefilter Benchmark 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const variants = [
  {
    label: 'broad',
    patchOptions: {
      patchRectangleSearchMode: 'broad',
      transitionPrefilterMode: 'none'
    }
  },
  {
    label: 'arc-chunk',
    patchOptions: {
      patchRectangleSearchMode: 'arc-chunk',
      transitionPrefilterMode: 'none'
    }
  },
  {
    label: 'arc-chunk+prefilter-top5',
    patchOptions: {
      patchRectangleSearchMode: 'arc-chunk',
      transitionPrefilterMode: 'combined',
      maxTransitionCandidatesPerPlanningEvent: 5,
      minCheapImprovementForTransitionSearch: 1,
      preferImmediateLockedBeforeTransitionSearch: true
    }
  },
  {
    label: 'arc-chunk+prefilter-top10',
    patchOptions: {
      patchRectangleSearchMode: 'arc-chunk',
      transitionPrefilterMode: 'combined',
      maxTransitionCandidatesPerPlanningEvent: 10,
      minCheapImprovementForTransitionSearch: 1,
      preferImmediateLockedBeforeTransitionSearch: true
    }
  },
  {
    label: 'targeted+fallback+prefilter',
    patchOptions: {
      patchRectangleSearchMode: 'targeted-then-broad-fallback',
      fallbackToBroadIfNoCandidates: true,
      transitionPrefilterMode: 'combined',
      maxTransitionCandidatesPerPlanningEvent: 10,
      minCheapImprovementForTransitionSearch: 1,
      preferImmediateLockedBeforeTransitionSearch: true
    }
  }
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
  for (const variant of variants) {
    results.push(runCertifiedAiComputeBenchmark(map, {
      ...commonOptions,
      patchOptions: {
        ...commonOptions.patchOptions,
        ...variant.patchOptions
      }
    }));
  }
}

const table = results.map((result, index) => {
  const variant = variants[index % variants.length];
  return {
    board: result.boardSize,
    variant: variant.label,
    apples: result.quality.applesEaten,
    avgStepsPerApple: round(result.quality.averageStepsPerApple),
    postApplePlanningMs: round(result.timing.totalPostApplePlanningMs),
    transitionSearchMs: round(result.timing.transitionSearchMs),
    maxPlanningSpikeMs: round(result.timing.maxSinglePlanningMs),
    v1Selections: result.candidates.patchSelectedCandidates,
    v2Selections: result.candidates.v2SelectedCandidates,
    v1TransitionSearches: result.diagnostics.patchTransitionSearchesStarted,
    v2TransitionSearches: result.diagnostics.v2TransitionSearchesStarted,
    v1SkippedByPrefilter: result.diagnostics.patchTransitionCandidatesSkippedByPrefilter,
    v2SkippedByPrefilter: result.diagnostics.v2TransitionCandidatesSkippedByPrefilter,
    invariantFailures: result.quality.invariantFailures
  };
});

console.log(JSON.stringify({ table, results: results.map(compactResult) }, null, 2));
console.error('\nTransition prefilter benchmark:');
console.error(formatTable(table));

function compactResult(result) {
  return {
    mapId: result.mapId,
    mapName: result.mapName,
    boardSize: result.boardSize,
    quality: result.quality,
    timing: result.timing,
    candidates: result.candidates,
    diagnostics: {
      rectangleSearchMode: result.diagnostics.rectangleSearchMode,
      patchNonImmediateCandidates: result.diagnostics.patchNonImmediateCandidates,
      patchTransitionCandidatesAfterPrefilter: result.diagnostics.patchTransitionCandidatesAfterPrefilter,
      patchTransitionCandidatesSkippedByPrefilter: result.diagnostics.patchTransitionCandidatesSkippedByPrefilter,
      patchTransitionSearchesStarted: result.diagnostics.patchTransitionSearchesStarted,
      patchTransitionSearchesSucceeded: result.diagnostics.patchTransitionSearchesSucceeded,
      patchImmediateLockedSelectedWithoutTransition: result.diagnostics.patchImmediateLockedSelectedWithoutTransition,
      v2NonImmediateCandidates: result.diagnostics.v2NonImmediateCandidates,
      v2TransitionCandidatesAfterPrefilter: result.diagnostics.v2TransitionCandidatesAfterPrefilter,
      v2TransitionCandidatesSkippedByPrefilter: result.diagnostics.v2TransitionCandidatesSkippedByPrefilter,
      v2TransitionSearchesStarted: result.diagnostics.v2TransitionSearchesStarted,
      v2TransitionSearchesSucceeded: result.diagnostics.v2TransitionSearchesSucceeded,
      v2ImmediateLockedSelectedWithoutTransition: result.diagnostics.v2ImmediateLockedSelectedWithoutTransition
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
