import { describe, expect, test } from 'vitest';
import { rhsDouble, jacobianDouble } from '../src/physics/double';
import { hamiltonianGradient, canonicalHamiltonian, omegaToMomentum } from '../src/physics/canonical';
import { maximalLyapunov, lyapunovSpectrum } from '../src/chaos/index';
import { buildJacobian } from '../src/physics/systemSpec';
import type { PendulumParameters } from '../src/types/domain';

/**
 * These tests are the correctness guarantee for the hand-derived closed-form
 * derivatives. Each analytic derivative is checked against an independent
 * central-difference of the very function it differentiates, at several states
 * and with and without damping. If a sign or term were wrong, the mismatch
 * would be O(1), not O(h^2), so the tight tolerances below would fail loudly.
 */

const params: PendulumParameters = { m1: 1.3, m2: 0.7, l1: 1.1, l2: 0.9, g: 9.81 };

function centralJacobian(state: number[], gamma: number): Float64Array {
  const h = 1e-6;
  const jac = new Float64Array(16);
  const plus = new Float64Array(4);
  const minus = new Float64Array(4);
  for (let j = 0; j < 4; j += 1) {
    const sp = Float64Array.from(state);
    const sm = Float64Array.from(state);
    sp[j] = (sp[j] ?? 0) + h;
    sm[j] = (sm[j] ?? 0) - h;
    rhsDouble(sp, params, gamma, plus);
    rhsDouble(sm, params, gamma, minus);
    for (let i = 0; i < 4; i += 1) jac[i * 4 + j] = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
  }
  return jac;
}

describe('analytic Jacobian of the double pendulum', () => {
  const states: number[][] = [
    [0.4, -0.9, 0.3, -0.2],
    [2.1, 1.2, -1.4, 0.8],
    [-1.7, 0.5, 2.0, -2.3],
    [0.05, 0.02, 0.0, 0.0]
  ];
  for (const gamma of [0, 0.25]) {
    for (const s of states) {
      test(`matches central differences at ${JSON.stringify(s)} (gamma=${gamma})`, () => {
        const analytic = new Float64Array(16);
        jacobianDouble(s, params, gamma, analytic);
        const fd = centralJacobian(s, gamma);
        let maxDiff = 0;
        for (let i = 0; i < 16; i += 1) maxDiff = Math.max(maxDiff, Math.abs((analytic[i] ?? 0) - (fd[i] ?? 0)));
        expect(maxDiff).toBeLessThan(1e-5);
      });
    }
  }

  test('buildJacobian exposes the analytic Jacobian for the double spec only', () => {
    const jac = buildJacobian({ kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 });
    expect(jac).toBeTypeOf('function');
    expect(buildJacobian({ kind: 'spring', mass: 1, stiffness: 1, restLength: 1, g: 9.81 })).toBeUndefined();
  });
});

describe('analytic Hamiltonian gradient', () => {
  function centralGradient(canon: number[]): Float64Array {
    const h = 1e-6;
    const grad = new Float64Array(4);
    for (let i = 0; i < 4; i += 1) {
      const yp = Float64Array.from(canon);
      const ym = Float64Array.from(canon);
      yp[i] = (yp[i] ?? 0) + h;
      ym[i] = (ym[i] ?? 0) - h;
      grad[i] = (canonicalHamiltonian(yp, params).total - canonicalHamiltonian(ym, params).total) / (2 * h);
    }
    return grad;
  }

  const thetaOmega: number[][] = [
    [0.6, -0.3, 0.4, 0.9],
    [1.8, 1.1, -1.2, 0.5],
    [-0.7, 0.9, 2.1, -1.6]
  ];
  for (const to of thetaOmega) {
    test(`matches central differences of H at ${JSON.stringify(to)}`, () => {
      const canon = Array.from(omegaToMomentum(Float64Array.from(to), params));
      const analytic = hamiltonianGradient(canon, params);
      const fd = centralGradient(canon);
      let maxDiff = 0;
      for (let i = 0; i < 4; i += 1) maxDiff = Math.max(maxDiff, Math.abs((analytic[i] ?? 0) - (fd[i] ?? 0)));
      expect(maxDiff).toBeLessThan(1e-5);
    });
  }
});

describe('uncertainty quantification', () => {
  const dpParams = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const doublePendulum = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, dpParams, 0, o);
  };

  test('maximal Lyapunov reports a non-negative SE and a CI that brackets the estimate', () => {
    const result = maximalLyapunov(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, { steps: 12_000 });
    expect(result.stdError).toBeGreaterThanOrEqual(0);
    expect(result.ci95[0]).toBeLessThanOrEqual(result.lambdaMax);
    expect(result.ci95[1]).toBeGreaterThanOrEqual(result.lambdaMax);
  });

  test('spectrum reports one SE per exponent', () => {
    const result = lyapunovSpectrum(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, 4, { steps: 12_000 });
    expect(result.stdError.length).toBe(result.spectrum.length);
    for (const se of result.stdError) expect(se).toBeGreaterThanOrEqual(0);
  });

  test('analytic-Jacobian spectrum agrees with the finite-difference spectrum', () => {
    const opts = { steps: 14_000 } as const;
    const fd = lyapunovSpectrum(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, 4, opts);
    const analytic = lyapunovSpectrum(
      new Float64Array([2.0, 2.0, 0, 0]),
      doublePendulum,
      4,
      opts,
      buildJacobian({ kind: 'double', ...dpParams })
    );
    // Both estimate the same exponents; the analytic path is more accurate but
    // must not disagree with the (already good) central-difference path.
    expect(Math.abs((analytic.spectrum[0] ?? 0) - (fd.spectrum[0] ?? 0))).toBeLessThan(0.05);
    expect(Math.abs(analytic.sum)).toBeLessThan(0.1);
  });
});
