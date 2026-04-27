import { coordFromNodeId } from './coords.js';
import { decideAiMove } from './ai-controller.js';
import {
  applyCertifiedPostAppleTransition,
  currentCyclePathLen,
  debugCertifiedSwitchSelection,
  getCertifiedLockedCycle,
  type CertifiedSwitchDebugSnapshot
} from './certified-cycle-controller.js';
import { generateDiverseHamiltonianCycles } from './cycle-library.js';
import { advanceGame } from './game-engine.js';
import { createInitialGameState } from './game-state.js';
import { appleForward, explainLockedCertificateFailure, validLockedCertificate } from './hamiltonian-certificate.js';
import { scoreCycleFeatures, computeCycleFeatures, defaultCycleScoreWeights } from './cycle-scoring.js';
import { validateHamiltonianCycle } from './map-validator.js';
import type { GameState, SavedMap } from './types.js';

export interface CertifiedAppleEventLoggerOptions {
  appleLimit?: number;
}

export interface CertifiedAppleEventBeforeSnapshot {
  stepNumber: number;
  applesEatenBefore: number;
  currentLockedCycleId: string | null;
  headPosition: string | null;
  tailPosition: string | null;
  applePosition: string | null;
  snakeLength: number;
  pathLenOnCurrentCycle: number | null;
  boardRendering: string;
}

export interface CertifiedAppleEventAfterSnapshot {
  applesEatenAfter: number;
  newApplePosition: string | null;
  snakeLength: number;
  currentLockedCycleIdBeforeSelection: string | null;
  oldCycleGraphValid: boolean;
  oldCycleLockedCertificateValid: boolean;
  oldCycleLockedCertificateFailure: string | null;
  oldCycleAppleForwardValid: boolean | null;
  boardRendering: string;
}

export interface CertifiedAppleEventFinalSelection {
  selectedCycleId: string | null;
  finalReason: string;
  newLockedCycleId: string | null;
  boardRendering: string;
  cycleOverlay: string;
}

export interface CertifiedAppleEventLogEntry {
  beforeApple: CertifiedAppleEventBeforeSnapshot;
  afterApple: CertifiedAppleEventAfterSnapshot;
  candidateEvaluation: CertifiedSwitchDebugSnapshot | null;
  finalSelection: CertifiedAppleEventFinalSelection;
}

export interface CertifiedAppleEventLog {
  mapId: string;
  mapName: string;
  size: string;
  libraryStatus: string;
  events: CertifiedAppleEventLogEntry[];
  finalStateSummary: {
    applesEaten: number;
    steps: number;
    outcome: GameState['outcome'];
    lockedCycleId: string | null;
  };
}

function formatCoord(nodeId: string | null): string | null {
  if (!nodeId) {
    return null;
  }
  const coord = coordFromNodeId(nodeId);
  return `(${coord.x},${coord.y})`;
}

function cycleGlyph(index: number): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return alphabet[index % alphabet.length] ?? '?';
}

export function renderBoard(state: GameState): string {
  const occupied = new Set(state.snake.segments);
  const head = state.snake.segments[0] ?? null;
  const tail = state.snake.segments[state.snake.segments.length - 1] ?? null;
  const walls = new Set(state.map.walls.map((wall) => `${wall.x},${wall.y}`));
  const lines: string[] = [];

  for (let y = 0; y < state.map.height; y += 1) {
    let line = '';
    for (let x = 0; x < state.map.width; x += 1) {
      const nodeId = `n-${x}-${y}`;
      const wallKey = `${x},${y}`;
      if (walls.has(wallKey)) {
        line += '#';
      } else if (head === nodeId) {
        line += 'H';
      } else if (tail === nodeId) {
        line += 'T';
      } else if (occupied.has(nodeId)) {
        line += 'B';
      } else if (state.appleNodeId === nodeId) {
        line += 'A';
      } else {
        line += '.';
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

export function renderCycleOverlay(state: GameState, cycle = getCertifiedLockedCycle(state)): string {
  const indexByNode = new Map<string, number>();
  for (let index = 0; index < cycle.length; index += 1) {
    indexByNode.set(cycle[index]!, index);
  }

  const lines: string[] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    let line = '';
    for (let x = 0; x < state.map.width; x += 1) {
      const nodeId = `n-${x}-${y}`;
      const index = indexByNode.get(nodeId);
      line += index === undefined ? '#' : cycleGlyph(index);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function collectCertifiedAppleEventLog(
  map: SavedMap,
  options: CertifiedAppleEventLoggerOptions = {}
): CertifiedAppleEventLog {
  const appleLimit = options.appleLimit ?? 8;
  const library = generateDiverseHamiltonianCycles(map);
  let state = createInitialGameState(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
  let steps = 0;
  const events: CertifiedAppleEventLogEntry[] = [];
  const maxSteps = map.graph.nodes.length * Math.max(appleLimit, 1) * 4;

  while (!state.isOver && state.applesEaten < appleLimit && steps < maxSteps) {
    const decision = decideAiMove(state, 'certified-hamiltonian');
    if (!decision) {
      break;
    }

    const advancedState = advanceGame(state, decision.direction, 0, { next: () => 0 });
    steps += 1;

    if (advancedState.applesEaten > state.applesEaten) {
      const oldCycle = getCertifiedLockedCycle(state);
      const stateOnOldCycle = {
        ...advancedState,
        lockedHamiltonianCycle: [...oldCycle],
        lockedHamiltonianCycleId: state.lockedHamiltonianCycleId
      };
      const oldCycleGraphValid = validateHamiltonianCycle(map.graph, oldCycle);
      const oldCycleLockedCertificateFailure = explainLockedCertificateFailure(stateOnOldCycle.snake.segments, oldCycle);
      const oldCycleLockedCertificateValid = oldCycleLockedCertificateFailure === null;
      const oldCycleAppleForwardValid =
        stateOnOldCycle.appleNodeId === null
          ? null
          : appleForward(stateOnOldCycle.snake.segments, stateOnOldCycle.appleNodeId, oldCycle);
      const candidateEvaluation =
        stateOnOldCycle.appleNodeId === null || library.status !== 'ready'
          ? null
          : debugCertifiedSwitchSelection(stateOnOldCycle, library);
      const transitioned = applyCertifiedPostAppleTransition({
        previousState: state,
        nextState: advancedState,
        cycleLibrary: library
      });
      const currentFeatures = computeCycleFeatures(stateOnOldCycle, oldCycle, oldCycle);
      const currentScore = scoreCycleFeatures(currentFeatures, defaultCycleScoreWeights);

      events.push({
        beforeApple: {
          stepNumber: steps,
          applesEatenBefore: state.applesEaten,
          currentLockedCycleId: state.lockedHamiltonianCycleId,
          headPosition: formatCoord(state.snake.segments[0] ?? null),
          tailPosition: formatCoord(state.snake.segments[state.snake.segments.length - 1] ?? null),
          applePosition: formatCoord(state.appleNodeId),
          snakeLength: state.snake.segments.length,
          pathLenOnCurrentCycle: currentCyclePathLen(state),
          boardRendering: renderBoard(state)
        },
        afterApple: {
          applesEatenAfter: advancedState.applesEaten,
          newApplePosition: formatCoord(advancedState.appleNodeId),
          snakeLength: advancedState.snake.segments.length,
          currentLockedCycleIdBeforeSelection: state.lockedHamiltonianCycleId,
          oldCycleGraphValid,
          oldCycleLockedCertificateValid,
          oldCycleLockedCertificateFailure,
          oldCycleAppleForwardValid,
          boardRendering: renderBoard(stateOnOldCycle)
        },
        candidateEvaluation: candidateEvaluation
          ? {
              ...candidateEvaluation,
              currentCycleScore: currentScore
            }
          : null,
        finalSelection: {
          selectedCycleId: candidateEvaluation?.selectedCycleId ?? null,
          finalReason: candidateEvaluation?.finalDecisionReason ?? 'old cycle kept',
          newLockedCycleId: transitioned.lockedHamiltonianCycleId,
          boardRendering: renderBoard(transitioned),
          cycleOverlay: renderCycleOverlay(transitioned)
        }
      });

      state = transitioned;
      continue;
    }

    state = applyCertifiedPostAppleTransition({
      previousState: state,
      nextState: advancedState,
      cycleLibrary: library
    });
  }

  return {
    mapId: map.id,
    mapName: map.name,
    size: `${map.width}x${map.height}`,
    libraryStatus: library.status,
    events,
    finalStateSummary: {
      applesEaten: state.applesEaten,
      steps,
      outcome: state.outcome,
      lockedCycleId: state.lockedHamiltonianCycleId
    }
  };
}

export function formatCertifiedAppleEventLog(report: CertifiedAppleEventLog): string {
  const lines: string[] = [];
  lines.push(`=== ${report.mapName} (${report.size}) ===`);
  lines.push(`libraryStatus=${report.libraryStatus}`);

  for (const event of report.events) {
    lines.push('');
    lines.push(`-- Apple Event ${event.afterApple.applesEatenAfter} --`);
    lines.push(
      `before: step=${event.beforeApple.stepNumber} applesBefore=${event.beforeApple.applesEatenBefore} locked=${event.beforeApple.currentLockedCycleId ?? 'base'} head=${event.beforeApple.headPosition ?? '-'} tail=${event.beforeApple.tailPosition ?? '-'} apple=${event.beforeApple.applePosition ?? '-'} length=${event.beforeApple.snakeLength} pathLen=${event.beforeApple.pathLenOnCurrentCycle ?? 'null'}`
    );
    lines.push(event.beforeApple.boardRendering);
    lines.push(
      `after: applesAfter=${event.afterApple.applesEatenAfter} newApple=${event.afterApple.newApplePosition ?? '-'} length=${event.afterApple.snakeLength} lockedBeforeSelection=${event.afterApple.currentLockedCycleIdBeforeSelection ?? 'base'} graphValid=${event.afterApple.oldCycleGraphValid} lockedCert=${event.afterApple.oldCycleLockedCertificateValid} appleForward=${event.afterApple.oldCycleAppleForwardValid ?? 'null'}`
    );
    if (event.afterApple.oldCycleLockedCertificateFailure) {
      lines.push(`oldCycleLockedCertificateFailure=${event.afterApple.oldCycleLockedCertificateFailure}`);
    }
    lines.push(event.afterApple.boardRendering);

    if (event.candidateEvaluation) {
      lines.push(
        `selection: currentLocked=${event.candidateEvaluation.currentLockedCycleId ?? 'base'} currentPathLen=${event.candidateEvaluation.currentCyclePathLen ?? 'null'} currentScore=${event.candidateEvaluation.currentCycleScore ?? 'null'} finalReason=${event.candidateEvaluation.finalDecisionReason}`
      );
      for (const candidate of event.candidateEvaluation.candidates) {
        lines.push(
          `candidate ${candidate.candidateId} [${candidate.source}/${candidate.archetypeName}] pathLen=${candidate.pathLen ?? 'null'} score=${candidate.score ?? 'null'} graphValid=${candidate.graphValid} lockedCert=${candidate.lockedCertificateValid} appleForward=${candidate.appleForwardValid ?? 'null'} pathLenDelta=${candidate.pathLenDelta ?? 'null'} scoreDelta=${candidate.scoreDelta ?? 'null'} decision=${candidate.finalDecision}`
        );
        if (candidate.lockedCertificateFailure) {
          lines.push(`  lockedCertificateFailure=${candidate.lockedCertificateFailure}`);
        }
      }
    }

    lines.push(
      `final: selected=${event.finalSelection.selectedCycleId ?? 'old cycle kept'} reason=${event.finalSelection.finalReason} newLocked=${event.finalSelection.newLockedCycleId ?? 'base'}`
    );
    lines.push(event.finalSelection.boardRendering);
    lines.push(event.finalSelection.cycleOverlay);
  }

  lines.push('');
  lines.push(
    `summary: apples=${report.finalStateSummary.applesEaten} steps=${report.finalStateSummary.steps} outcome=${report.finalStateSummary.outcome ?? 'in-progress'} locked=${report.finalStateSummary.lockedCycleId ?? 'base'}`
  );
  return lines.join('\n');
}
