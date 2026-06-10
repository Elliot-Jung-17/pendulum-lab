import { describe, expect, test } from 'vitest';
import { energyDouble, relativeEnergyDrift } from '../src/physics/energy';
import { rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';

describe('energy drift', () => {
  test('RK4 keeps short small-angle double-pendulum drift bounded when gamma = 0', () => {
    const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
    const state = new Float64Array([0.08, 0.06, 0, 0]);
    const out = new Float64Array(4);
    const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, parameters, 0, o);
    const initial = energyDouble(state, parameters);
    for (let i = 0; i < 2_000; i += 1) {
      rk4Step(state, 0.001, rhs, out);
      state.set(out);
    }
    expect(relativeEnergyDrift(initial, energyDouble(state, parameters))).toBeLessThan(1e-5);
  });
});
