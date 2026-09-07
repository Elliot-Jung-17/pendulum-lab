import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCoreModel } from '../../../src/product/lab/views/core-model';
import {
  loadCoreConfig,
  saveCoreConfig,
  serializeCoreConfig,
  parseCoreConfig,
  trajectoryCsv,
  PLANAR_STORAGE_PREFIX,
  PLANAR_IMPORT_MAX_BYTES
} from '../../../src/product/lab/views/core-storage';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  PLANAR_SYSTEM_IDS,
  type PlanarConfig,
  type PlanarSample
} from '../../../src/product/adapters/physics/planar';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const shortConfig = (): PlanarConfig => ({ ...defaultPlanarConfig(), duration: 0.02, step: 0.002 });

describe('S07 core animation lifecycle', () => {
  test('retains the requested sample stride plus endpoints while the live state advances each step', () => {
    const model = createCoreModel({ ...shortConfig(), sampleEvery: 3 });
    for (let i = 0; i < 5; i++) model.step();
    expect(model.state.samples.map((sample) => sample.step)).toEqual([0, 3]);
    expect(model.state.sample.step).toBe(5);
    expect(model.state.status).toBe('paused');
    for (let i = 0; i < 5; i++) model.step();
    expect(model.state.samples.map((sample) => sample.step)).toEqual([0, 3, 6, 9, 10]);
    expect(model.state.sample.time).toBe(0.02);
    expect(model.state.status).toBe('completed');
  });

  test('runs, pauses, steps, resumes and completes the actual legacy trajectory', () => {
    vi.useFakeTimers();
    const config: PlanarConfig = { ...shortConfig(), duration: 0.1, startTime: 3 };
    const model = createCoreModel(config);
    model.run();
    vi.advanceTimersByTime(16);
    expect(model.state.sample.step).toBe(8);
    model.pause();
    vi.advanceTimersByTime(1000);
    expect(model.state.sample.step).toBe(8);
    model.step();
    expect(model.state.sample.step).toBe(9);
    model.run();
    vi.runAllTimers();
    expect(model.state.status).toBe('completed');
    const reference = createPlanarSimulation(config);
    while (!reference.done) reference.step();
    expect(model.state.sample).toEqual(reference.snapshot());
    expect(model.state.sample.time).toBe(3.1);
    model.dispose();
  });

  test('cancel retains the final partial sample; a new run restarts from the initial conditions', () => {
    vi.useFakeTimers();
    const model = createCoreModel({ ...shortConfig(), sampleEvery: 3 });
    model.step();
    model.step();
    model.cancel();
    expect(model.state.samples.map((sample) => sample.step)).toEqual([0, 2]);
    expect(model.state.status).toBe('cancelled');
    model.run();
    expect(model.state.sample.step).toBe(0);
    vi.runAllTimers();
    expect(model.state.samples.map((sample) => sample.step)).toEqual([0, 3, 6, 9, 10]);
    model.dispose();
  });

  test('ignores stale timer callbacks even when timer cancellation is not cooperative', () => {
    vi.useFakeTimers();
    const callbacks: (() => void)[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length;
    }) as unknown as typeof setTimeout);
    const model = createCoreModel(shortConfig());
    model.run();
    model.pause();
    callbacks[0]!();
    expect(model.state.sample.step).toBe(0);
    expect(model.state.status).toBe('paused');
    model.run();
    model.configure({ ...shortConfig(), gamma: 1 });
    callbacks[1]!();
    expect(model.state.status).toBe('ready');
    expect(model.state.sample.step).toBe(0);
    model.run();
    model.cancel();
    callbacks[2]!();
    expect(model.state.status).toBe('cancelled');
    model.run();
    model.dispose();
    callbacks[3]!();
    expect(model.state.sample.step).toBe(0);
  });

  test('a subscriber may reset and restart during a frame without scheduling a duplicate loop', () => {
    vi.useFakeTimers();
    const model = createCoreModel({ ...shortConfig(), duration: 0.1 });
    let switched = false;
    model.subscribe(() => {
      if (!switched && model.state.sample.step === 8) {
        switched = true;
        model.configure({ ...shortConfig(), duration: 0.1, gamma: 0.1 });
        model.run();
      }
    });
    model.run();
    vi.advanceTimersByTime(16);
    expect(switched).toBe(true);
    expect(model.state.sample.step).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(16);
    expect(model.state.sample.step).toBe(8);
    model.dispose();
  });

  test('disposal stops execution and makes every mutation inert', () => {
    vi.useFakeTimers();
    const model = createCoreModel(shortConfig());
    const notified = vi.fn();
    model.subscribe(notified);
    model.run();
    model.dispose();
    const before = model.state;
    notified.mockClear();
    model.subscribe(notified);
    model.run();
    model.pause();
    model.step();
    model.cancel();
    model.reset();
    model.configure(defaultPlanarConfig('system:compound-double'));
    model.setAnalyses([]);
    model.setValid(false);
    model.setSpeed(4);
    vi.runAllTimers();
    expect(model.state).toEqual(before);
    expect(notified).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('settings changes clear results; invalid settings cannot replace or restart a valid run', () => {
    vi.useFakeTimers();
    const model = createCoreModel(shortConfig());
    model.step();
    const before = model.state;
    expect(() => model.configure({ ...shortConfig(), gamma: -1 })).toThrow();
    expect(model.state).toEqual(before);
    model.configure({ ...shortConfig(), initialState: [2, 1, 0.1, 0.2], gamma: 0.3 });
    expect(model.state.samples).toHaveLength(1);
    expect(model.state.sample.state).toEqual([2, 1, 0.1, 0.2]);
    expect(model.state.status).toBe('ready');
    model.run();
    model.setValid(false);
    vi.runAllTimers();
    model.run();
    model.step();
    expect(model.state.sample.step).toBe(0);
    model.setValid(true);
    model.run();
    vi.runAllTimers();
    expect(model.state.status).toBe('completed');
    model.reset();
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });

  test('analysis configuration is detached and validated without resetting the existing trajectory', () => {
    const model = createCoreModel(shortConfig());
    model.step();
    const analyses = [{ id: 'analysis:lyapunov' as const, algorithmVersion: '1', settings: {} }];
    model.setAnalyses(analyses);
    analyses.length = 0;
    expect(model.state.config.analyses).toHaveLength(1);
    expect(model.state.sample.step).toBe(1);
    expect(() => model.setAnalyses([{ id: 'analysis:unknown', algorithmVersion: '1', settings: {} }])).toThrow();
    expect(model.state.config.analyses).toHaveLength(1);
    model.dispose();
  });

  test('detaches configuration and freezes sampled states while retaining a stable readonly trajectory', () => {
    const model = createCoreModel(shortConfig());
    const state = model.state;
    state.config.parameters.g = 0;
    expect(state.samples).toBe(model.state.samples);
    expect(() => {
      (state.sample.state as unknown as number[])[0] = 10;
    }).toThrow();
    expect(model.state.config.parameters.g).toBe(9.81);
    expect(model.state.samples).toHaveLength(1);
    expect(model.state.sample.state[0]).toBe(1.2);
    model.dispose();
  });

  test('caps frame work at 200 steps and keeps speed out of physical settings', () => {
    vi.useFakeTimers();
    const model = createCoreModel({ ...shortConfig(), step: 1e-6, duration: 0.001 });
    model.setSpeed(4);
    model.setSpeed(999);
    model.run();
    vi.advanceTimersByTime(16);
    expect(model.state.speed).toBe(4);
    expect(model.state.sample.step).toBe(200);
    expect(model.state.config.step).toBe(1e-6);
    model.dispose();
  });

  test('a 0.05-second step waits for its accumulated target time at normal and quarter speed', () => {
    vi.useFakeTimers();
    const config: PlanarConfig = { ...shortConfig(), step: 0.05, duration: 0.2 };
    const model = createCoreModel(config);
    model.run();
    for (let frame = 0; frame < 3; frame++) {
      vi.advanceTimersByTime(16);
      expect(model.state.sample.step).toBe(0);
    }
    vi.advanceTimersByTime(16);
    expect(model.state.sample.step).toBe(1);
    model.reset();
    model.setSpeed(0.25);
    model.run();
    vi.advanceTimersByTime(12 * 16);
    expect(model.state.sample.step).toBe(0);
    vi.advanceTimersByTime(16);
    expect(model.state.sample.step).toBe(1);
    model.dispose();
  });

  test('pause preserves fractional target time and reset clears it', () => {
    vi.useFakeTimers();
    const model = createCoreModel({ ...shortConfig(), step: 0.05, duration: 0.2 });
    model.run();
    vi.advanceTimersByTime(32);
    model.pause();
    vi.advanceTimersByTime(1000);
    expect(model.state.sample.step).toBe(0);
    model.run();
    vi.advanceTimersByTime(16);
    expect(model.state.sample.step).toBe(0);
    vi.advanceTimersByTime(16);
    expect(model.state.sample.step).toBe(1);
    model.reset();
    model.run();
    vi.advanceTimersByTime(48);
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });

  test('the shortened final step consumes only its remaining physical time', () => {
    vi.useFakeTimers();
    const model = createCoreModel({ ...shortConfig(), step: 0.05, duration: 0.06 });
    model.run();
    vi.advanceTimersByTime(64);
    expect(model.state.status).toBe('completed');
    expect(model.state.sample.step).toBe(2);
    expect(model.state.sample.time).toBe(0.06);
    model.dispose();
  });

  test('a numerical failure is surfaced and leaves the last finite accepted sample exportable', () => {
    vi.useFakeTimers();
    const model = createCoreModel({
      ...shortConfig(),
      parameters: { m1: 0.001, m2: 0.001, l1: 0.001, l2: 0.001, g: 1000 },
      initialState: [1, 2, 1e4, -1e4],
      gamma: 1000,
      integratorId: 'integrator:euler',
      step: 0.05,
      duration: 1,
      sampleEvery: 3
    });
    model.run();
    vi.runAllTimers();
    expect(model.state.status).toBe('error');
    expect(model.state.error).toBeTruthy();
    expect(model.state.sample.step).toBeGreaterThan(0);
    expect(model.state.samples.at(-1)).toEqual(model.state.sample);
    expect(() => trajectoryCsv(model.state.samples)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    model.configure(shortConfig());
    model.run();
    vi.runAllTimers();
    expect(model.state.status).toBe('completed');
    expect(model.state.error).toBe('');
    model.dispose();
  });
});

describe('S07 isolated save, reload and exports', () => {
  test.each(PLANAR_SYSTEM_IDS)('%s saves and reloads all canonical settings in its own storage key', (systemId) => {
    const config: PlanarConfig = {
      ...defaultPlanarConfig(systemId),
      parameters: { m1: 1.3, m2: 2.7, l1: 0.8, l2: 1.6, g: 9.8 },
      gamma: 0.07,
      initialState: [15, -10, 1, -2],
      integratorId: 'integrator:euler',
      startTime: 21.5,
      step: 0.003,
      duration: 1.4,
      sampleEvery: 7,
      seed: { value: '00042', generator: 'reserved', generatorVersion: '1' },
      analyses: [{ id: 'analysis:lyapunov', algorithmVersion: '1', settings: {} }],
      provenance: {
        createdByVersion: '10.36.0',
        source: { kind: 'manual' },
        parentExperimentIds: [],
        sourceUnits: { 'initialConditions.theta1': 'deg' }
      }
    };
    const records = new Map<string, string>([['legacy-experiment', 'unchanged']]);
    const storage = {
      setItem: (key: string, value: string) => records.set(key, value),
      getItem: (key: string) => records.get(key) ?? null
    };
    saveCoreConfig(storage, config);
    expect(loadCoreConfig(storage, systemId)).toEqual(config);
    expect(parseCoreConfig(serializeCoreConfig(config), systemId)).toEqual(config);
    expect(records.get('legacy-experiment')).toBe('unchanged');
    expect([...records.keys()]).toEqual(['legacy-experiment', `${PLANAR_STORAGE_PREFIX}${systemId}`]);
    expect(createPlanarSimulation(loadCoreConfig(storage, systemId)!).step()).toEqual(
      createPlanarSimulation(config).step()
    );
  });

  test('missing saves return empty and storage errors are surfaced without changing the source', () => {
    const config = shortConfig();
    const before = structuredClone(config);
    expect(loadCoreConfig({ getItem: () => null }, config.systemId)).toBeNull();
    expect(() =>
      saveCoreConfig(
        {
          setItem: () => {
            throw new Error('quota exceeded');
          }
        },
        config
      )
    ).toThrow('quota exceeded');
    expect(() =>
      loadCoreConfig(
        {
          getItem: () => {
            throw new Error('denied');
          }
        },
        config.systemId
      )
    ).toThrow('denied');
    expect(config).toEqual(before);
    const setItem = vi.fn();
    expect(() => saveCoreConfig({ setItem }, { ...config, gamma: -1 })).toThrow();
    expect(setItem).not.toHaveBeenCalled();
  });

  test('corrupt stored data remains recoverable and cross-system imports cannot replace the active model', () => {
    const corrupt = '{"schema":"unsupported"}';
    const storage = { getItem: vi.fn(() => corrupt) };
    expect(() => loadCoreConfig(storage, 'system:double')).toThrow();
    expect(storage.getItem()).toBe(corrupt);
    const compound = serializeCoreConfig(defaultPlanarConfig('system:compound-double'));
    expect(() => parseCoreConfig(compound, 'system:double')).toThrow('다른 시스템');
  });

  test.each([
    '',
    '{',
    'null',
    '[]',
    '{"__proto__":{"polluted":true}}',
    '{"constructor":{"prototype":{"polluted":true}}}',
    '{"schema":"pendulum-experiment/v1","schema":"other"}',
    '{"runtime":{"step":NaN}}',
    '"' + 'a'.repeat(PLANAR_IMPORT_MAX_BYTES) + '"'
  ])('rejects malformed, unsafe or oversized JSON input #%#', (source) => {
    expect(() => parseCoreConfig(source, 'system:double')).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('CSV contains only finite numeric cells in SI order including the unwrapped angle', () => {
    const model = createCoreModel({ ...shortConfig(), initialState: [15, -10, 1, -2] });
    model.step();
    const csv = trajectoryCsv(model.state.samples);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('time_s,theta1_rad,theta2_rad,omega1_rad_s,omega2_rad_s,kinetic_J,potential_J,total_J');
    expect(lines).toHaveLength(3);
    expect(lines[1]!.split(',').slice(0, 5)).toEqual(['0', '15', '-10', '1', '-2']);
    for (const row of lines.slice(1)) {
      const numbers = row.split(',').map(Number);
      expect(numbers).toHaveLength(8);
      expect(numbers.every(Number.isFinite)).toBe(true);
      expect(numbers[7]).toBeCloseTo(numbers[5]! + numbers[6]!, 12);
    }
    model.dispose();
  });

  test.each([Infinity, Number.NaN, '=HYPERLINK("https://example.org")', '-2+5'])(
    'CSV rejects nonnumeric or nonfinite state %j',
    (value) => {
      const sample = createPlanarSimulation(shortConfig()).snapshot();
      const bad = { ...sample, state: [value, 0, 0, 0] } as unknown as PlanarSample;
      expect(() => trajectoryCsv([bad])).toThrow();
    }
  );
});
