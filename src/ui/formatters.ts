import type { DeathReason, HighScoreEntry, MapValidationResult } from '../core/types.js';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDeathReason(reason: DeathReason | null): string {
  switch (reason) {
    case 'wall':
      return 'Crashed into a wall';
    case 'out-of-bounds':
      return 'Left the board';
    case 'self':
      return 'Ran into the snake body';
    case 'invalid-portal':
      return 'Teleported into an invalid tile';
    case 'no-next-move':
      return 'No legal next move remained';
    default:
      return 'Run ended';
  }
}

export function summarizeValidation(result: MapValidationResult | null, pendingPortalAnchor: boolean): string {
  if (pendingPortalAnchor) {
    return 'Illegal: portals must be linked in pairs.';
  }
  if (!result) {
    return 'Waiting to validate.';
  }
  if (result.isValid) {
    return `Legal map. ${result.stats.nodeCount} playable nodes, ${result.stats.edgeCount} edges.`;
  }
  return result.reasons[0]?.message ?? 'Map is illegal.';
}

export function formatScoreLabel(entry: HighScoreEntry): string {
  const strategy = entry.aiStrategy ? ` / ${entry.aiStrategy}` : '';
  return `${entry.applesEaten} apples • ${formatDuration(entry.finalAppleReachedMs)} final apple • ${entry.playerType}${strategy}`;
}
