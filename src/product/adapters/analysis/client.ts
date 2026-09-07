import type { PlanarAnalysisEvent, PlanarAnalysisRequest } from './planar';

export interface PlanarAnalysisWorker {
  onmessage: ((event: MessageEvent<PlanarAnalysisEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: PlanarAnalysisRequest): void;
  terminate(): void;
}

export type PlanarAnalysisWorkerFactory = () => PlanarAnalysisWorker;
export interface PlanarAnalysisJob {
  cancel(): void;
  dispose(): void;
}

const defaultFactory: PlanarAnalysisWorkerFactory = () =>
  new Worker(new URL('./planar.worker.ts', import.meta.url), { type: 'module' });

/** One isolated worker per job; termination interrupts synchronous legacy work immediately. */
export function createPlanarAnalysisJob(
  request: PlanarAnalysisRequest,
  onEvent: (event: PlanarAnalysisEvent) => void,
  factory: PlanarAnalysisWorkerFactory = defaultFactory
): PlanarAnalysisJob {
  let worker: PlanarAnalysisWorker | undefined;
  let finished = false;
  const stop = () => {
    if (finished) return;
    finished = true;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const fail = (message: string) => {
    if (finished) return;
    stop();
    onEvent({ type: 'error', id: request.id, message });
  };
  try {
    worker = factory();
    worker.onmessage = (event) => {
      if (finished || event.data?.id !== request.id) return;
      if (!['progress', 'result', 'error'].includes(event.data.type)) {
        fail('분석 worker가 유효하지 않은 응답을 보냈습니다.');
        return;
      }
      if (event.data.type !== 'progress') stop();
      onEvent(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('분석 worker를 실행하지 못했습니다. 설정을 확인한 뒤 다시 시도하세요.');
    };
    worker.onmessageerror = () => fail('분석 결과를 읽지 못했습니다. 다시 시도하세요.');
    worker.postMessage(request);
  } catch {
    // Defer startup errors until the caller has received/stored the job handle.
    queueMicrotask(() =>
      fail('이 환경에서 분석 worker를 시작하지 못했습니다. 브라우저의 worker 지원과 정책을 확인하세요.')
    );
  }
  return {
    cancel() {
      if (finished) return;
      stop();
      onEvent({ type: 'cancelled', id: request.id });
    },
    dispose: stop
  };
}
