import { cloneSavedMap } from '../core/board-map.js';
import { validateLoadedMap } from '../core/map-validator.js';
import { createDefaultMaps } from '../data/default-maps.js';
import { createBrowserStorageAdapter, safeParseJson } from './storage-adapter.js';
const MAPS_KEY = 'snake-hamiltonian:maps';
export class MapStore {
    storage;
    constructor(storage = createBrowserStorageAdapter()) {
        this.storage = storage;
    }
    bootstrapDefaults() {
        const maps = this.listMaps();
        if (maps.length > 0) {
            return;
        }
        this.storage.setItem(MAPS_KEY, JSON.stringify(createDefaultMaps()));
    }
    listMaps() {
        const parsed = safeParseJson(this.storage.getItem(MAPS_KEY), []);
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
    getMap(mapId) {
        return this.listMaps().find((map) => map.id === mapId) ?? null;
    }
    saveMap(map) {
        const maps = this.listMaps().filter((candidate) => candidate.id !== map.id);
        maps.push(cloneSavedMap(map));
        maps.sort((left, right) => left.name.localeCompare(right.name));
        this.storage.setItem(MAPS_KEY, JSON.stringify(maps));
    }
    deleteMap(mapId) {
        const maps = this.listMaps().filter((map) => map.id !== mapId);
        this.storage.setItem(MAPS_KEY, JSON.stringify(maps));
    }
    renameMap(mapId, name) {
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
