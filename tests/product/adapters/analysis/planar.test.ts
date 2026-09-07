import { describe, expect, it } from 'vitest';
import { maximalLyapunov } from '../../../../src/chaos/lyapunov';
import { poincareSection } from '../../../../src/chaos/poincare';
import { createDoublePendulumDerivative } from '../../../../src/physics/double';
import { createCompoundDoublePendulumDerivative } from '../../../../src/physics/compoundDouble';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  type PlanarConfig,
  type PlanarSample
} from '../../../../src/product/adapters/physics/planar';
import {
  analyzePlanarTrajectory,
  executePlanarAnalysisJob,
  runPlanarAnalysis,
  type PlanarAnalysisEvent,
  type PlanarAnalysisProgress
} from '../../../../src/product/adapters/analysis/planar';
import {
  defaultPlanarAnalysisSettings,
  fromPlanarAnalysisState,
  toPlanarAnalysisState,
  validatePlanarAnalysisSettings
} from '../../../../src/product/adapters/analysis/settings';

const base = (systemId: PlanarConfig['systemId']): PlanarConfig => ({
  ...defaultPlanarConfig(systemId),
  step: 0.01,
  duration: 6
});

describe('S07 legacy analysis parity', () => {
  for (const systemId of ['system:double', 'system:compound-double'] as const) {
    const config = base(systemId);
    const legacyRhs = () =>
      systemId === 'system:double'
        ? createDoublePendulumDerivative(config.parameters, config.gamma)
        : createCompoundDoublePendulumDerivative(config.parameters, config.gamma);

    it(`${systemId}: Poincare uses identical refined crossings and certification`, () => {
      const settings = {
        ...defaultPlanarAnalysisSettings('poincare', config),
        direction: 'both' as const,
        transientCrossings: 1
      };
      const legacy = poincareSection(config.initialState, legacyRhs(), {
        dt: config.step,
        maxTime: settings.duration,
        section: (s) => s[0]!,
        direction: 'both',
        transientCrossings: 1,
        maxPoints: 2000,
        rootTol: 1e-9
      });
      const progress: PlanarAnalysisProgress[] = [];
      const result = runPlanarAnalysis({ id: 'parity', kind: 'poincare', config, settings }, (event) =>
        progress.push(event)
      );
      expect(result.kind).toBe('poincare');
      if (result.kind !== 'poincare') throw new Error('wrong kind');
      expect(result.data).toEqual({ ...legacy, points: legacy.points.map((p) => Array.from(p)) });
      expect(result.data.points.length).toBeGreaterThan(1);
      expect(result.data.rootBracketWidths.every((width) => width <= 1e-9)).toBe(true);
      expect(progress.filter((p) => p.phase === 'calculating').every((p) => p.fraction === null)).toBe(true);
      expect(progress.at(-1)).toMatchObject({ phase: 'complete', fraction: 1 });
      expect(progress.at(-1)!.work).toBeGreaterThan((4 * settings.duration) / config.step);
    });

    for (const method of ['rk4', 'rk2', 'euler'] as const) {
      it(`${systemId}/${method}: maximal Lyapunov matches the legacy engine and exact measured work`, () => {
        const jobConfig = { ...config, integratorId: `integrator:${method}` as const, step: 0.001, duration: 0.41 };
        const settings = { duration: 0.41, transient: 0.1, renormEvery: 13, seed: 42 };
        const legacy = maximalLyapunov(config.initialState, legacyRhs(), {
          dt: 0.001,
          steps: 410,
          transientSteps: 100,
          renormEvery: 13,
          seed: 42,
          method
        });
        const events: PlanarAnalysisProgress[] = [];
        const result = runPlanarAnalysis({ id: 'lyap', kind: 'lyapunov', config: jobConfig, settings }, (event) =>
          events.push(event)
        );
        expect(result.kind).toBe('lyapunov');
        if (result.kind !== 'lyapunov') throw new Error('wrong kind');
        expect(result.data).toEqual(legacy);
        expect(events.length).toBeGreaterThan(2);
        const expectedWork = (410 * 2 + 100) * (method === 'rk4' ? 4 : method === 'rk2' ? 2 : 1);
        expect(events.at(-1)!.work).toBe(expectedWork);
        expect(events.every((event, i) => i === 0 || event.work >= events[i - 1]!.work)).toBe(true);
        expect(
          events
            .filter((event) => event.phase === 'calculating')
            .every((event) => event.fraction === event.work / expectedWork)
        ).toBe(true);
        expect(runPlanarAnalysis({ id: 'repeat', kind: 'lyapunov', config: jobConfig, settings }).data).toEqual(legacy);
      });
    }

    it(`${systemId}: plots use actual samples without changing the input trajectory`, () => {
      const simulation = createPlanarSimulation({ ...config, duration: 0.05 });
      const samples: PlanarSample[] = [simulation.snapshot()];
      while (!simulation.done) samples.push(simulation.step());
      const original = structuredClone(samples);
      const projected = analyzePlanarTrajectory(samples);
      expect(projected.stateTime.at(-1)!.theta2).toBe(samples.at(-1)!.state[1]);
      expect(projected.energy.map((p) => p.total)).toEqual(samples.map((s) => s.energy.total));
      expect(projected.phase.map((p) => p.omega1)).toEqual(samples.map((s) => s.state[2]));
      expect(projected.units).toEqual({ time: 's', angle: 'rad', angularVelocity: 'rad/s', energy: 'J' });
      expect(samples).toEqual(original);
    });
  }

  it('reports empty sections and the independent RK4 method explicitly', () => {
    const config = { ...base('system:double'), integratorId: 'integrator:euler' as const };
    const settings = { ...defaultPlanarAnalysisSettings('poincare', config), sectionValue: 200 };
    const result = runPlanarAnalysis({ id: 'empty', kind: 'poincare', config, settings });
    expect(result.kind).toBe('poincare');
    if (result.kind !== 'poincare') throw new Error('wrong kind');
    expect(result.data.points).toHaveLength(0);
    expect(result.method).toBe('rk4');
    expect(result.warnings.join(' ')).toContain('교차가 없습니다');
    expect(result.warnings.join(' ')).toContain('선택한 적분기와 다릅니다');
  });

  it('rejects invalid trajectories and excessive settings before computation', () => {
    const config = base('system:double');
    const s = createPlanarSimulation(config).snapshot();
    expect(analyzePlanarTrajectory([]).energy).toEqual([]);
    expect(() => analyzePlanarTrajectory([s, s])).toThrow('시간');
    expect(() => analyzePlanarTrajectory([{ ...s, energy: { ...s.energy, total: NaN } }])).toThrow('유한');
    expect(() =>
      validatePlanarAnalysisSettings(
        'lyapunov',
        { duration: 300, transient: 300, renormEvery: 10, seed: 1 },
        { ...config, step: 0.000001 }
      )
    ).toThrow('계산량');
    expect(() =>
      validatePlanarAnalysisSettings('lyapunov', { duration: 1, transient: 0, renormEvery: 1.5, seed: 1 }, config)
    ).toThrow('정수');
    expect(() =>
      validatePlanarAnalysisSettings(
        'poincare',
        { ...defaultPlanarAnalysisSettings('poincare', config), direction: 'unknown' },
        config
      )
    ).toThrow('방향');
    expect(() =>
      validatePlanarAnalysisSettings(
        'poincare',
        { ...defaultPlanarAnalysisSettings('poincare', config), maxPoints: 2001 },
        config
      )
    ).toThrow('2000');
  });

  it('converts worker-side configuration/numerical errors into error events', () => {
    const events: PlanarAnalysisEvent[] = [];
    executePlanarAnalysisJob(
      { id: 'bad', kind: 'lyapunov', config: { ...base('system:double'), step: NaN } },
      (event) => events.push(event)
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', id: 'bad' });
    expect(() => runPlanarAnalysis({ id: 'bad!', kind: 'lyapunov', config: base('system:double') })).toThrow('ID');
  });
});

describe('S07 analysis settings canonical round trip', () => {
  const config = base('system:double');
  for (const kind of ['poincare', 'lyapunov'] as const) {
    it(`${kind}: preserves every setting and rejects unknown algorithms/units/options`, () => {
      const settings = defaultPlanarAnalysisSettings(kind, config);
      const state = toPlanarAnalysisState(kind, settings);
      expect(fromPlanarAnalysisState(JSON.parse(JSON.stringify(state)), config)).toEqual(settings);
      expect(() => fromPlanarAnalysisState({ ...state, algorithmVersion: 'future' }, config)).toThrow('버전');
      expect(() =>
        fromPlanarAnalysisState(
          { ...state, settings: { ...state.settings, duration: { kind: 'scalar', value: 6, unit: 'rad' } } },
          config
        )
      ).toThrow('단위');
      expect(() =>
        fromPlanarAnalysisState(
          { ...state, settings: { ...state.settings, ignored: { kind: 'scalar', value: 1, unit: '1' } } },
          config
        )
      ).toThrow('지원하지');
    });
  }
});
