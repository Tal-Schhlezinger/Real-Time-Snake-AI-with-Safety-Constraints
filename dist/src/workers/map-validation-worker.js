import { validateDraftMap } from '../core/map-validator.js';
self.onmessage = (event) => {
    const { draft, timeLimitMs } = event.data;
    const result = validateDraftMap(draft, {
        timeLimitMs,
        onProgress(expansions) {
            self.postMessage({
                type: 'progress',
                expansions
            });
        }
    });
    self.postMessage({
        type: 'result',
        result
    });
};
