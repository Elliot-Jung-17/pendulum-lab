import { describe, expect, it } from 'vitest';
import { floquetLinearSpectrum, monodromyLinear } from '../src/chaos/floquetLinear';
import { eigenvaluesGeneral } from '../src/research/eigenGeneral';
import type { Complex } from '../src/research/complexEig';

function spectraMaxDistance(a: readonly Complex[], b: readonly Complex[]): number {
  expect(a.length).toBe(b.length);
  const used = new Array<boolean>(b.length).fill(false);
  let worst = 0;
  for (const za of a) {
    let bestIdx = -1;
    let bestD = Infinity;
    for (let j = 0; j < b.length; j += 1) {
      if (used[j]) continue;
      const d = Math.hypot(za.re - b[j]!.re, za.im - b[j]!.im);
      if (d < bestD) {
        bestD = d;
        bestIdx = j;
      }
    }
    used[bestIdx] = true;
    worst = Math.max(worst, bestD);
  }
  return worst;
}

describe('monodromy of a constant rotation generator A = [[0,ω],[−ω,0]]', () => {
  const omega = 0.7;
  const period = 1.0; // ωT = 0.7 < π so the exponent imaginary part is unfolded
  const A = () => [
    [0, omega],
    [-omega, 0]
  ];

  it('matches the analytic rotation monodromy exp(AT)', () => {
    const m = monodromyLinear(A, period, 2, 4000);
    const c = Math.cos(omega * period);
    const s = Math.sin(omega * period);
    expect(m[0]![0]!).toBeCloseTo(c, 9);
    expect(m[0]![1]!).toBeCloseTo(s, 9);
    expect(m[1]![0]!).toBeCloseTo(-s, 9);
    expect(m[1]![1]!).toBeCloseTo(c, 9);
  });

  it('gives multipliers e^{±iωT}, exponents ±iω, det = 1, marginal stability', () => {
    const r = floquetLinearSpectrum(A, period, 2, { convergenceCheck: true });
    const target: Complex[] = [
      { re: Math.cos(omega * period), im: Math.sin(omega * period) },
      { re: Math.cos(omega * period), im: -Math.sin(omega * period) }
    ];
    expect(spectraMaxDistance(r.multipliers, target)).toBeLessThan(1e-9);
    // exponents: Re = 0, Im = ±ω
    for (const e of r.exponents) expect(Math.abs(e.re)).toBeLessThan(1e-9);
    expect(Math.max(...r.exponents.map((e) => e.im))).toBeCloseTo(omega, 8);
    expect(Math.min(...r.exponents.map((e) => e.im))).toBeCloseTo(-omega, 8);
    expect(r.determinant).toBeCloseTo(1, 8);
    expect(Math.abs(r.diagnostics.unitDeterminantDrift)).toBeLessThan(1e-8);
    expect(r.diagnostics.convergence?.fineSteps).toBe(4000);
    expect(r.diagnostics.convergence?.coarseSteps).toBe(2000);
    expect(r.diagnostics.convergence?.maxEntryDelta).toBeLessThan(1e-12);
    expect(r.spectralRadius).toBeCloseTo(1, 8);
    expect(r.stable).toBe(true);
  });
});

describe('constant generators reproduce e^{T·spec(A)}', () => {
  it('diagonal decay A = diag(−0.5, −2) → multipliers e^{−0.5T}, e^{−2T}', () => {
    const T = 1.3;
    const r = floquetLinearSpectrum(
      () => [
        [-0.5, 0],
        [0, -2]
      ],
      T,
      2
    );
    const target: Complex[] = [
      { re: Math.exp(-0.5 * T), im: 0 },
      { re: Math.exp(-2 * T), im: 0 }
    ];
    expect(spectraMaxDistance(r.multipliers, target)).toBeLessThan(1e-8);
    expect(r.stable).toBe(true); // both inside the unit circle
  });

  it('4×4 constant generator: eig(M) = exp(T·eig(A))', () => {
    const T = 0.6;
    const a = [
      [-0.2, 0.5, 0.1, 0.0],
      [-0.5, -0.2, 0.0, 0.3],
      [0.0, 0.0, -0.1, 0.7],
      [0.1, 0.0, -0.7, -0.1]
    ];
    const r = floquetLinearSpectrum(() => a, T, 4, { steps: 6000 });
    const specA = eigenvaluesGeneral(a);
    const target: Complex[] = specA.map((l) => {
      // exp(T·λ) = e^{Tλ_re}(cos Tλ_im + i sin Tλ_im)
      const mag = Math.exp(T * l.re);
      return { re: mag * Math.cos(T * l.im), im: mag * Math.sin(T * l.im) };
    });
    expect(spectraMaxDistance(r.multipliers, target)).toBeLessThan(1e-6);
  });
});

describe("Mathieu equation x'' + (δ + ε cos t) x = 0 (Hill / parametric resonance)", () => {
  const period = 2 * Math.PI; // cos t has period 2π
  const mathieu = (delta: number, eps: number) => (t: number) => [
    [0, 1],
    [-(delta + eps * Math.cos(t)), 0]
  ];

  it('is Hamiltonian: det M = 1 and the multipliers are a reciprocal pair', () => {
    const r = floquetLinearSpectrum(mathieu(0.6, 0.4), period, 2, { steps: 6000 });
    expect(r.determinant).toBeCloseTo(1, 7); // tr A ≡ 0 ⇒ Liouville det = 1
    expect(Math.abs(r.diagnostics.unitDeterminantDrift)).toBeLessThan(1e-7);
    const [r0, r1] = r.multipliers;
    const prodRe = r0!.re * r1!.re - r0!.im * r1!.im;
    const prodIm = r0!.re * r1!.im + r0!.im * r1!.re;
    expect(prodRe).toBeCloseTo(1, 6); // ρ₁ ρ₂ = det M = 1
    expect(prodIm).toBeCloseTo(0, 6);
  });

  it('reduces to the harmonic oscillator at ε = 0 (multipliers e^{±i√δ·T})', () => {
    const delta = 0.16; // √δ = 0.4 ⇒ √δ·T = 0.8π < π (unfolded)
    const r = floquetLinearSpectrum(mathieu(delta, 0), period, 2, { steps: 6000 });
    const w = Math.sqrt(delta);
    const target: Complex[] = [
      { re: Math.cos(w * period), im: Math.sin(w * period) },
      { re: Math.cos(w * period), im: -Math.sin(w * period) }
    ];
    expect(spectraMaxDistance(r.multipliers, target)).toBeLessThan(1e-7);
  });

  it('is unstable inside the principal parametric-resonance tongue (δ≈¼, ε>0)', () => {
    const r = floquetLinearSpectrum(mathieu(0.25, 0.3), period, 2, { steps: 6000 });
    expect(r.spectralRadius).toBeGreaterThan(1.05); // a multiplier left the unit circle
    expect(r.stable).toBe(false);
    expect(r.determinant).toBeCloseTo(1, 6); // still Hamiltonian
  });

  it('is stable between the tongues (δ = 0.6, small ε)', () => {
    // tongues sit at δ = (k/2)² = 0.25, 1.0, 2.25, …; δ = 0.6 is safely between them.
    const r = floquetLinearSpectrum(mathieu(0.6, 0.1), period, 2, { steps: 6000 });
    expect(r.spectralRadius).toBeLessThan(1 + 1e-4); // multipliers on the unit circle
    expect(r.stable).toBe(true);
  });
});

describe('guards', () => {
  it('rejects bad arguments', () => {
    expect(() => monodromyLinear(() => [[0]], 0, 1)).toThrow(/period/);
    expect(() => monodromyLinear(() => [[0]], 1, 0)).toThrow(/dimension/);
    expect(() => monodromyLinear(() => [[0]], 1, 1, 0)).toThrow(/steps/);
  });
});
