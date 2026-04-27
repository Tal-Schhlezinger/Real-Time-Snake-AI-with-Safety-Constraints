import type { GameState, HighScoreEntry } from './types.js';

export function compareHighScores(left: HighScoreEntry, right: HighScoreEntry): number {
  if (left.applesEaten !== right.applesEaten) {
    return right.applesEaten - left.applesEaten;
  }
  if (left.finalAppleReachedMs !== right.finalAppleReachedMs) {
    return left.finalAppleReachedMs - right.finalAppleReachedMs;
  }
  return right.recordedAtIso.localeCompare(left.recordedAtIso);
}

export function sortHighScores(entries: HighScoreEntry[]): HighScoreEntry[] {
  return [...entries].sort(compareHighScores);
}

export function scorePlacement(entries: HighScoreEntry[], score: HighScoreEntry): number {
  const sorted = sortHighScores([...entries, score]);
  return sorted.findIndex((entry) => entry.id === score.id) + 1;
}

export function createHighScoreEntryFromGame(state: GameState): HighScoreEntry {
  return {
    id: crypto.randomUUID(),
    mapId: state.map.id,
    mapName: state.map.name,
    playerType: state.mode,
    aiStrategy: state.aiStrategy,
    applesEaten: state.applesEaten,
    totalElapsedMs: state.elapsedMs,
    averageMsPerApple: state.applesEaten > 0 ? (state.finalAppleTimeMs ?? 0) / state.applesEaten : null,
    finalAppleReachedMs: state.finalAppleTimeMs ?? 0,
    result: state.outcome ?? 'lose',
    recordedAtIso: new Date().toISOString()
  };
}
