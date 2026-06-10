import { rk2Step, rk4Step, eulerStep } from '../physics/integrators';

type RequestMessage = {
  id: string;
  state: number[];
  dt: number;
  steps: number;
  method: 'rk4' | 'rk2' | 'euler';
};

function oscillatorRhs(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

self.addEventListener('message', (event: MessageEvent<RequestMessage>) => {
  const started = performance.now();
  const request = event.data;
  const state = new Float64Array(request.state);
  const out = new Float64Array(state.length);
  const step = request.method === 'euler' ? eulerStep : request.method === 'rk2' ? rk2Step : rk4Step;
  for (let i = 0; i < Math.max(1, request.steps); i += 1) {
    step(state, request.dt, oscillatorRhs, out);
    state.set(out);
  }
  self.postMessage({ id: request.id, state: Array.from(state), elapsedMs: performance.now() - started });
});
