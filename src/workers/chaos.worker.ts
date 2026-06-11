import { runChaosJob, type ChaosRequest } from './chaosProtocol';
import { isJobInboundMessage, JobEngine } from './jobProtocol';

/**
 * Chaos worker entry point. Two protocols share the wire:
 *  - V2 job envelopes (`chaos-jobs/v2`): handled by the JobEngine with
 *    job-level cancel/pause/resume/status/checkpoint control.
 *  - Legacy bare ChaosRequest messages: answered synchronously, unchanged.
 * All computation lives in pure handlers, so the same code runs in the
 * main-thread fallback and in unit tests.
 */

const engine = new JobEngine((event) => {
  (self as unknown as Worker).postMessage(event);
});

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isJobInboundMessage(event.data)) {
    engine.handle(event.data);
    return;
  }
  const response = runChaosJob(event.data as ChaosRequest);
  (self as unknown as Worker).postMessage(response);
});
