import { describe, expect, it } from 'vitest';
import { transferOperatorSpectrum, ulamTransitionMatrix1D } from '../src/chaos/transferOperator';

describe('transfer-operator subdominant spectrum vs closed forms', () => {
  it('recovers {1, 1−a−b} for a 2-state Markov chain', () => {
    const a = 0.3;
    const b = 0.2;
    const transition = [1 - a, a, b, 1 - b];
    const s = transferOperatorSpectrum(transition, 2);
    expect(s.moduli[0]).toBeCloseTo(1, 10); // invariant measure
    expect(s.eigenvalues[0]!.re).toBeCloseTo(1, 10);
    expect(s.subdominantModulus).toBeCloseTo(Math.abs(1 - a - b), 10); // = 0.5
    expect(s.spectralGap).toBeCloseTo(a + b, 10); // 0.5
    expect(s.mixingRate).toBeCloseTo(-Math.log(0.5), 10); // = ln 2
  });

  it('recovers the spectrum ½ + ½cos(2πk/N) of a lazy ring random walk', () => {
    const n = 8;
    // doubly-stochastic lazy walk on a cycle: P = ½I + ¼(S + S⁻¹). Adding the
    // self-loop breaks the period-2 bipartite degeneracy (no λ = −1), leaving a
    // genuine spectral gap so the chain actually mixes.
    const transition = new Array<number>(n * n).fill(0);
    for (let i = 0; i < n; i += 1) {
      transition[i * n + i] = 0.5;
      transition[i * n + ((i + 1) % n)] = 0.25;
      transition[i * n + ((i - 1 + n) % n)] = 0.25;
    }
    const s = transferOperatorSpectrum(transition, n);
    // closed form λ_k = ½ + ½cos(2πk/N), all real and in [0, 1].
    const target = Array.from({ length: n }, (_, k) => 0.5 + 0.5 * Math.cos((2 * Math.PI * k) / n)).sort(
      (p, q) => q - p
    );
    for (let k = 0; k < n; k += 1) expect(s.moduli[k]).toBeCloseTo(target[k]!, 9);
    expect(s.moduli[0]).toBeCloseTo(1, 9); // k = 0 → λ = 1 (unique)
    expect(s.subdominantModulus).toBeCloseTo(0.5 + 0.5 * Math.cos(Math.PI / 4), 9); // 0.85355
    expect(s.spectralGap).toBeGreaterThan(0); // genuine mixing
  });

  it('keeps eigenvalues inside the unit disk and leads with λ = 1 for the doubling map', () => {
    const boxes = 16;
    const ulam = ulamTransitionMatrix1D((x) => (2 * x) % 1, [0, 1], boxes, 40);
    const s = transferOperatorSpectrum(ulam.transition, boxes);
    expect(s.eigenvalues.length).toBe(boxes);
    expect(s.moduli[0]).toBeCloseTo(1, 8); // stochastic ⇒ leading eigenvalue 1
    for (const m of s.moduli) expect(m).toBeLessThanOrEqual(1 + 1e-8); // spectral radius 1
    expect(s.subdominantModulus).toBeLessThan(1); // a genuine spectral gap (mixing)
    expect(s.spectralGap).toBeGreaterThan(0);
  });

  it('rejects malformed input', () => {
    expect(() => transferOperatorSpectrum([1], 0)).toThrow(/positive integer/);
    expect(() => transferOperatorSpectrum([1, 0, 0], 2)).toThrow(/shorter than/);
  });
});
