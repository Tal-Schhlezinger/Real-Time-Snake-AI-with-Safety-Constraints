import { decideAiMove } from '../dist/src/core/ai-controller.js';
import { applyCertifiedPostAppleTransition, getCertifiedLockedCycle } from '../dist/src/core/certified-cycle-controller.js';
import { analyzeCertifiedTransitionTargets } from '../dist/src/core/certified-transition-diagnostics.js';
import { generateDiverseHamiltonianCycles } from '../dist/src/core/cycle-library.js';
import { advanceGame } from '../dist/src/core/game-engine.js';
import { createInitialGameState } from '../dist/src/core/game-state.js';
import { renderBoard, renderCycleOverlay } from '../dist/src/core/certified-apple-event-log.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

function interestingTargets(diagnostics) {
  return diagnostics.targets
    .filter((target) => target.isCurrentLockedCycle || target.successfulTransitionPaths > 0 || target.safePathsToApple > 0)
    .map((target) => ({
      targetCycleId: target.targetCycleId,
      source: target.source,
      archetypeName: target.archetypeName,
      isCurrentLockedCycle: target.isCurrentLockedCycle,
      shortestDistanceToApple: target.shortestDistanceToApple,
      pathsGenerated: target.pathsGenerated,
      safePathsToApple: target.safePathsToApple,
      successfulTransitionPaths: target.successfulTransitionPaths,
      bestSuccessfulPathLength: target.bestSuccessfulPathLength,
      bestSuccessfulPath: target.bestSuccessfulPath,
      targetPathLenAfterTransition: target.targetPathLenAfterTransition,
      failureReasons: target.failureReasons,
      lockedCertificateFailures: target.lockedCertificateFailures.slice(0, 3)
    }));
}

function collectStates(map, appleEvents = 3) {
  const library = generateDiverseHamiltonianCycles(map);
  let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
  const snapshots = [{
    label: 'before first apple',
    state
  }];
  let steps = 0;
  const maxSteps = map.graph.nodes.length * Math.max(appleEvents + 1, 1) * 4;

  while (!state.isOver && snapshots.length < appleEvents + 1 && steps < maxSteps) {
    const decision = decideAiMove(state, 'certified-hamiltonian');
    if (!decision) {
      break;
    }
    const previousState = state;
    const advancedState = advanceGame(state, decision.direction, 0, { next: () => 0 });
    state = applyCertifiedPostAppleTransition({
      previousState,
      nextState: advancedState,
      cycleLibrary: library
    });
    steps += 1;

    if (state.applesEaten > previousState.applesEaten) {
      snapshots.push({
        label: `after apple ${state.applesEaten} / length ${state.snake.segments.length}`,
        state
      });
    }
  }

  return {
    library,
    snapshots
  };
}

function buildReport(map) {
  const { library, snapshots } = collectStates(map);
  return {
    mapId: map.id,
    mapName: map.name,
    size: `${map.width}x${map.height}`,
    libraryStatus: library.status,
    librarySize: library.entries.length,
    snapshots: snapshots.map(({ label, state }) => {
      const diagnostics = analyzeCertifiedTransitionTargets(state, library, {
        slack: 6,
        maxPaths: 64
      });
      return {
        label,
        snakeLength: state.snake.segments.length,
        applesEaten: state.applesEaten,
        currentLockedCycleId: state.lockedHamiltonianCycleId,
        applePosition: state.appleNodeId,
        board: renderBoard(state),
        currentCycleOverlay: renderCycleOverlay(state, getCertifiedLockedCycle(state)),
        transitionSummary: {
          targetCyclesChecked: diagnostics.targetCyclesChecked,
          pathsGenerated: diagnostics.pathsGenerated,
          shortestDistanceToApple: diagnostics.shortestDistanceToApple,
          targetsWithSuccessfulTransition: diagnostics.targetsWithSuccessfulTransition,
          totalSuccessfulTransitionPaths: diagnostics.totalSuccessfulTransitionPaths,
          bestTargetCycleId: diagnostics.bestTargetCycleId,
          bestPathLength: diagnostics.bestPathLength,
          bestPath: diagnostics.bestPath,
          nonCurrentTargetsWithSuccess: diagnostics.targets.filter((target) => !target.isCurrentLockedCycle && target.successfulTransitionPaths > 0).length
        },
        targetSummaries: interestingTargets(diagnostics)
      };
    })
  };
}

const reports = [
  createRectangularSavedMap({ id: 'transition-4x4', name: 'Transition 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'transition-6x6', name: 'Transition 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean).map(buildReport);

console.log(JSON.stringify(reports, null, 2));
