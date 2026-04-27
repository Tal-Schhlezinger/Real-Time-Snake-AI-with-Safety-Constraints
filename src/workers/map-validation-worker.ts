import { validateDraftMap } from '../core/map-validator.js';
import type { EditableMapDraft } from '../core/types.js';

self.onmessage = (event: MessageEvent<{ draft: EditableMapDraft; timeLimitMs: number }>) => {
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
