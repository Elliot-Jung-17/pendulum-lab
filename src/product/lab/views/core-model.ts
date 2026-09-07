import {
  createPlanarSimulation,
  validatePlanarConfig,
  type PlanarConfig,
  type PlanarSample
} from '../../adapters/physics/planar';
import type { AnalysisState } from '../../contracts/experiment';

export type CoreStatus = 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';

/** A bounded animation scheduler; all physical stepping belongs to the existing engine adapter. */
export function createCoreModel(initial: PlanarConfig) {
  let simulation = createPlanarSimulation(initial);
  let config = simulation.config;
  const immutableSample = (sample: PlanarSample): PlanarSample => {
    Object.freeze(sample.state);
    Object.freeze(sample.energy);
    Object.freeze(sample.positions.pivot);
    Object.freeze(sample.positions.first);
    Object.freeze(sample.positions.second);
    sample.positions.centers?.forEach(Object.freeze);
    if (sample.positions.centers) Object.freeze(sample.positions.centers);
    Object.freeze(sample.positions);
    return Object.freeze(sample);
  };
  let sample = immutableSample(simulation.snapshot());
  let samples: PlanarSample[] = [sample];
  let status: CoreStatus = 'ready';
  let error = '';
  let valid = true;
  let speed = 1;
  let pendingTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const isRunning = () => status === 'running';
  const notify = () => {
    if (!disposed) listeners.forEach((listener) => listener());
  };
  const stop = () => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
  };

  function advance(count: number) {
    try {
      for (let i = 0; i < count && !simulation.done; i++) {
        sample = immutableSample(simulation.step());
        if (sample.step % (config.sampleEvery ?? 1) === 0 || simulation.done) samples.push(sample);
      }
      if (simulation.done) {
        status = 'completed';
        stop();
      }
    } catch (cause) {
      retainFinal();
      stop();
      status = 'error';
      error = cause instanceof Error ? cause.message : '계산에 실패했습니다.';
    }
    notify();
  }
  function retainFinal() {
    if (samples[samples.length - 1]!.step !== sample.step) samples.push(sample);
  }
  function schedule() {
    const current = generation;
    timer = setTimeout(() => {
      if (disposed || current !== generation || status !== 'running') return;
      // Carry fractional target time across frames. Bound backlog to 0.25 s and
      // work to 200 steps: a costly run slows down instead of blocking the UI.
      pendingTime = Math.min(0.25, pendingTime + 0.016 * speed);
      let remaining = config.duration - sample.step * config.step;
      let count = 0;
      while (count < 200 && remaining > 0) {
        const dt = Math.min(config.step, remaining);
        if (pendingTime + 8 * Number.EPSILON * Math.max(1, config.duration) < dt) break;
        pendingTime = Math.max(0, pendingTime - dt);
        remaining -= dt;
        count++;
      }
      if (count > 0) advance(count);
      if (!disposed && current === generation && status === 'running') schedule();
    }, 16);
  }
  function reset() {
    if (disposed) return;
    stop();
    simulation = createPlanarSimulation(config);
    sample = immutableSample(simulation.snapshot());
    samples = [sample];
    pendingTime = 0;
    status = 'ready';
    error = '';
    notify();
  }
  return {
    get state() {
      return {
        config: structuredClone(config),
        samples: samples as readonly PlanarSample[],
        sample,
        status,
        error,
        valid,
        speed
      };
    },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configure(next: PlanarConfig) {
      if (disposed) return;
      const checked = validatePlanarConfig(next);
      if (!checked.ok) throw new Error(checked.issues.map((item) => item.message).join(' '));
      config = checked.value;
      valid = true;
      reset();
    },
    setValid(next: boolean) {
      if (disposed) return;
      valid = next;
      if (!next) {
        stop();
        status = 'ready';
      }
      notify();
    },
    setAnalyses(analyses: readonly AnalysisState[]) {
      if (disposed) return;
      const checked = validatePlanarConfig({ ...config, analyses });
      if (!checked.ok) throw new Error(checked.issues.map((item) => item.message).join(' '));
      config = checked.value;
      notify();
    },
    setSpeed(next: number) {
      if (!disposed && [0.25, 1, 4].includes(next)) {
        speed = next;
        notify();
      }
    },
    run() {
      if (disposed || !valid || isRunning()) return;
      if (status === 'completed' || status === 'error' || status === 'cancelled') reset();
      if (disposed || !valid || isRunning()) return;
      const current = generation;
      status = 'running';
      error = '';
      notify();
      if (!disposed && current === generation && status === 'running') schedule();
    },
    pause() {
      if (!disposed && status === 'running') {
        stop();
        status = 'paused';
        notify();
      }
    },
    step() {
      if (disposed || !valid || status === 'running' || status === 'completed') return;
      status = 'paused';
      advance(1);
    },
    cancel() {
      if (!disposed && (status === 'running' || status === 'paused')) {
        stop();
        retainFinal();
        status = 'cancelled';
        notify();
      }
    },
    reset,
    dispose() {
      stop();
      disposed = true;
      listeners.clear();
    }
  };
}
export type CoreModel = ReturnType<typeof createCoreModel>;
