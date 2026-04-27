import { createBrowserStorageAdapter, safeParseJson } from './storage-adapter.js';
const SETTINGS_KEY = 'snake-hamiltonian:settings';
export const DEFAULT_SETTINGS = {
    tickMs: 140,
    cellSize: 30,
    showHamiltonianOverlay: false,
    showAiPathOverlay: true,
    scoreFilter: 'all'
};
export class SettingsStore {
    storage;
    constructor(storage = createBrowserStorageAdapter()) {
        this.storage = storage;
    }
    load() {
        const parsed = safeParseJson(this.storage.getItem(SETTINGS_KEY), {});
        return {
            ...DEFAULT_SETTINGS,
            ...parsed
        };
    }
    save(settings) {
        this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
}
