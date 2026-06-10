import { describe, expect, test } from 'vitest';
import { analyzeSpectrumConsistency, lyapunovSpectrum } from '../src/chaos/index';
import { rhsDouble } from '../src/physics/double';
import { buildJacobian } from '../src/physics/systemSpec';

describe('analyzeSpectrumConsistency', () => {
  test('an ideal Hamiltonian spectrum {λ,0,0,−λ} passes every gate', () => {
    const c = analyzeSpectrumConsistency([0.9, 0.001, -0.001, -0.9]);
    expect(Math.abs(c.sum)).toBeLessThan(1e-9);
    expect(c.pairingError).toBeLessThan(1e-2);
    expect(c.zeroExponentCount).toBe(2);
    expect(c.symplectic).toBe(true);
  });

  test('input order does not matter (a descending copy is taken)', () => {
    const sorted = analyzeSpectrumConsistency([0.9, 0.0, 0.0, -0.9]);
    const shuffled = analyzeSpectrumConsistency([0.0, -0.9, 0.9, 0.0]);
    expect(shuffled.sum).toBeCloseTo(sorted.sum, 12);
    expect(shuffled.pairingError).toBeCloseTo(sorted.pairingError, 12);
  });

  test('a dissipative (non-paired) spectrum fails the symplectic gate', () => {
    const c = analyzeSpectrumConsistency([0.5, -0.1, -0.3, -0.9]);
    expect(c.symplectic).toBe(false);
    expect(Math.abs(c.sum)).toBeGreaterThan(c.tolerances.sumTolerance);
  });

  test('an odd-dimensional spectrum folds the lone middle exponent into the pairing error', () => {
    const c = analyzeSpectrumConsistency([0.7, 0.2, -0.7]);
    expect(c.pairingError).toBeCloseTo(0.2, 12);
  });
});

describe('lyapunovSpectrum reports a consistency verdict for the conservative double pendulum', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };

  test('the computed spectrum is approximately symplectic and sums to ~0', () => {
    const result = lyapunovSpectrum(
      new Float64Array([2.0, 2.0, 0, 0]),
      rhs,
      4,
      { steps: 16_000 },
      buildJacobian({ kind: 'double', ...params })
    );
    expect(result.consistency.sum).toBeCloseTo(result.sum, 12);
    // A finite run will not be exactly symplectic, but it must be in the ballpark.
    expect(Math.abs(result.consistency.sum)).toBeLessThan(0.15);
    expect(result.consistency.pairingError).toBeLessThan(0.2);
    // Every exponent carries a decorrelated block standard error.
    expect(result.blockStdError.length).toBe(result.spectrum.length);
    for (const se of result.blockStdError) expect(se).toBeGreaterThanOrEqual(0);
  });
});
