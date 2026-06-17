import { describe, expect, it } from 'vitest';
import {
  characteristicPolynomial,
  complexAbs,
  complexLog,
  matrixEigenvalues,
  polynomialRoots,
  type Complex
} from '../src/research/complexEig';

const c = (re: number, im = 0): Complex => ({ re, im });

/** True iff `recovered` matches `expected` as a multiset within `tol`. */
function matchesSet(recovered: Complex[], expected: Complex[], tol: number): boolean {
  if (recovered.length !== expected.length) return false;
  const used = new Array<boolean>(recovered.length).fill(false);
  for (const e of expected) {
    let found = -1;
    for (let i = 0; i < recovered.length; i += 1) {
      if (!used[i] && complexAbs({ re: recovered[i]!.re - e.re, im: recovered[i]!.im - e.im }) < tol) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    used[found] = true;
  }
  return true;
}

describe('characteristic polynomial (Faddeev–LeVerrier)', () => {
  it('reproduces λ² − tr·λ + det for a 2×2', () => {
    // A = [[1,2],[3,4]]: trace 5, det -2 ⇒ λ² − 5λ − 2.
    expect(characteristicPolynomial([1, 2, 3, 4], 2)).toEqual([-2, -5, 1]);
  });

  it('is monic with the right degree for a 3×3', () => {
    const coeffs = characteristicPolynomial([2, 0, 0, 0, -3, 0, 0, 0, 5], 3);
    expect(coeffs).toHaveLength(4);
    expect(coeffs[3]).toBe(1);
    // p(λ) = (λ−2)(λ+3)(λ−5) = λ³ − 4λ² − 11λ + 30.
    expect(coeffs[2]).toBeCloseTo(-4, 10);
    expect(coeffs[1]).toBeCloseTo(-11, 10);
    expect(coeffs[0]).toBeCloseTo(30, 10);
  });
});

describe('polynomial roots (Durand–Kerner)', () => {
  it('finds the real roots of (z−1)(z−2)(z−3)', () => {
    // z³ − 6z² + 11z − 6 ⇒ coeffs [-6, 11, -6, 1].
    const roots = polynomialRoots([-6, 11, -6, 1]);
    expect(matchesSet(roots, [c(1), c(2), c(3)], 1e-9)).toBe(true);
  });

  it('finds a complex-conjugate pair: z² + 1 ⇒ ±i', () => {
    const roots = polynomialRoots([1, 0, 1]);
    expect(matchesSet(roots, [c(0, 1), c(0, -1)], 1e-12)).toBe(true);
  });
});

describe('matrixEigenvalues', () => {
  it('n=1 returns the scalar', () => {
    expect(matrixEigenvalues([7], 1)).toEqual([c(7)]);
  });

  it('n=2 uses the closed form (real and complex)', () => {
    expect(matchesSet(matrixEigenvalues([2, 0, 0, 5], 2), [c(2), c(5)], 1e-12)).toBe(true);
    // [[0.5,-2],[2,0.5]] ⇒ 0.5 ± 2i.
    expect(matchesSet(matrixEigenvalues([0.5, -2, 2, 0.5], 2), [c(0.5, 2), c(0.5, -2)], 1e-12)).toBe(true);
  });

  it('recovers a diagonal / triangular spectrum exactly', () => {
    expect(matchesSet(matrixEigenvalues([2, 0, 0, 0, -3, 0, 0, 0, 5], 3), [c(2), c(-3), c(5)], 1e-9)).toBe(true);
    // Upper-triangular eigenvalues are the diagonal.
    expect(matchesSet(matrixEigenvalues([1, 2, 3, 0, 4, 5, 0, 0, 6], 3), [c(1), c(4), c(6)], 1e-9)).toBe(true);
  });

  it('recovers two complex-conjugate pairs from a 4×4 block matrix', () => {
    // block-diag rotation blocks ⇒ ±i and −0.1 ± 3i.
    const a = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, -0.1, -3, 0, 0, 3, -0.1];
    expect(matchesSet(matrixEigenvalues(a, 4), [c(0, 1), c(0, -1), c(-0.1, 3), c(-0.1, -3)], 1e-9)).toBe(true);
  });

  it('satisfies the trace/determinant invariants and the characteristic residual on a random 4×4', () => {
    const a = [0.3, 1.2, -0.7, 0.4, -1.1, 0.6, 0.2, 0.9, 0.5, -0.3, -0.8, 1.3, 0.1, 0.7, -0.4, 0.2];
    const n = 4;
    const ev = matrixEigenvalues(a, n);
    let trace = 0;
    for (let i = 0; i < n; i += 1) trace += a[i * n + i]!;
    const sumRe = ev.reduce((s, z) => s + z.re, 0);
    const sumIm = ev.reduce((s, z) => s + z.im, 0);
    expect(sumRe).toBeCloseTo(trace, 8);
    expect(sumIm).toBeCloseTo(0, 8);
    // Πλ = (−1)ⁿ c₀ (monic). For n=4: Πλ = c₀.
    const coeffs = characteristicPolynomial(a, n);
    let prodRe = 1;
    let prodIm = 0;
    for (const z of ev) {
      const nr = prodRe * z.re - prodIm * z.im;
      const ni = prodRe * z.im + prodIm * z.re;
      prodRe = nr;
      prodIm = ni;
    }
    expect(prodRe).toBeCloseTo(coeffs[0]!, 6);
    expect(prodIm).toBeCloseTo(0, 6);
    // Characteristic residual |p(λ_i)| ≈ 0.
    const residual = (z: Complex): number => {
      let re = coeffs[n]!;
      let im = 0;
      for (let k = n - 1; k >= 0; k -= 1) {
        const nr = re * z.re - im * z.im + coeffs[k]!;
        const ni = re * z.im + im * z.re;
        re = nr;
        im = ni;
      }
      return Math.hypot(re, im);
    };
    expect(Math.max(...ev.map(residual))).toBeLessThan(1e-10);
  });
});

describe('complexLog', () => {
  it('is the principal branch ln|z| + i·arg z', () => {
    expect(complexLog(c(Math.E, 0)).re).toBeCloseTo(1, 12);
    const z = complexLog(c(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)));
    expect(z.re).toBeCloseTo(0, 12);
    expect(z.im).toBeCloseTo(Math.PI / 3, 12);
  });
});
