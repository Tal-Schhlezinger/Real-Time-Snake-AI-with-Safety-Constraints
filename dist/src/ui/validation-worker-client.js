export class ValidationWorkerClient {
    worker = null;
    cancel() {
        this.worker?.terminate();
        this.worker = null;
    }
    validate(draft, timeLimitMs, onProgress) {
        this.cancel();
        this.worker = new Worker(new URL('../workers/map-validation-worker.js', import.meta.url), { type: 'module' });
        return new Promise((resolve, reject) => {
            const activeWorker = this.worker;
            activeWorker.onmessage = (event) => {
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
