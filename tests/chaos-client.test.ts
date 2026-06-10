import { describe, expect, test } from 'vitest';
import { ChaosClient } from '../src/runtime/ChaosClient';
import { runChaosJob, type ChaosRequest, type ChaosResponse } from '../src/workers/chaosProtocol';
import type { SystemSpec } from '../src/physics/systemSpec';

const DRIVEN: Extract<SystemSpec, { kind: 'driven' }> = {
  kind: 'driven',
  g: 1,
  length: 1,
  damping: 0.5,
  driveAmplitude: 1.15,
  driveFrequency: 2 / 3
};

/** Minimal Worker stand-in: routes postMessage through a transform back as a message event. */
class FakeWorker {
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  constructor(private readonly transform: (req: ChaosRequest) => ChaosResponse) {}
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (ev: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }
  postMessage(req: ChaosRequest): void {
    queueMicrotask(() => {
      const response = this.transform(req);
      for (const cb of this.listeners.message ?? []) cb({ data: response });
    });
  }
  terminate(): void {}
}

function makeClient(transform: ((req: ChaosRequest) => ChaosResponse) | null): ChaosClient {
  return new ChaosClient(() => (transform ? (new FakeWorker(transform) as unknown as Worker) : null));
}

describe('ChaosClient', () => {
  test('worker path resolves with the worker response', async () => {
    const client = makeClient(runChaosJob);
    expect(client.usesWorker()).toBe(true);
    const res = await client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    expect(res.kind).toBe('lyapunov');
    expect(res.lambdaMax).toBeGreaterThan(0.03);
  });

  test('fallback path (no worker) resolves with the same computation', async () => {
    const client = makeClient(null);
    expect(client.usesWorker()).toBe(false);
    const res = await client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    expect(res.lambdaMax).toBeGreaterThan(0.03);
  });

  test('worker and fallback agree on the result for identical input', async () => {
    const settings = { steps: 4000, seed: 123 } as const;
    const viaWorker = await makeClient(runChaosJob).lyapunov(DRIVEN, [0.2, 0, 0], settings);
    const viaFallback = await makeClient(null).lyapunov(DRIVEN, [0.2, 0, 0], settings);
    expect(viaWorker.lambdaMax).toBeCloseTo(viaFallback.lambdaMax, 10);
  });

  test('a worker error response rejects the promise', async () => {
    const client = makeClient((req) => ({ id: req.id, ok: false, error: 'boom' }));
    await expect(client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 })).rejects.toThrow('boom');
  });

  test('bifurcation resolves with one column per amplitude', async () => {
    const client = makeClient(runChaosJob);
    const res = await client.bifurcation(DRIVEN, [1.0, 1.1, 1.2], [0.2, 0, 0], {
      dt: 6e-3,
      maxTime: 100,
      transientCrossings: 8,
      maxPointsPerParam: 15
    });
    expect(res.columns.length).toBe(3);
  });
});
