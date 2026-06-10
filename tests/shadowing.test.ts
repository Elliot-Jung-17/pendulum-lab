import { describe, expect, test } from 'vitest';
import { shadowingHorizon } from '../src/chaos/index';
import { rhsDouble } from '../src/physics/double';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const doublePendulum = (s: Float64Array, o: Float64Array): void => {
  rhsDouble(s, params, 0, o);
};

describe('shadowing / reproducibility horizon', () => {
  test('a coarse Euler integration of the chaotic double pendulum loses the reference in finite time', () => {
    const result = shadowingHorizon(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, {
      dt: 0.01,
      T: 40,
      threshold: 0.1,
      method: 'euler',
      referenceMethod: 'gbs'
    });
    expect(result.horizon).toBeGreaterThan(0);
    expect(result.horizon).toBeLessThan(40);
    expect(result.finalSeparation).toBeGreaterThan(result.threshold);
    expect(result.series.length).toBeGreaterThan(10);
  });

  test('a high-accuracy method shadows the reference far longer than a low-order one', () => {
    const common = { dt: 0.005, T: 30, threshold: 1e-3, referenceMethod: 'gbs' as const };
    const euler = shadowingHorizon(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, { ...common, method: 'euler' });
    const rk4 = shadowingHorizon(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, { ...common, method: 'rk4' });
    expect(rk4.horizon).toBeGreaterThan(euler.horizon);
  });

  test('the divergence series is monotone in time and starts near zero', () => {
    const result = shadowingHorizon(new Float64Array([1.0, 0.5, 0, 0]), doublePendulum, {
      dt: 0.005,
      T: 10,
      threshold: 1e-2,
      method: 'rk4'
    });
    const first = result.series[0]!;
    expect(first.separation).toBeLessThan(1e-3);
    for (let i = 1; i < result.series.length; i += 1) {
      expect(result.series[i]!.time).toBeGreaterThan(result.series[i - 1]!.time);
    }
  });
});
