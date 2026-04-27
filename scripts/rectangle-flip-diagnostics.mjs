import { RectangleFlipCycleRepairer } from '../dist/src/core/cycle-repairer.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';

const map = createRectangularSavedMap({ id: 'rect-4x4', name: 'Rect 4x4', width: 4, height: 4 });
const repairer = new RectangleFlipCycleRepairer({ maxFlipsChecked: 24, searchNeighborhood: null });

const state = {
  map,
  lockedHamiltonianCycle: [...map.hamiltonianCycle],
  snake: {
    segments: [map.hamiltonianCycle[0]],
    direction: 'right',
    pendingGrowth: 0
  },
  appleNodeId: map.hamiltonianCycle[9],
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

const candidate = repairer.proposeCycle(state, map.hamiltonianCycle);

console.log(
  JSON.stringify(
    {
      map: {
        width: map.width,
        height: map.height
      },
      candidateFound: candidate !== null,
      diagnostics: repairer.lastDiagnostics
    },
    null,
    2
  )
);
