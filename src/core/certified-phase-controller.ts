import type { CertifiedPhase, GameState, HamiltonianCycle } from './types.js';

export const CERTIFIED_LIBRARY_PHASE_THRESHOLD = 0.7;

export interface LateGameFreeSpacePathSolver {
  solve(state: GameState, cycle: HamiltonianCycle): HamiltonianCycle | null;
}

export function certifiedFillRatio(state: Pick<GameState, 'snake' | 'map'>): number {
  const playableCellCount = state.map.graph.nodes.length;
  if (playableCellCount === 0) {
    return 1;
  }
  return state.snake.segments.length / playableCellCount;
}

export function selectCertifiedPhase(state: Pick<GameState, 'snake' | 'map'>): CertifiedPhase {
  return certifiedFillRatio(state) < CERTIFIED_LIBRARY_PHASE_THRESHOLD ? 'library' : 'late';
}
