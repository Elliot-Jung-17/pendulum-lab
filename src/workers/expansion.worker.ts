import { runExpansionJob, type ExpansionWorkerRequest, type ExpansionWorkerResponse } from './expansionJobProtocol';

/**
 * Worker entry for the Expansion family of jobs (model suite / Research Matrix /
 * Golden Center). It is a thin envelope around the pure `runExpansionJob`
 * dispatcher, so the same code path serves the worker and the main-thread
 * fallback. Keeping all three job kinds off the UI thread is what stops the
 * Research Matrix and Golden Center "Run" from freezing the simulation.
 */

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

self.addEventListener('message', (event: MessageEvent<ExpansionWorkerRequest>) => {
  const started = nowMs();
  const { id, request } = event.data;
  try {
    const result = runExpansionJob(request);
    self.postMessage({ id, ok: true, result, elapsedMs: nowMs() - started } satisfies ExpansionWorkerResponse);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: nowMs() - started
    } satisfies ExpansionWorkerResponse);
  }
});
