import {
  analyzeMultiTerminalRectanglePatches,
  analyzeSamePairing4ExitPathCovers,
  classifyV2FourExitSpliceCandidatesForSnake,
  generateV2FourExitSpliceCandidates
} from '../dist/src/core/multi-terminal-patch-diagnostics.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createInitialGameState } from '../dist/src/core/game-state.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const scanOptions = {
  maxWidth: 6,
  maxHeight: 6,
  maxArea: 24
};

function summarizePatch(patch) {
  return {
    rect: patch.rect,
    crossingCount: patch.crossingCount,
    terminals: patch.terminals,
    repeatedTerminalCount: patch.repeatedTerminalCount,
    exitClass: patch.exitClass,
    terminalPairs: patch.fourExitDecomposition?.terminalPairs ?? null,
    rejectionReason: patch.rejectionReason
  };
}

function buildReport(map) {
  const diagnostics = analyzeMultiTerminalRectanglePatches(map.graph, map.hamiltonianCycle, scanOptions);
  const pathCoverDiagnostics = analyzeSamePairing4ExitPathCovers(map.graph, map.hamiltonianCycle, {
    ...scanOptions,
    maxPatchArea4Exit: 24,
    maxCoversPerPatch: 64,
    maxSolverExpansionsPerPatch: 100_000
  });
  const spliceDiagnostics = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, {
    ...scanOptions,
    maxPatchArea4Exit: 24,
    maxCoversPerPatch: 64,
    maxSolverExpansionsPerPatch: 100_000
  });
  const state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
  const snakeDiagnostics = classifyV2FourExitSpliceCandidatesForSnake(state, map.graph, map.hamiltonianCycle, {
    ...scanOptions,
    maxPatchArea4Exit: 24,
    maxCoversPerPatch: 64,
    maxSolverExpansionsPerPatch: 100_000,
    transitionOptions: {
      maxPaths: 64,
      slack: 6
    }
  });

  return {
    mapId: map.id,
    mapName: map.name,
    boardSize: `${map.width}x${map.height}`,
    scanOptions,
    aggregate: diagnostics.aggregate,
    validFourExitExamples: diagnostics.patches
      .filter((patch) => patch.rejectionReason === 'valid-four-exit-decomposition')
      .slice(0, 5)
      .map(summarizePatch),
    repeatedTerminalExamples: diagnostics.patches
      .filter((patch) => patch.rejectionReason === 'repeated-terminal')
      .slice(0, 5)
      .map(summarizePatch),
    sixExitExamples: diagnostics.patches
      .filter((patch) => patch.exitClass === 'six')
      .slice(0, 5)
      .map(summarizePatch),
    eightExitExamples: diagnostics.patches
      .filter((patch) => patch.exitClass === 'eight')
      .slice(0, 5)
      .map(summarizePatch),
    samePairingPathCoverDiagnostics: {
      aggregate: pathCoverDiagnostics.aggregate,
      exampleCovers: pathCoverDiagnostics.patches
        .filter((patch) => patch.coversFound > 0)
        .slice(0, 5)
        .map((patch) => ({
          rect: patch.rect,
          terminalPairs: patch.terminalPairs,
          coversFound: patch.coversFound,
          solverExpansions: patch.solverExpansions,
          budgetExhausted: patch.budgetExhausted,
          rejectionReason: patch.rejectionReason,
          covers: patch.covers.slice(0, 2)
        }))
    },
    samePairingSpliceDiagnostics: {
      aggregate: spliceDiagnostics.aggregate,
      exampleGraphValidCandidates: spliceDiagnostics.candidateDiagnostics
        .filter((candidate) => candidate.graphValid)
        .slice(0, 5)
        .map((candidate) => ({
          rect: candidate.rect,
          terminalPairs: candidate.terminalPairs,
          coverSignature: candidate.coverSignature,
          rejectionReason: candidate.rejectionReason,
          edgeSetDegreeValid: candidate.edgeSetDegreeValid,
          reconstructedSingleCycle: candidate.reconstructedSingleCycle,
          nodeSetMatchesOldCycle: candidate.nodeSetMatchesOldCycle,
          graphValid: candidate.graphValid
        }))
    },
    samePairingSnakeDiagnostics: {
      aggregate: snakeDiagnostics.aggregate,
      topCandidates: snakeDiagnostics.rankedCandidates.slice(0, 5).map((ranked) => ({
        rect: ranked.candidate.rect,
        coverSignature: ranked.candidate.coverSignature,
        reason: ranked.classification.reason,
        usabilityMode: ranked.features.usabilityMode,
        currentLockedCyclePathLen: ranked.features.currentLockedCyclePathLen,
        candidatePathLenToApple: ranked.features.candidatePathLenToApple,
        transitionPathLength: ranked.features.transitionPathLength,
        pathLenImprovement: ranked.features.pathLenImprovement,
        changedCycleEdges: ranked.features.changedCycleEdges,
        rectangleArea: ranked.features.rectangleArea,
        finalV2MutationScore: ranked.features.finalV2MutationScore
      }))
    }
  };
}

const reports = [
  createRectangularSavedMap({ id: 'multi-terminal-4x4', name: 'Multi-Terminal 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'multi-terminal-6x6', name: 'Multi-Terminal 6x6', width: 6, height: 6 }),
  createDefaultMaps().find((map) => map.id === 'classic-12x8') ?? createDefaultMaps()[0]
].filter(Boolean).map(buildReport);

console.log(JSON.stringify(reports, null, 2));
