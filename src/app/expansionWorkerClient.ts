import {
  runExpansionJob,
  type ExpansionJobRequest,
  type ExpansionJobResult,
  type ExpansionWorkerResponse
} from '../workers/expansionJobProtocol';

/**
 * Shared client that runs an Expansion-family job (`suite` / `matrix` /
 * `golden`) on the dedicated worker, with a transparent main-thread fallback —
 * the same pattern as `ChaosClient`. The three Expansion tabs use this so their
 * heavy compute never blocks the simulation/render loop, and none of them has
 * to hand-roll worker lifecycle, timeout, and fallback logic.
 */

export interface ExpansionJobOutcome {
  result: ExpansionJobResult;
  /** True when the result came from the worker, false when the main-thread fallback ran. */
  worker: boolean;
  elapsedMs: number;
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function runOnMainThread(request: ExpansionJobRequest): ExpansionJobOutcome {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = runExpansionJob(request);
  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
  return { result, worker: false, elapsedMs };
}

export async function runExpansionWorkerJob(request: ExpansionJobRequest, timeoutMs = 30_000): Promise<ExpansionJobOutcome> {
  if (typeof Worker === 'undefined') return runOnMainThread(request);
  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/expansion.worker.ts', import.meta.url), { type: 'module', name: 'pendulum-expansion-worker' });
  } catch {
    return runOnMainThread(request);
  }
  const id = uid();
  const started = performance.now();
  try {
    const result = await new Promise<ExpansionJobResult>((resolve, reject) => {
      const cleanup = (): void => {
        window.clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.terminate();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('expansion worker timed out'));
      }, timeoutMs);
      const onError = (event: ErrorEvent): void => {
        cleanup();
        reject(event.error instanceof Error ? event.error : new Error(event.message));
      };
      const onMessage = (event: MessageEvent<ExpansionWorkerResponse>): void => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ id, request });
    });
    return { result, worker: true, elapsedMs: performance.now() - started };
  } catch {
    // Worker failed (e.g. blocked over file://, timeout, or runtime error): run
    // the identical computation on the main thread so the feature still works.
    return runOnMainThread(request);
  }
}
