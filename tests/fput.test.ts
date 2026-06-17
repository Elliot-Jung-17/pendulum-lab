import { describe, expect, it } from 'vitest';
import {
  createFputModeState,
  createFputVerletScratch,
  fputAcceleration,
  fputEnergy,
  fputModeEnergies,
  fputModeFrequency,
  fputRecurrence,
  fputVelocityVerletStep
} from '../src/physics/fput';

describe('FPUT lattice — harmonic limit & energy', () => {
  it('matches the closed-form harmonic mode frequencies', () => {
    const n = 4;
    // ω_k = 2 sin(kπ/2(N+1)); for N=4, k=1..4.
    for (let k = 1; k <= n; k += 1) {
      expect(fputModeFrequency(k, n)).toBeCloseTo(2 * Math.sin((k * Math.PI) / (2 * (n + 1))), 12);
    }
  });

  it('sums mode energies to the total energy in the harmonic limit (α = β = 0)', () => {
    const n = 16;
    const params = { size: n, alpha: 0, beta: 0 };
    const state = new Float64Array(2 * n);
    // A generic state: mix of modes plus momenta.
    for (let i = 0; i < n; i += 1) {
      state[i] = Math.sin(0.4 * i) * 0.3 + Math.cos(0.7 * i) * 0.2;
      state[n + i] = Math.sin(1.1 * i) * 0.15;
    }
    const total = fputEnergy(state, params);
    const modeSum = fputModeEnergies(state, params).reduce((a, b) => a + b, 0);
    expect(modeSum).toBeCloseTo(total, 8);
  });

  it('conserves energy under velocity-Verlet (β-FPUT)', () => {
    const n = 16;
    const params = { size: n, alpha: 0, beta: 0.3 };
    const state = createFputModeState(n, 1, 1.2);
    const scratch = createFputVerletScratch(n);
    const e0 = fputEnergy(state, params);
    let drift = 0;
    const dt = 0.02;
    for (let s = 0; s < 5000; s += 1) {
      fputVelocityVerletStep(state, dt, params, scratch);
      drift = Math.max(drift, Math.abs(fputEnergy(state, params) - e0) / Math.abs(e0));
    }
    expect(drift).toBeLessThan(1e-4);
  });

  it('the harmonic chain keeps all energy in its initial mode (no coupling)', () => {
    const n = 16;
    const params = { size: n, alpha: 0, beta: 0 };
    const result = fputRecurrence(params, { mode: 3, amplitude: 1, dt: 0.05, totalTime: 200, sampleEvery: 20 });
    // With no nonlinearity, a normal mode is invariant: its fraction stays ≈ 1.
    expect(result.minFraction).toBeGreaterThan(0.999);
    expect(result.energyDrift).toBeLessThan(1e-3); // velocity-Verlet bounded drift at dt=0.05
  });

  it('acceleration reduces to the discrete Laplacian in the harmonic limit', () => {
    const n = 5;
    const params = { size: n, alpha: 0, beta: 0 };
    const q = [0.1, -0.2, 0.05, 0.3, -0.1];
    const out = new Float64Array(n);
    fputAcceleration(q, params, out);
    for (let i = 0; i < n; i += 1) {
      const left = i > 0 ? q[i - 1]! : 0;
      const right = i < n - 1 ? q[i + 1]! : 0;
      expect(out[i]).toBeCloseTo(right - 2 * q[i]! + left, 12);
    }
  });
});

describe('FPUT recurrence', () => {
  it('an anharmonic chain spreads energy from mode 1 and then recurs', () => {
    // α-FPUT, N=16, mode-1 start: a clean spread-then-recurrence in a bounded window.
    const params = { size: 16, alpha: 0.25, beta: 0 };
    const result = fputRecurrence(params, { mode: 1, amplitude: 1, dt: 0.05, totalTime: 2000, sampleEvery: 10 });

    // Energy conservation throughout the run.
    expect(result.energyDrift).toBeLessThan(1e-3);
    // Energy leaves mode 1 and spreads across the spectrum...
    expect(result.minFraction).toBeLessThan(0.5);
    // ...then nearly all of it returns to mode 1 (the FPUT recurrence) — the
    // chain does NOT thermalise to equipartition (which would hold ≈ 1/N ≈ 0.06).
    expect(result.recurrenceFraction).toBeGreaterThan(0.9);
    expect(result.recurrenceTime).toBeGreaterThan(0);
  });
});
