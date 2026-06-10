import { describe, expect, test } from 'vitest';
import { drivenPeriodicOrbit } from '../src/chaos/floquet';
import { drivenPeriodicOrbitN, realEigenvector2x2, switchPeriodDoubling } from '../src/chaos/branchSwitching';

/**
 * Period-doubling branch switching on the classic damped driven pendulum
 * (γ = 0.5, ω = 2/3): the oscillating period-1 orbit's real multiplier crosses
 * −1 near A ≈ 1.066 (the literature value for this textbook system), and
 * switching maps to P² along the critical eigenvector lands on the *stable*
 * period-2 orbit — the first step of the Feigenbaum cascade (chaos near 1.08).
 */

const params = (A: number) => ({ g: 1, length: 1, damping: 0.5, driveAmplitude: A, driveFrequency: 2 / 3 });
// Warm start on the oscillating (non-whirling) branch, from a direct-simulation probe.
const GUESS: [number, number] = [-0.2926, 1.9745];

describe('realEigenvector2x2', () => {
  test('recovers eigenvectors of an upper-triangular matrix', () => {
    // M = [[2,1],[0,3]]: eigenvector for 3 is (1,1)/√2, for 2 is (1,0).
    const M = [2, 1, 0, 3];
    const v3 = realEigenvector2x2(M, 3);
    expect(Math.abs(v3[0]) - Math.abs(v3[1])).toBeLessThan(1e-12);
    const v2 = realEigenvector2x2(M, 2);
    expect(Math.abs(v2[1])).toBeLessThan(1e-12);
    expect(Math.hypot(v2[0], v2[1])).toBeCloseTo(1, 12);
  });
});

describe('period-doubling of the driven pendulum', () => {
  test('the oscillating P1 branch crosses mu = -1 between A = 1.065 and 1.07', () => {
    const before = drivenPeriodicOrbit(params(1.065), GUESS, { dt: 0.005, tolerance: 1e-10 });
    const after = drivenPeriodicOrbit(params(1.07), before.orbit, { dt: 0.005, tolerance: 1e-10 });
    expect(before.converged).toBe(true);
    expect(after.converged).toBe(true);
    // Real multiplier on both sides of −1 (the PD crossing).
    const muBefore = Math.min(before.multipliers[0]!.re, before.multipliers[1]!.re);
    const muAfter = Math.min(after.multipliers[0]!.re, after.multipliers[1]!.re);
    expect(before.multipliers.every((m) => Math.abs(m.im) < 1e-9)).toBe(true);
    expect(muBefore).toBeGreaterThan(-1);
    expect(muBefore).toBeLessThan(-0.8); // already close to the crossing
    expect(muAfter).toBeLessThan(-1);
    expect(before.stable).toBe(true);
    expect(after.stable).toBe(false);
  });

  test('switching at A = 1.07 lands on the stable period-2 orbit', () => {
    const p1 = drivenPeriodicOrbit(params(1.07), GUESS, { dt: 0.005, tolerance: 1e-10 });
    expect(p1.converged).toBe(true);
    const sw = switchPeriodDoubling(params(1.07), p1.orbit, { dt: 0.005, tolerance: 1e-10 });

    expect(sw.switched).toBe(true);
    expect(sw.criticalMultiplier.re).toBeLessThan(-1); // just past the PD
    expect(sw.separation).toBeGreaterThan(0.05); // genuinely a different orbit

    const p2 = sw.doubled;
    expect(p2.converged).toBe(true);
    expect(p2.residual).toBeLessThan(1e-9);
    expect(p2.n).toBe(2);
    // Just past onset the doubled orbit is the attractor: stable.
    expect(p2.stable).toBe(true);
    // It is a true 2-cycle: the two strobe points are distinct.
    const [c0, c1] = p2.cycle;
    expect(p2.cycle.length).toBe(2);
    expect(Math.hypot(c0![0] - c1![0], c0![1] - c1![1])).toBeGreaterThan(0.05);
    // And NOT a period-1 orbit: Newton on the single-period map from the P2
    // point falls back to the (unstable) period-1 fixed point, away from it.
    const back = drivenPeriodicOrbitN(params(1.07), p2.orbit, 1, { dt: 0.005, tolerance: 1e-10 });
    expect(back.converged).toBe(true);
    expect(Math.hypot(back.orbit[0] - p2.orbit[0], back.orbit[1] - p2.orbit[1])).toBeGreaterThan(0.05);
    expect(Math.hypot(back.orbit[0] - p1.orbit[0], back.orbit[1] - p1.orbit[1])).toBeLessThan(1e-3);
  });

  test('drivenPeriodicOrbitN with n = 1 reproduces the period-1 solver', () => {
    const a = drivenPeriodicOrbit(params(1.05), GUESS, { dt: 0.005, tolerance: 1e-10 });
    const b = drivenPeriodicOrbitN(params(1.05), GUESS, 1, { dt: 0.005, tolerance: 1e-10 });
    expect(b.converged).toBe(true);
    expect(Math.abs(a.orbit[0] - b.orbit[0])).toBeLessThan(1e-6);
    expect(Math.abs(a.orbit[1] - b.orbit[1])).toBeLessThan(1e-6);
  });
});
