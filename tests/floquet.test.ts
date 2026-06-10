import { describe, expect, test } from 'vitest';
import { eigenvalues2x2, floquetAnalysis, drivenPeriodicOrbit } from '../src/chaos/index';
import type { Derivative } from '../src/physics/types';

/**
 * Floquet stability is pinned on systems whose monodromy is analytically known.
 * A linear oscillator's monodromy over one period has determinant exp(∫ div f),
 * so the damping rate fixes Π|ρ_i| exactly; an undamped oscillator sits on the
 * unit circle (marginal), and an inverted/saddle oscillator has a multiplier
 * outside it (unstable). The driven-pendulum case then exercises the full
 * stroboscopic Newton orbit-finder + monodromy eigenvalues.
 */

describe('eigenvalues2x2', () => {
  test('a rotation matrix has a complex pair on the unit circle', () => {
    const t = 0.7;
    const ev = eigenvalues2x2([Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]);
    expect(ev[0]!.modulus).toBeCloseTo(1, 12);
    expect(ev[1]!.modulus).toBeCloseTo(1, 12);
    expect(ev[0]!.re).toBeCloseTo(Math.cos(t), 12);
    expect(Math.abs(ev[0]!.im)).toBeCloseTo(Math.sin(t), 12);
  });
  test('a diagonal matrix has real eigenvalues equal to its diagonal', () => {
    const ev = eigenvalues2x2([2, 0, 0, 0.5]);
    const mods = ev.map((e) => e.modulus).sort((a, b) => a - b);
    expect(mods[0]!).toBeCloseTo(0.5, 12);
    expect(mods[1]!).toBeCloseTo(2, 12);
  });
});

describe('Floquet analysis of linear oscillators', () => {
  const omega0 = 1.3;
  const period = (2 * Math.PI) / omega0;

  test('undamped oscillator: multipliers on the unit circle (marginally stable)', () => {
    const rhs: Derivative = (s, o) => {
      o[0] = s[1] ?? 0;
      o[1] = -omega0 * omega0 * (s[0] ?? 0);
    };
    const r = floquetAnalysis([0.3, 0], rhs, period, { dt: 0.002 });
    expect(r.determinant).toBeCloseTo(1, 4); // divergence 0 ⇒ det 1
    expect(r.maxModulus).toBeCloseTo(1, 3);
    expect(r.stable).toBe(true);
  });

  test('damped oscillator: Π|ρ| = e^{-2γT} and the orbit contracts (stable)', () => {
    const gamma = 0.15;
    const rhs: Derivative = (s, o) => {
      o[0] = s[1] ?? 0;
      o[1] = -omega0 * omega0 * (s[0] ?? 0) - 2 * gamma * (s[1] ?? 0);
    };
    const r = floquetAnalysis([0.3, 0], rhs, period, { dt: 0.002 });
    // det(M) = exp(∫ div dt) = exp(-2γT).
    expect(r.determinant).toBeCloseTo(Math.exp(-2 * gamma * period), 3);
    expect(r.maxModulus).toBeLessThan(1);
    expect(r.stable).toBe(true);
  });

  test('inverted (saddle) oscillator: a multiplier outside the unit circle (unstable)', () => {
    const rhs: Derivative = (s, o) => {
      o[0] = s[1] ?? 0;
      o[1] = +omega0 * omega0 * (s[0] ?? 0); // ẍ = +ω² x
    };
    const r = floquetAnalysis([0.01, 0], rhs, period, { dt: 0.002 });
    expect(r.maxModulus).toBeGreaterThan(1);
    expect(r.stable).toBe(false);
    // tr A = 0 ⇒ det(M) = 1 ⇒ multipliers are reciprocal (ρ and 1/ρ).
    expect(r.determinant).toBeCloseTo(1, 3);
  });
});

describe('driven-pendulum period-1 orbit (stroboscopic Newton + monodromy)', () => {
  test('weak drive + damping → a converged, stable period-1 orbit with det = e^{-γT}', () => {
    const params = { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 };
    const period = (2 * Math.PI) / params.driveFrequency;
    const r = drivenPeriodicOrbit(params, [0, 0], { dt: 0.005, tolerance: 1e-10 });
    expect(r.converged).toBe(true);
    expect(r.residual).toBeLessThan(1e-8);
    // (θ,ω) divergence is −damping, so det(monodromy) = e^{-damping·T}.
    expect(r.determinant).toBeCloseTo(Math.exp(-params.damping * period), 3);
    expect(r.maxModulus).toBeLessThan(1);
    expect(r.stable).toBe(true);
  });
});
