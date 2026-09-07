import { describe, expect, it, vi } from 'vitest';
import { createPlanarAnalysisJob, type PlanarAnalysisWorker } from '../../../../src/product/adapters/analysis/client';
import type { PlanarAnalysisEvent, PlanarAnalysisRequest } from '../../../../src/product/adapters/analysis/planar';
import { defaultPlanarConfig } from '../../../../src/product/adapters/physics/planar';

const request: PlanarAnalysisRequest = { id: 'test', kind: 'lyapunov', config: defaultPlanarConfig() };
function fakeWorker(): PlanarAnalysisWorker {
  return { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() };
}
function message(data: PlanarAnalysisEvent): MessageEvent<PlanarAnalysisEvent> {
  return { data } as MessageEvent<PlanarAnalysisEvent>;
}

describe('S07 analysis worker lifecycle', () => {
  it('terminates immediately on cancel and discards already queued replies', () => {
    const worker = fakeWorker();
    const events: PlanarAnalysisEvent[] = [];
    const job = createPlanarAnalysisJob(
      request,
      (event) => events.push(event),
      () => worker
    );
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    const queued = worker.onmessage!;
    queued(message({ type: 'progress', id: request.id, fraction: 0.2, work: 200, phase: 'calculating' }));
    job.cancel();
    queued(message({ type: 'error', id: request.id, message: 'late' }));
    job.cancel();
    job.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.type)).toEqual(['progress', 'cancelled']);
    expect(worker.onmessage).toBeNull();
  });

  it('isolates simultaneous jobs and ignores another job ID', () => {
    const first = fakeWorker();
    const second = fakeWorker();
    const emit = vi.fn();
    const firstJob = createPlanarAnalysisJob(request, emit, () => first);
    const secondJob = createPlanarAnalysisJob({ ...request, id: 'second' }, emit, () => second);
    first.onmessage!(message({ type: 'error', id: 'second', message: 'unrelated' }));
    expect(emit).not.toHaveBeenCalled();
    firstJob.cancel();
    expect(second.terminate).not.toHaveBeenCalled();
    secondJob.dispose();
    expect(second.terminate).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('releases the worker after an engine error and reports only once', () => {
    const worker = fakeWorker();
    const emit = vi.fn();
    const job = createPlanarAnalysisJob(request, emit, () => worker);
    const queued = worker.onmessage!;
    queued(message({ type: 'error', id: request.id, message: 'invalid input' }));
    queued(message({ type: 'error', id: request.id, message: 'duplicate' }));
    job.cancel();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledExactlyOnceWith({ type: 'error', id: request.id, message: 'invalid input' });
  });

  it('handles worker runtime and message-deserialization failures', () => {
    const worker = fakeWorker();
    const emit = vi.fn();
    createPlanarAnalysisJob(request, emit, () => worker);
    const preventDefault = vi.fn();
    worker.onerror!({ preventDefault } as unknown as ErrorEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![0].type).toBe('error');
    const other = fakeWorker();
    createPlanarAnalysisJob(request, emit, () => other);
    other.onmessageerror!({} as MessageEvent);
    expect(other.terminate).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[1]![0].message).toContain('읽지');
  });

  it('delivers startup errors asynchronously and can cancel a failed start', async () => {
    const emit = vi.fn();
    createPlanarAnalysisJob(request, emit, () => {
      throw new Error('CSP');
    });
    expect(emit).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(emit.mock.calls[0]![0].type).toBe('error');
    const cancelled = vi.fn();
    const job = createPlanarAnalysisJob(request, cancelled, () => {
      throw new Error('CSP');
    });
    job.cancel();
    await Promise.resolve();
    expect(cancelled).toHaveBeenCalledExactlyOnceWith({ type: 'cancelled', id: request.id });
  });
});
