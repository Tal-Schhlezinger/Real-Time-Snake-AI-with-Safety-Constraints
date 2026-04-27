import { scorePlacement, sortHighScores } from '../core/high-score-utils.js';
import type { HighScoreEntry, PlayerType } from '../core/types.js';
import { createBrowserStorageAdapter, safeParseJson, type StorageAdapter } from './storage-adapter.js';

const HIGH_SCORE_KEY = 'snake-hamiltonian:high-scores';

export class HighScoreStore {
  constructor(private readonly storage: StorageAdapter = createBrowserStorageAdapter()) {}

  listAll(): HighScoreEntry[] {
    const parsed = safeParseJson<HighScoreEntry[]>(this.storage.getItem(HIGH_SCORE_KEY), []);
    return sortHighScores(parsed.filter((entry) => typeof entry?.mapId === 'string'));
  }

  listForMap(mapId: string, filter: 'all' | PlayerType = 'all'): HighScoreEntry[] {
    const entries = this.listAll().filter((entry) => entry.mapId === mapId);
    return filter === 'all' ? entries : entries.filter((entry) => entry.playerType === filter);
  }

  save(entry: HighScoreEntry): number {
    const entries = this.listAll();
    entries.push(entry);
    const sorted = sortHighScores(entries);
    this.storage.setItem(HIGH_SCORE_KEY, JSON.stringify(sorted));
    return scorePlacement(sorted.filter((candidate) => candidate.mapId === entry.mapId), entry);
  }
}
