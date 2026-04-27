import {
  analyzeRectanglePatches,
  classifyPatchMutationCandidatesForSnake,
  generateRectanglePatchMutationCandidates,
  rankPatchMutationCandidates
} from '../dist/src/core/two-terminal-patch-mutation.js';
import { createInitialGameState } from '../dist/src/core/game-state.js';
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
  }
};

function summarizePatch(patch) {
  return {
    rect: patch.rect,
    vertexCount: patch.vertexCount,
    crossingCount: patch.crossingCount,
    terminals: patch.terminals,
    originalInsidePath: patch.originalInsidePath,
    cacheKey: patch.cacheKey,
    alternativePathCount: patch.alternativePathCount,
    rejectionReason: patch.rejectionReason
  };
}

function summarizeCandidate(candidate) {
  return {
    rect: candidate.rect,
    terminals: candidate.terminals,
    originalInsidePath: candidate.originalInsidePath,
    replacementInsidePath: candidate.replacementInsidePath,
    cycleLength: candidate.cycle.length
  };
}

function summarizeCandidateDiagnostic(diagnostic) {
  return {
    rect: diagnostic.rect,
    terminals: diagnostic.terminals,
    rawCandidateGenerated: diagnostic.rawCandidateGenerated,
    duplicateCandidate: diagnostic.duplicateCandidate,
    graphValid: diagnostic.graphValid,
    rejectionReason: diagnostic.rejectionReason,
    replacementInsidePath: diagnostic.replacementInsidePath
  };
}

function summarizeClassification(classification) {
  return {
    rect: classification.candidate.rect,
    terminals: classification.candidate.terminals,
    graphValid: classification.graphValid,
    immediateLockedCertificate: classification.immediateLockedCertificate,
    immediateAppleForward: classification.immediateAppleForward,
    transitionPlanExists: classification.transitionPlanExists,
    transitionPathLength: classification.transitionPathLength,
    usableForSnake: classification.usableForSnake,
    reason: classification.reason
  };
}

function summarizeRankingFeatures(features) {
  if (!features) {
    return null;
  }

  return {
    candidateId: features.candidateId,
    patchId: features.patchId,
    usabilityMode: features.usabilityMode,
    pathLenToCurrentApple: features.pathLenToCurrentApple,
    transitionPathLength: features.transitionPathLength,
    currentLockedCyclePathLen: features.currentLockedCyclePathLen,
    pathLenImprovement: features.pathLenImprovement,
    mutationSize: features.mutationSize,
    cycleScore: features.cycleScore,
    patchMutationScore: features.patchMutationScore
  };
}

function summarizeRankedCandidate(rankedCandidate) {
  return {
    rect: rankedCandidate.candidate.rect,
    terminals: rankedCandidate.candidate.terminals,
    reason: rankedCandidate.classification.reason,
    features: summarizeRankingFeatures(rankedCandidate.features)
  };
}

function countReasons(classifications) {
  return classifications.reduce((counts, classification) => {
    counts[classification.reason] = (counts[classification.reason] ?? 0) + 1;
    return counts;
  }, {});
}

function buildReport(map) {
  const diagnostics = analyzeRectanglePatches(map.graph, map.hamiltonianCycle, scanOptions);
  const mutationDiagnostics = generateRectanglePatchMutationCandidates(map.graph, map.hamiltonianCycle, scanOptions);
  const initialState = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
  const snakeClassification = classifyPatchMutationCandidatesForSnake(
    initialState,
    map.graph,
    map.hamiltonianCycle,
    {
      ...scanOptions,
      transitionOptions: {
        maxPaths: 64,
        slack: 6
      }
    }
  );
  const rankingDiagnostics = rankPatchMutationCandidates(
    initialState,
    map.graph,
    map.hamiltonianCycle,
    {
      ...scanOptions,
      transitionOptions: {
        maxPaths: 64,
        slack: 6
      }
    }
  );
  const validPatchExamples = diagnostics.patches
    .filter((patch) => patch.rejectionReason === 'valid-patch')
    .slice(0, 5)
    .map(summarizePatch);
  const theoremCompatibleWithoutAlternatives = diagnostics.patches
    .filter((patch) => patch.rejectionReason === 'no-alternative-path')
    .slice(0, 5)
    .map(summarizePatch);

  return {
    mapId: map.id,
    mapName: map.name,
    size: `${map.width}x${map.height}`,
    scanOptions,
    aggregate: diagnostics.aggregate,
    validPatchExamples,
    theoremCompatibleWithoutAlternatives,
    spliceCandidateDiagnostics: {
      aggregate: mutationDiagnostics.aggregate,
      graphValidCandidateExamples: mutationDiagnostics.candidates.slice(0, 5).map(summarizeCandidate),
      rejectedCandidateExamples: mutationDiagnostics.candidateDiagnostics
        .filter((diagnostic) => diagnostic.rejectionReason !== 'graph-valid')
        .slice(0, 5)
        .map(summarizeCandidateDiagnostic)
    },
    snakeCertificationDiagnostics: {
      stateSummary: {
        snakeLength: initialState.snake.segments.length,
        appleNodeId: initialState.appleNodeId,
        head: initialState.snake.segments[0] ?? null,
        tail: initialState.snake.segments[initialState.snake.segments.length - 1] ?? null
      },
      aggregate: snakeClassification.aggregate,
      reasonCounts: countReasons(snakeClassification.classifications),
      usableCandidateExamples: snakeClassification.classifications
        .filter((classification) => classification.usableForSnake)
        .slice(0, 5)
        .map(summarizeClassification),
      unusableCandidateExamples: snakeClassification.classifications
        .filter((classification) => !classification.usableForSnake)
        .slice(0, 5)
        .map(summarizeClassification)
    },
    rankingDiagnostics: {
      aggregate: {
        ...rankingDiagnostics.aggregate,
        bestCandidate: summarizeRankingFeatures(rankingDiagnostics.aggregate.bestCandidate)
      },
      topCandidates: rankingDiagnostics.rankedCandidates.slice(0, 5).map(summarizeRankedCandidate),
      hasImprovingCandidate: rankingDiagnostics.aggregate.improvingCandidates > 0
    }
  };
}

const reports = [
  createRectangularSavedMap({ id: 'patch-diag-4x4', name: 'Patch Diagnostic 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'patch-diag-6x6', name: 'Patch Diagnostic 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean).map(buildReport);

console.log(JSON.stringify(reports, null, 2));
