import { nodeIdForCoord } from './coords.js';
import { spawnAppleNode, type RandomSource } from './apple-spawner.js';
import { CertifiedHamiltonianInvariantError } from './certified-hamiltonian-error.js';
import { selectCertifiedPhase } from './certified-phase-controller.js';
import { createBaseCycleLibraryEntryId } from './cycle-library.js';
import { validLockedCertificate } from './hamiltonian-certificate.js';
import { validateHamiltonianCycle } from './map-validator.js';
import { createSnake } from './snake.js';
import type { AiStrategyName, Direction, GameState, PlayerType, SavedMap } from './types.js';

function firstCycleDirection(map: SavedMap, spawnNodeId: string): Direction {
  const currentIndex = map.hamiltonianCycle.indexOf(spawnNodeId);
  const current = currentIndex === -1 ? map.hamiltonianCycle[0] : map.hamiltonianCycle[currentIndex];
  const next = map.hamiltonianCycle[(currentIndex + 1 + map.hamiltonianCycle.length) % map.hamiltonianCycle.length] ?? map.hamiltonianCycle[1];
  const edge = map.graph.edges.find((candidate) => candidate.from === current && candidate.to === next);
  return edge?.direction ?? 'right';
}

export function createInitialGameState(
  map: SavedMap,
  mode: PlayerType,
  aiStrategy: AiStrategyName | null,
  random: RandomSource = { next: () => Math.random() }
): GameState {
  const spawnNodeId = nodeIdForCoord(map.snakeSpawn);
  const snake = createSnake(spawnNodeId, firstCycleDirection(map, spawnNodeId));
  const appleNodeId = spawnAppleNode(map.graph, snake.segments, random);
  const nowIso = new Date().toISOString();
  const lockedHamiltonianCycle = aiStrategy === 'certified-hamiltonian' ? [...map.hamiltonianCycle] : null;

  if (lockedHamiltonianCycle && !validateHamiltonianCycle(map.graph, lockedHamiltonianCycle)) {
    throw new CertifiedHamiltonianInvariantError(
      'Certified Hamiltonian AI invariant failed: initial locked cycle does not form a valid Hamiltonian cycle for the current map graph.'
    );
  }

  if (lockedHamiltonianCycle && !validLockedCertificate(snake.segments, lockedHamiltonianCycle)) {
    throw new CertifiedHamiltonianInvariantError(
      'Certified Hamiltonian AI invariant failed: initial locked cycle does not satisfy the locked Hamiltonian certificate.'
    );
  }

  return {
    map,
    lockedHamiltonianCycle,
    lockedHamiltonianCycleId: aiStrategy === 'certified-hamiltonian' ? createBaseCycleLibraryEntryId(map.id) : null,
    certifiedPhase: aiStrategy === 'certified-hamiltonian' ? selectCertifiedPhase({ map, snake }) : null,
    certifiedMode: aiStrategy === 'certified-hamiltonian' ? 'locked' : null,
    activeCertifiedTransitionPlan: null,
    snake,
    appleNodeId,
    applesEaten: 0,
    elapsedMs: 0,
    mode,
    aiStrategy,
    isPaused: false,
    isOver: false,
    outcome: null,
    deathReason: null,
    pendingWinCheck: appleNodeId === null,
    finalAppleTimeMs: 0,
    lastMove: null,
    aiPlannedPath: [],
    stepsSinceLastApple: 0,
    startedAtIso: nowIso
  };
}
