class MemoryStorageAdapter {
    store = new Map();
    getItem(key) {
        return this.store.get(key) ?? null;
    }
    setItem(key, value) {
        this.store.set(key, value);
    }
    removeItem(key) {
        this.store.delete(key);
    }
}
export function createBrowserStorageAdapter() {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
    }
    return new MemoryStorageAdapter();
}
export function safeParseJson(value, fallback) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
