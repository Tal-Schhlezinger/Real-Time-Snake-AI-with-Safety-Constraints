import type { EditableMapDraft, MapValidationResult } from '../core/types.js';

export interface ValidationTaskState {
  status: 'idle' | 'validating' | 'valid' | 'invalid' | 'cancelled' | 'timed-out';
  result: MapValidationResult | null;
  expansions: number;
}

type WorkerMessage =
  | { type: 'progress'; expansions: number }
  | { type: 'result'; result: MapValidationResult };

export class ValidationWorkerClient {
  private worker: Worker | null = null;

  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  validate(
    draft: EditableMapDraft,
    timeLimitMs: number,
    onProgress: (expansions: number) => void
  ): Promise<MapValidationResult> {
    this.cancel();
    this.worker = new Worker(new URL('../workers/map-validation-worker.js', import.meta.url), { type: 'module' });

    return new Promise<MapValidationResult>((resolve, reject) => {
      const activeWorker = this.worker!;

      activeWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const payload = event.data;
        if (payload.type === 'progress') {
          onProgress(payload.expansions);
          return;
        }
        this.worker = null;
        activeWorker.terminate();
        resolve(payload.result);
      };

      activeWorker.onerror = (error) => {
        this.worker = null;
        activeWorker.terminate();
        reject(error);
      };

      activeWorker.postMessage({
        draft,
        timeLimitMs
      });
    });
  }
}
