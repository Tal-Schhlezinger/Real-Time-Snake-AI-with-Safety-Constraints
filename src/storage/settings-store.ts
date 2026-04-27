import type { SettingsData } from '../core/types.js';
import { createBrowserStorageAdapter, safeParseJson, type StorageAdapter } from './storage-adapter.js';

const SETTINGS_KEY = 'snake-hamiltonian:settings';

export const DEFAULT_SETTINGS: SettingsData = {
  tickMs: 140,
  cellSize: 30,
  showHamiltonianOverlay: false,
  showAiPathOverlay: true,
  scoreFilter: 'all'
};

export class SettingsStore {
  constructor(private readonly storage: StorageAdapter = createBrowserStorageAdapter()) {}

  load(): SettingsData {
    const parsed = safeParseJson<Partial<SettingsData>>(this.storage.getItem(SETTINGS_KEY), {});
    return {
      ...DEFAULT_SETTINGS,
      ...parsed
    };
  }

  save(settings: SettingsData): void {
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}
