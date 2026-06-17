import { describe, expect, it } from 'vitest';
import { restartedLanczos, type SymmetricOperator } from '../src/research/lanczos';
import { jacobiEigenSymmetric } from '../src/research/svd';

/** 1-D discrete Dirichlet Laplacian on a path of n nodes: (Ax)_i = 2x_i − x_{i−1} − x_{i+1}. */
function laplacianOperator(n: number): SymmetricOperator {
  return (x) => {
    const out = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      out[i] = 2 * (x[i] ?? 0) - (i > 0 ? (x[i - 1] ?? 0) : 0) - (i < n - 1 ? (x[i + 1] ?? 0) : 0);
    }
    return out;
  };
}

/** Closed-form Laplacian eigenvalues λ_j = 2 − 2cos(jπ/(n+1)), j = 1..n. */
function laplacianEigenvalue(j: number, n: number): number {
  return 2 - 2 * Math.cos((j * Math.PI) / (n + 1));
}

function residualNorm(apply: SymmetricOperator, value: number, vector: number[]): number {
  const av = apply(vector);
  let s = 0;
  for (let i = 0; i < vector.length; i += 1) s += ((av[i] ?? 0) - value * (vector[i] ?? 0)) ** 2;
  return Math.sqrt(s);
}

describe('restarted Lanczos — closed-form Laplacian spectrum', () => {
  const n = 200;
  const apply = laplacianOperator(n);

  it('recovers the largest algebraic eigenvalues', () => {
    const result = restartedLanczos(apply, { dimension: n, numEigenvalues: 4, which: 'LA', tolerance: 1e-9 });
    expect(result.converged).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      const expected = laplacianEigenvalue(n - i, n); // j = n, n−1, n−2, n−3
      expect(result.eigenpairs[i]!.value).toBeCloseTo(expected, 7);
      expect(result.eigenpairs[i]!.residual).toBeLessThan(1e-9);
      expect(residualNorm(apply, result.eigenpairs[i]!.value, result.eigenpairs[i]!.vector)).toBeLessThan(1e-7);
    }
  });

  it('recovers the smallest algebraic eigenvalues', () => {
    const result = restartedLanczos(apply, { dimension: n, numEigenvalues: 4, which: 'SA', tolerance: 1e-9 });
    expect(result.converged).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      const expected = laplacianEigenvalue(i + 1, n); // j = 1, 2, 3, 4
      expect(result.eigenpairs[i]!.value).toBeCloseTo(expected, 7);
    }
    // Smallest eigenvalue of the Laplacian is positive but tiny.
    expect(result.eigenpairs[0]!.value).toBeGreaterThan(0);
    expect(result.eigenpairs[0]!.value).toBeLessThan(result.eigenpairs[3]!.value);
  });
});

describe('restarted Lanczos — diagonal operator', () => {
  it('targets the largest-magnitude eigenvalues', () => {
    const n = 120;
    const diag = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) diag[i] = Math.sin(i) * 5 - (i === 7 ? 20 : 0); // a big negative outlier at i=7
    const apply: SymmetricOperator = (x) => x.map((xi, i) => (diag[i] ?? 0) * (xi ?? 0));
    const result = restartedLanczos(apply, { dimension: n, numEigenvalues: 3, which: 'LM', tolerance: 1e-10 });
    expect(result.converged).toBe(true);
    // The dominant-magnitude eigenvalue is the diag[7] ≈ −16.72 outlier.
    expect(result.eigenpairs[0]!.value).toBeCloseTo(diag[7]!, 6);
    expect(Math.abs(result.eigenpairs[0]!.value)).toBeGreaterThan(15);
  });
});

describe('restarted Lanczos — agreement with the dense symmetric solver', () => {
  it('matches jacobiEigenSymmetric on a small dense matrix', () => {
    const n = 30;
    const a = new Array<number>(n * n).fill(0);
    for (let i = 0; i < n; i += 1) {
      for (let j = i; j < n; j += 1) {
        const value = Math.cos(0.5 * i + 0.3 * j) + (i === j ? i * 0.1 : 0);
        a[i * n + j] = value;
        a[j * n + i] = value;
      }
    }
    const apply: SymmetricOperator = (x) => {
      const out = new Array<number>(n).fill(0);
      for (let i = 0; i < n; i += 1) {
        let s = 0;
        for (let j = 0; j < n; j += 1) s += (a[i * n + j] ?? 0) * (x[j] ?? 0);
        out[i] = s;
      }
      return out;
    };
    const dense = jacobiEigenSymmetric(a, n).values; // descending
    const result = restartedLanczos(apply, { dimension: n, numEigenvalues: 5, which: 'LA', tolerance: 1e-10 });
    expect(result.converged).toBe(true);
    for (let i = 0; i < 5; i += 1) {
      expect(result.eigenpairs[i]!.value).toBeCloseTo(dense[i]!, 8);
      expect(residualNorm(apply, result.eigenpairs[i]!.value, result.eigenpairs[i]!.vector)).toBeLessThan(1e-8);
    }
  });
});
