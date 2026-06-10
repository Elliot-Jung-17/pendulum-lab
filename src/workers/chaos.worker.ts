import { runChaosJob, type ChaosRequest } from './chaosProtocol';

/**
 * Chaos worker entry point. It is intentionally trivial: all logic lives in the
 * pure `runChaosJob` handler so the same code runs here and in the main-thread
 * fallback.
 */
self.addEventListener('message', (event: MessageEvent<ChaosRequest>) => {
  const response = runChaosJob(event.data);
  (self as unknown as Worker).postMessage(response);
});
