import { describe, expect, test } from 'vitest';
import { empiricalOrder } from '../src/research/convergenceOrder';
import { rhsDouble } from '../src/physics/double';
import type { IntegratorId } from '../src/types/domain';

/**
 * Certify that each integrator actually achieves its declared order via
 * Richardson self-convergence (no analytic solution needed). The horizon is kept
 * short so the trajectory stays smooth and we measure the asymptotic order
 * rather than chaotic saturation; the step sizes are coarse enough that the
 * finest self-difference stays well above floating-point round-off.
 */

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const rhs = (s: Float64Array, o: Float64Array): void => {
  rhsDouble(s, params, 0, o);
};
const state0 = new Float64Array([0.5, 0.3, 0, 0]);

const cases: { method: IntegratorId; expected: number }[] = [
  { method: 'euler', expected: 1 },
  { method: 'rk2', expected: 2 },
  { method: 'rk4', expected: 4 },
  { method: 'gauss2', expected: 4 }
];

describe('empirical convergence order matches the declared order', () => {
  for (const { method, expected } of cases) {
    test(`${method} ≈ order ${expected}`, () => {
      const result = empiricalOrder(method, rhs, state0, {
        baseDt: 0.02,
        totalTime: 0.8,
        refinements: 3
      });
      expect(Number.isFinite(result.estimatedOrder)).toBe(true);
      // Self-differences must shrink monotonically (we are in the convergent regime).
      const diffs = result.selfDifferences.map((d) => d.difference);
      for (let i = 1; i < diffs.length; i += 1) expect(diffs[i]!).toBeLessThan(diffs[i - 1]!);
      // Empirical order within half an order of the theoretical value.
      expect(result.estimatedOrder).toBeGreaterThan(expected - 0.5);
      expect(result.estimatedOrder).toBeLessThan(expected + 0.6);
    });
  }
});
