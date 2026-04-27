import { scorePlacement, sortHighScores } from '../core/high-score-utils.js';
import { createBrowserStorageAdapter, safeParseJson } from './storage-adapter.js';
const HIGH_SCORE_KEY = 'snake-hamiltonian:high-scores';
export class HighScoreStore {
    storage;
    constructor(storage = createBrowserStorageAdapter()) {
        this.storage = storage;
    }
    listAll() {
        const parsed = safeParseJson(this.storage.getItem(HIGH_SCORE_KEY), []);
        return sortHighScores(parsed.filter((entry) => typeof entry?.mapId === 'string'));
    }
    listForMap(mapId, filter = 'all') {
        const entries = this.listAll().filter((entry) => entry.mapId === mapId);
        return filter === 'all' ? entries : entries.filter((entry) => entry.playerType === filter);
    }
    save(entry) {
        const entries = this.listAll();
        entries.push(entry);
        const sorted = sortHighScores(entries);
        this.storage.setItem(HIGH_SCORE_KEY, JSON.stringify(sorted));
        return scorePlacement(sorted.filter((candidate) => candidate.mapId === entry.mapId), entry);
    }
}
