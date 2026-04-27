import { decideAiMove } from '../dist/src/core/ai-controller.js';
import {
  applyCertifiedPostAppleTransition,
  createCertifiedRuntimeSwitchingDiagnostics,
  getCertifiedLockedCycle
} from '../dist/src/core/certified-cycle-controller.js';
import { generateDiverseHamiltonianCycles } from '../dist/src/core/cycle-library.js';
import { advanceGame } from '../dist/src/core/game-engine.js';
import { createInitialGameState } from '../dist/src/core/game-state.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

function runCertifiedSimulation(map, appleLimit = 8) {
  const library = generateDiverseHamiltonianCycles(map);
  const diagnostics = createCertifiedRuntimeSwitchingDiagnostics();
  let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
  let steps = 0;
  const maxSteps = map.graph.nodes.length * Math.max(appleLimit, 1) * 4;

  while (!state.isOver && state.applesEaten < appleLimit && steps < maxSteps) {
    const decision = decideAiMove(state, 'certified-hamiltonian');
    if (!decision) {
      break;
    }

    const advancedState = advanceGame(state, decision.direction, 0, { next: () => 0 });
    state = applyCertifiedPostAppleTransition({
      previousState: state,
      nextState: advancedState,
      cycleLibrary: library,
      diagnostics
    });
    steps += 1;
  }

  return {
    diagnostics,
    steps,
    finalApplesEaten: state.applesEaten,
    finalOutcome: state.outcome,
    lockedCycleId: state.lockedHamiltonianCycleId,
    lockedCycleLength: getCertifiedLockedCycle(state).length
  };
}

function buildReport(map) {
  const library = generateDiverseHamiltonianCycles(map);
  const runtime = runCertifiedSimulation(map);
  const acceptedArchetypes = library.entries.map((entry) => ({
    id: entry.id,
    source: entry.source,
    archetypeName: entry.archetypeName,
    edgeDiversityFromAccepted: entry.minDistanceToAccepted,
    orderDiversityFromAccepted: entry.minOrderDistanceToAccepted
  }));
  const rejectedArchetypes = library.diagnostics.entryAttempts
    .filter((attempt) => !attempt.accepted)
    .map((attempt) => ({
      id: attempt.id,
      source: attempt.source,
      archetypeName: attempt.archetypeName,
      rejectionReason: attempt.rejectionReason,
      edgeDiversityFromAccepted: attempt.edgeDiversityFromAccepted,
      orderDiversityFromAccepted: attempt.orderDiversityFromAccepted
    }));

  return {
    mapId: map.id,
    mapName: map.name,
    size: `${map.width}x${map.height}`,
    libraryStatus: library.status,
    generatedCycles: library.diagnostics.generatedCycles,
    totalAcceptedCycles: library.entries.length,
    generationAttempts: library.diagnostics.generationAttempts,
    diversityDistances: library.diagnostics.diversityDistances,
    minDiversityDistance: library.diagnostics.minDiversityDistance,
    maxDiversityDistance: library.diagnostics.maxDiversityDistance,
    averageDiversityDistance: library.diagnostics.averageDiversityDistance,
    orderDiversityDistances: library.diagnostics.orderDiversityDistances,
    minOrderDiversityDistance: library.diagnostics.minOrderDiversityDistance,
    maxOrderDiversityDistance: library.diagnostics.maxOrderDiversityDistance,
    averageOrderDiversityDistance: library.diagnostics.averageOrderDiversityDistance,
    duplicateRejections: library.diagnostics.duplicateRejections,
    lowDiversityRejections: library.diagnostics.lowDiversityRejections,
    graphInvalidCandidates: library.diagnostics.graphInvalidCandidates,
    archetypesGenerated: library.diagnostics.entryAttempts.map((attempt) => attempt.archetypeName),
    acceptedArchetypes,
    rejectedArchetypes,
    runtimeSwitchingDiagnostics: runtime.diagnostics,
    runtimeSummary: {
      steps: runtime.steps,
      finalApplesEaten: runtime.finalApplesEaten,
      finalOutcome: runtime.finalOutcome,
      lockedCycleId: runtime.lockedCycleId,
      lockedCycleLength: runtime.lockedCycleLength
    }
  };
}

const reports = [
  createRectangularSavedMap({ id: 'diag-4x4', name: 'Diagnostic 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'diag-6x6', name: 'Diagnostic 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean).map(buildReport);

console.log(JSON.stringify(reports, null, 2));
