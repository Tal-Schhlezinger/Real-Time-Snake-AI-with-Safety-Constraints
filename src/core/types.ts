export type Direction = 'up' | 'right' | 'down' | 'left';

export interface Coord {
  x: number;
  y: number;
}

export type NodeId = string;
export type HamiltonianCycle = NodeId[];
export type CertifiedPhase = 'library' | 'late';
export type CertifiedMode = 'locked' | 'transition';

export type PlayerType = 'human' | 'ai';

export type AiStrategyName = 'hamiltonian' | 'certified-hamiltonian' | 'greedy';

export interface PortalPair {
  id: string;
  a: Coord;
  b: Coord;
}

export interface GraphNode {
  id: NodeId;
  x: number;
  y: number;
}

export type GraphEdgeKind = 'adjacent' | 'portal';

export interface GraphEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  direction: Direction;
  kind: GraphEdgeKind;
  viaPortalId?: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SavedMap {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: Coord[];
  portals: PortalPair[];
  snakeSpawn: Coord;
  graph: GraphSnapshot;
  hamiltonianCycle: HamiltonianCycle;
  createdAt: string;
  updatedAt: string;
}

export interface EditableMapDraft {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: Coord[];
  portals: PortalPair[];
  snakeSpawn: Coord | null;
  createdAt: string;
  updatedAt: string;
}

export type MapValidationReason =
  | 'missing-snake-spawn'
  | 'spawn-on-invalid-tile'
  | 'unpaired-portals'
  | 'portal-overlap'
  | 'portal-exit-invalid'
  | 'playable-graph-empty'
  | 'disconnected-playable-graph'
  | 'dead-end-cell'
  | 'bridge-edge'
  | 'insufficient-directed-degree'
  | 'no-hamiltonian-cycle'
  | 'cancelled'
  | 'timed-out'
  | 'graph-grid-mismatch';

export interface ValidationMessage {
  code: MapValidationReason;
  message: string;
}

export interface MapValidationResult {
  isValid: boolean;
  graph: GraphSnapshot;
  cycle: HamiltonianCycle;
  reasons: ValidationMessage[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    expansions: number;
    durationMs: number;
  };
}

export type GameOutcome = 'win' | 'lose';

export type DeathReason =
  | 'wall'
  | 'out-of-bounds'
  | 'self'
  | 'invalid-portal'
  | 'no-next-move';

export interface SnakeState {
  segments: NodeId[];
  direction: Direction;
  pendingGrowth: number;
}

export interface MoveResolution {
  from: NodeId;
  to: NodeId;
  direction: Direction;
  edgeKind: GraphEdgeKind;
  viaPortalId?: string;
}

export interface GameSettings {
  tickMs: number;
  cellSize: number;
  showHamiltonianOverlay: boolean;
  showAiPathOverlay: boolean;
}

export interface CertifiedTransitionPlan {
  source: 'v1-patch' | 'v2-patch';
  targetCycleId: string;
  targetCycle: HamiltonianCycle;
  certifiedAppleNodeId: NodeId;
  certifiedAtApplesEaten: number;
  directions: Direction[];
  expectedHeadPath: NodeId[];
  nextDirectionIndex: number;
}

export interface GameState {
  map: SavedMap;
  lockedHamiltonianCycle: HamiltonianCycle | null;
  lockedHamiltonianCycleId: string | null;
  certifiedPhase: CertifiedPhase | null;
  certifiedMode: CertifiedMode | null;
  activeCertifiedTransitionPlan: CertifiedTransitionPlan | null;
  snake: SnakeState;
  appleNodeId: NodeId | null;
  applesEaten: number;
  elapsedMs: number;
  mode: PlayerType;
  aiStrategy: AiStrategyName | null;
  isPaused: boolean;
  isOver: boolean;
  outcome: GameOutcome | null;
  deathReason: DeathReason | null;
  pendingWinCheck: boolean;
  finalAppleTimeMs: number | null;
  lastMove: MoveResolution | null;
  aiPlannedPath: NodeId[];
  stepsSinceLastApple: number;
  startedAtIso: string;
}

export interface CertifiedHamiltonianDebugInfo {
  headIndex: number | null;
  tailIndex: number | null;
  appleIndex: number | null;
  distanceHeadToApple: number | null;
  snakeLength: number;
  playableCellCount: number;
  stepsSinceLastApple: number;
}

export interface HighScoreEntry {
  id: string;
  mapId: string;
  mapName: string;
  playerType: PlayerType;
  aiStrategy: AiStrategyName | null;
  applesEaten: number;
  totalElapsedMs: number;
  averageMsPerApple: number | null;
  finalAppleReachedMs: number;
  result: GameOutcome;
  recordedAtIso: string;
}

export interface SettingsData extends GameSettings {
  scoreFilter: 'all' | PlayerType;
}

export interface AiDecision {
  direction: Direction;
  plannedPath: NodeId[];
  strategyUsed: AiStrategyName;
}
