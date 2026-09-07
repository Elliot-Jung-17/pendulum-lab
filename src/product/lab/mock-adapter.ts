export const MOCK_TOTAL_TICKS = 12;

export interface MockRunRequest {
  readonly fromTick: number;
  readonly fail: boolean;
  readonly onReady: () => void;
  readonly onTick: (tick: number) => void;
  readonly onComplete: () => void;
  readonly onError: (message: string) => void;
}

export interface MockAdapter {
  start(request: MockRunRequest): { cancel(): void };
}

/** Timer-only lifecycle rehearsal. No coordinates, physical time or scientific output. */
export function createMockAdapter(): MockAdapter {
  return {
    start(request) {
      let cancelled = false;
      let tick = request.fromTick;
      let timer: ReturnType<typeof setTimeout>;
      const advance = () => {
        if (cancelled) return;
        tick += 1;
        request.onTick(tick);
        if (cancelled) return;
        if (tick >= MOCK_TOTAL_TICKS) request.onComplete();
        else timer = setTimeout(advance, 250);
      };
      timer = setTimeout(() => {
        if (cancelled) return;
        if (request.fail) {
          request.onError('모의 실행 오류를 재현했습니다. 설정을 확인한 뒤 다시 실행하세요.');
          return;
        }
        request.onReady();
        if (!cancelled) timer = setTimeout(advance, 250);
      }, 150);
      return {
        cancel() {
          cancelled = true;
          clearTimeout(timer);
        }
      };
    }
  };
}
