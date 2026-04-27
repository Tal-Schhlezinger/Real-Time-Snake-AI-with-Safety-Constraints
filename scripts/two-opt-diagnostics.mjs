import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { TwoOptDiagnosticAnalyzer } from '../dist/src/core/two-opt-diagnostics.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const showDetails = process.argv.includes('--details');

function makeDiagnosticState(map) {
  const appleIndex = Math.floor(map.hamiltonianCycle.length / 2);
  return {
    map,
    lockedHamiltonianCycle: [...map.hamiltonianCycle],
    snake: {
      segments: [map.hamiltonianCycle[0]],
      direction: 'right',
      pendingGrowth: 0
    },
    appleNodeId: map.hamiltonianCycle[appleIndex],
    applesEaten: 0,
    elapsedMs: 0,
    mode: 'ai',
    aiStrategy: 'certified-hamiltonian',
    isPaused: false,
    isOver: false,
    outcome: null,
    deathReason: null,
    pendingWinCheck: false,
    finalAppleTimeMs: 0,
    lastMove: null,
    aiPlannedPath: [],
    stepsSinceLastApple: 0,
    startedAtIso: '2026-01-01T00:00:00.000Z'
  };
}

function runDiagnostics(map, options) {
  const analyzer = new TwoOptDiagnosticAnalyzer(options);
  const result = analyzer.analyze(makeDiagnosticState(map), map.hamiltonianCycle);
  return {
    mapId: map.id,
    mapName: map.name,
    size: `${map.width}x${map.height}`,
    candidateFound: result.bestCandidate !== null,
    diagnostics: result.diagnostics,
    ...(showDetails
      ? {
          representativeFailedCandidates: result.invalidCandidateDetails.slice(0, 5).map((detail) => ({
            edgePairIndices: detail.edgePairIndices,
            reconnectMode: detail.reconnectMode,
            intendedReplacementEdges: detail.intendedReplacementEdges,
            allIntendedReplacementEdgesExist: detail.allIntendedReplacementEdgesExist,
            firstInvalidEdge: detail.firstInvalidEdge,
            firstInvalidEdgeIndex: detail.firstInvalidEdgeIndex,
            firstInvalidEdgeMatchesIntendedReplacementSeam: detail.firstInvalidEdgeMatchesIntendedReplacementSeam,
            failureCategory: detail.failureCategory,
            firstInvalidEdgeLocation: detail.firstInvalidEdgeLocation,
            candidateLength: detail.candidateLength,
            duplicateNodeCount: detail.duplicateNodeCount,
            missingNodeCount: detail.missingNodeCount
          }))
        }
      : {})
  };
}

const maps = [
  createRectangularSavedMap({ id: 'diag-4x4', name: 'Diagnostic 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'diag-6x6', name: 'Diagnostic 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean);

const reports = maps.map((map) =>
  runDiagnostics(map, {
    exhaustive: map.width <= 6 && map.height <= 6,
    maxPairsChecked: map.width <= 6 && map.height <= 6 ? 2_000 : 128,
    searchNeighborhood: map.width <= 6 && map.height <= 6 ? null : 3
  })
);

console.log(JSON.stringify(reports, null, 2));
