import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../src/product/catalog';
import { getSystem, selectLabCapabilities, selectSystems } from '../../../src/product/catalog/selectors';
import { createLabModel, getLabSchema } from '../../../src/product/lab/model';
import { MOCK_TOTAL_TICKS, type MockAdapter, type MockRunRequest } from '../../../src/product/lab/mock-adapter';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import { experimentFixture } from '../contracts/fixtures';

afterEach(() => {
  vi.useRealTimers();
});

describe('S06 system-first discovery', () => {
  it('searches Korean, English, IDs and family names with intersecting filters', () => {
    expect(selectSystems({ query: '  DOUBLE   point-MASS ' }).map((system) => system.id)).toEqual(['system:double']);
    expect(selectSystems({ query: '고전 진자', family: 'classical' }).length).toBeGreaterThan(0);
    expect(selectSystems({ query: 'double', family: 'spatial' })).toEqual([]);
    expect(selectSystems({ query: '검색 결과 없는 조건' })).toEqual([]);
  });

  it('filters favorites and keeps recent order without mutating the catalog', () => {
    const original = catalog.systems.map((system) => system.id);
    expect(selectSystems({ collection: 'favorites' })).toEqual([]);
    expect(
      selectSystems({
        collection: 'recent',
        recentIds: ['system:rope', 'invalid', 'system:double', 'system:rope']
      }).map((system) => system.id)
    ).toEqual(['system:rope', 'system:double']);
    expect(
      selectSystems({ collection: 'favorites', favoriteIds: ['system:double', 'invalid'] }).map((system) => system.id)
    ).toEqual(['system:double']);
    expect(catalog.systems.map((system) => system.id)).toEqual(original);
  });

  it('keeps internal steppers out and excludes continuous flow analyses from maps and quantum systems', () => {
    for (const system of catalog.systems) {
      const capabilities = selectLabCapabilities(system);
      if (system.stepping.kind === 'internal') {
        expect(capabilities.integrators, system.id).toEqual([]);
        expect(
          getLabSchema(system).fields.some((field) => field.id === 'step'),
          system.id
        ).toBe(false);
      }
      if (['map', 'quantum', 'diagnostic', 'spectral'].includes(system.evolution)) {
        expect(
          capabilities.analyses.some((entry) => entry.id === 'analysis:poincare'),
          system.id
        ).toBe(false);
        expect(
          getLabSchema(system).fields.some((field) => field.id === 'duration'),
          system.id
        ).toBe(false);
      }
      expect(capabilities.exports.map((entry) => entry.id)).toEqual(['mock-settings-json']);
    }
    const driven = getSystem('system:driven')!;
    expect(selectLabCapabilities(driven).integrators.some((entry) => entry.method === 'split')).toBe(false);
  });
});

describe('S06 mock configuration lifecycle', () => {
  it('cannot run an empty workspace or unknown system', () => {
    const model = createLabModel();
    expect(model.state.status).toBe('empty');
    expect(model.run()).toBe(false);
    expect(model.exportSettings()).toBeNull();
    expect(model.selectSystem('system:unknown')).toBe(false);
    expect(model.state.systemId).toBeNull();
  });

  it('prepares every catalog system with one selection and only its mock schema fields', () => {
    vi.useFakeTimers();
    const model = createLabModel();
    for (const system of catalog.systems) {
      expect(model.selectSystem(system.id), system.id).toBe(true);
      expect(model.state.status, system.id).toBe('ready');
      expect(model.prepare(), system.id).toBe(true);
      expect(Object.keys(model.state.fields), system.id).toEqual(getLabSchema(system).fields.map((field) => field.id));
      expect(model.run(), system.id).toBe(true);
      expect(model.state.status, system.id).toBe('preparing');
      model.cancel();
    }
    model.dispose();
  });

  it.each(['', ' ', 'NaN', 'Infinity', '0x10', '-0', '1e-999', '-1', '1001'])(
    'blocks invalid mass %j without clamping',
    (input) => {
      const model = createLabModel({ systemId: 'system:double' });
      model.setField('m1', input);
      expect(model.state.fields.m1).toBe(input);
      expect(model.state.fieldErrors.m1).toBeTruthy();
      expect(model.run()).toBe(false);
      expect(model.saveToTray()).toBeNull();
      expect(model.exportSettings()).toBeNull();
      expect(model.state.status).toBe('error');
      model.setField('m1', '2e0');
      expect(model.state.fieldErrors.m1).toBeUndefined();
      expect(model.prepare()).toBe(true);
    }
  );

  it('validates cross-field runtime bounds and discrete iteration counts', () => {
    const model = createLabModel({ systemId: 'system:double' });
    model.setField('duration', '0.001');
    expect(model.state.fieldErrors.step).toBeTruthy();
    expect(model.run()).toBe(false);
    model.setField('step', '0.0001');
    expect(model.prepare()).toBe(true);
    model.selectSystem('system:standard-map');
    model.setField('iterations', '1.5');
    expect(model.run()).toBe(false);
  });

  it('rejects incompatible controls and clears prior selections on a system change', () => {
    const model = createLabModel({ systemId: 'system:double' });
    expect(model.toggleAnalysis('analysis:poincare')).toBe(true);
    expect(model.setIntegrator('integrator:yoshida4')).toBe(true);
    model.selectSystem('system:standard-map');
    expect(model.state.analysisIds).toEqual([]);
    expect(model.state.integratorId).toBeNull();
    expect(model.toggleAnalysis('analysis:poincare')).toBe(false);
    expect(model.setIntegrator('integrator:rk4')).toBe(false);
    expect(model.setField('m1', '1')).toBe(false);
  });

  it('runs, pauses, steps, resumes and completes timer-only progress', () => {
    vi.useFakeTimers();
    const model = createLabModel({ systemId: 'system:double' });
    expect(model.run()).toBe(true);
    expect(model.state.status).toBe('preparing');
    vi.advanceTimersByTime(650);
    expect(model.state.status).toBe('running');
    expect(model.state.tick).toBe(2);
    expect(model.run()).toBe(false);
    expect(model.setField('m1', '2')).toBe(false);
    expect(model.pause()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(model.state.tick).toBe(2);
    expect(model.step()).toBe(true);
    expect(model.state.tick).toBe(3);
    expect(model.run()).toBe(true);
    vi.runAllTimers();
    expect(model.state.status).toBe('completed');
    expect(model.state.tick).toBe(MOCK_TOTAL_TICKS);
    expect(model.reset()).toBe(true);
    expect(model.state.status).toBe('ready');
    expect(model.state.tick).toBe(0);
    model.dispose();
  });

  it('cancels during preparation and exposes a recoverable explicit mock error', () => {
    vi.useFakeTimers();
    const model = createLabModel({ systemId: 'system:double' });
    model.run();
    expect(model.cancel()).toBe(true);
    vi.runAllTimers();
    expect(model.state.status).toBe('cancelled');
    expect(model.state.tick).toBe(0);
    expect(model.simulateError()).toBe(true);
    vi.runAllTimers();
    expect(model.state.status).toBe('error');
    expect(model.state.error).toContain('모의 실행 오류');
    expect(model.run()).toBe(true);
    vi.runAllTimers();
    expect(model.state.status).toBe('completed');
  });

  it('ignores even non-cooperative stale callbacks after cancel, system replacement and disposal', () => {
    const requests: MockRunRequest[] = [];
    const cancelled = vi.fn();
    const adapter: MockAdapter = {
      start(request) {
        requests.push(request);
        return { cancel: cancelled };
      }
    };
    const model = createLabModel({ systemId: 'system:double', adapter });
    model.run();
    model.cancel();
    requests[0]!.onReady();
    requests[0]!.onTick(10);
    requests[0]!.onComplete();
    expect(model.state.status).toBe('cancelled');
    expect(model.state.tick).toBe(0);
    model.run();
    model.selectSystem('system:rope');
    requests[1]!.onError('stale error');
    expect(model.state.status).toBe('ready');
    expect(model.state.systemId).toBe('system:rope');
    model.run();
    const listener = vi.fn();
    model.subscribe(listener);
    model.dispose();
    requests[2]!.onComplete();
    expect(listener).not.toHaveBeenCalled();
    expect(model.run()).toBe(false);
    expect(cancelled).toHaveBeenCalledTimes(3);
  });

  it('handles synchronous startup failure and prevents completion callbacks from reviving a run', () => {
    const failing = createLabModel({
      systemId: 'system:double',
      adapter: {
        start() {
          throw new Error('failure');
        }
      }
    });
    expect(failing.run()).toBe(false);
    expect(failing.state.status).toBe('error');
    const cancelled = vi.fn();
    const synchronous = createLabModel({
      systemId: 'system:double',
      adapter: {
        start(request) {
          request.onComplete();
          request.onReady();
          return { cancel: cancelled };
        }
      }
    });
    expect(synchronous.run()).toBe(true);
    expect(synchronous.state.status).toBe('completed');
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('saves detached settings, restores them without automatic execution and cancels a replaced run', () => {
    vi.useFakeTimers();
    const model = createLabModel({ systemId: 'system:double' });
    model.setField('m1', '2');
    model.toggleAnalysis('analysis:fft');
    model.step();
    const id = model.saveToTray()!;
    model.setField('m1', '3');
    model.selectSystem('system:rope');
    model.run();
    expect(model.restoreTray(id)).toBe(true);
    vi.runAllTimers();
    expect(model.state.status).toBe('ready');
    expect(model.state.fields.m1).toBe('2');
    expect(model.state.analysisIds).toEqual(['analysis:fft']);
    expect(model.state.tray[0]!.tick).toBe(1);
    expect(model.state.tick).toBe(0);
    const leaked = model.state;
    (leaked.fields as Record<string, string>).m1 = '999';
    expect(model.state.fields.m1).toBe('2');
    expect(model.removeTray(id)).toBe(true);
    expect(model.restoreTray(id)).toBe(false);
  });

  it('preserves a shared canonical source exactly, separately from mock default settings and export', () => {
    const experiment = experimentFixture();
    const original = structuredClone(experiment);
    const model = createLabModel({ experiment });
    expect(model.state.sourceExperiment).toEqual(original);
    expect(model.state.fields.step).toBe('0.01');
    model.setField('m1', '3');
    const exported = JSON.parse(model.exportSettings()!);
    expect(exported.mode).toBe('mock');
    expect(exported.scientificResults).toBe(false);
    expect(exported.settings.sourceExperiment).toEqual(original);
    expect(experiment).toEqual(original);
    expect(validateExperimentState(exported).ok).toBe(false);
    expect(() => createLabModel({ systemId: 'system:rope', experiment })).toThrow(/match/);
  });

  it('refuses a full tray without silently evicting saved user settings', () => {
    const model = createLabModel({ systemId: 'system:double' });
    for (let i = 0; i < 12; i += 1) expect(model.saveToTray()).not.toBeNull();
    const original = model.state.tray;
    expect(model.saveToTray()).toBeNull();
    expect(model.state.error).toContain('12개');
    expect(model.state.tray).toEqual(original);
  });
});
