import { cloneSavedMap } from '../core/board-map.js';
import { validateLoadedMap } from '../core/map-validator.js';
import type { SavedMap } from '../core/types.js';
import { createDefaultMaps } from '../data/default-maps.js';
import { createBrowserStorageAdapter, safeParseJson, type StorageAdapter } from './storage-adapter.js';

const MAPS_KEY = 'snake-hamiltonian:maps';

export class MapStore {
  constructor(private readonly storage: StorageAdapter = createBrowserStorageAdapter()) {}

  bootstrapDefaults(): void {
    const maps = this.listMaps();
    if (maps.length > 0) {
      return;
    }
    this.storage.setItem(MAPS_KEY, JSON.stringify(createDefaultMaps()));
  }

  listMaps(): SavedMap[] {
    const parsed = safeParseJson<SavedMap[]>(this.storage.getItem(MAPS_KEY), []);
    const validMaps = parsed
      .filter((candidate) => typeof candidate?.id === 'string' && typeof candidate?.name === 'string')
      .filter((candidate) => validateLoadedMap(candidate).isValid)
      .map(cloneSavedMap);

    if (parsed.length > 0 && validMaps.length === 0) {
      this.storage.setItem(MAPS_KEY, JSON.stringify(createDefaultMaps()));
      return createDefaultMaps();
    }

    return validMaps;
  }

  getMap(mapId: string): SavedMap | null {
    return this.listMaps().find((map) => map.id === mapId) ?? null;
  }

  saveMap(map: SavedMap): void {
    const maps = this.listMaps().filter((candidate) => candidate.id !== map.id);
    maps.push(cloneSavedMap(map));
    maps.sort((left, right) => left.name.localeCompare(right.name));
    this.storage.setItem(MAPS_KEY, JSON.stringify(maps));
  }

  deleteMap(mapId: string): void {
    const maps = this.listMaps().filter((map) => map.id !== mapId);
    this.storage.setItem(MAPS_KEY, JSON.stringify(maps));
  }

  renameMap(mapId: string, name: string): SavedMap | null {
    const maps = this.listMaps();
    const target = maps.find((map) => map.id === mapId);
    if (!target) {
      return null;
    }
    target.name = name;
    target.updatedAt = new Date().toISOString();
    this.storage.setItem(MAPS_KEY, JSON.stringify(maps));
    return target;
  }
}
