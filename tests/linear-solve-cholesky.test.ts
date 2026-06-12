import { describe, expect, test } from 'vitest';
import { solveCholeskyInPlace, solveLinearInPlace } from '../src/physics/linearSolve';
import { chainMassMatrix, createChainWorkspace, rhsChain, type ChainParameters } from '../src/physics/nPendulum';
import { rhsDouble } from '../src/physics/double';
import { dampingConventionFor } from '../src/physics/systemSpec';
import { mulberry32 } from '../src/chaos/variational';

function randomSpd(n: number, rng: () => number): Float64Array {
  // A = B·Bᵀ + n·I is SPD for any B; the +n·I keeps it well-conditioned.
  const b = Float64Array.from({ length: n * n }, () => rng() * 2 - 1);
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let s = i === j ? n : 0;
      for (let k = 0; k < n; k += 1) s += (b[i * n + k] ?? 0) * (b[j * n + k] ?? 0);
      a[i * n + j] = s;
    }
  }
  return a;
}

describe('solveCholeskyInPlace', () => {
  test('matches the pivoted general solver on random SPD systems', () => {
    const rng = mulberry32(0xc401e5);
    for (const n of [1, 2, 3, 5, 8]) {
      const a = randomSpd(n, rng);
      const rhs = Float64Array.from({ length: n }, () => rng() * 4 - 2);
      const bChol = new Float64Array(rhs);
      const bGe = new Float64Array(rhs);
      const aGe = new Float64Array(a);
      const factor = new Float64Array(n * n);

      const chol = solveCholeskyInPlace(a, bChol, n, factor);
      const ge = solveLinearInPlace(aGe, bGe, n);
      expect(chol.ok).toBe(true);
      expect(ge.ok).toBe(true);
      for (let i = 0; i < n; i += 1) {
        expect(Math.abs((bChol[i] ?? 0) - (bGe[i] ?? 0))).toBeLessThan(1e-12);
      }
    }
  });

  test('produces a small residual ||Ax - b|| with diagnostics enabled', () => {
    const rng = mulberry32(0xfacade);
    const n = 6;
    const a = randomSpd(n, rng);
    const b = Float64Array.from({ length: n }, () => rng() * 2 - 1);
    const factor = new Float64Array(n * n);
    const result = solveCholeskyInPlace(a, b, n, factor, { diagnostics: true });
    expect(result.ok).toBe(true);
    expect(result.relativeResidual ?? 1).toBeLessThan(1e-13);
  });

  test('rejects an indefinite matrix without touching the inputs', () => {
    // diag(1, -1) is symmetric but not positive definite.
    const a = Float64Array.from([1, 0, 0, -1]);
    const aCopy = new Float64Array(a);
    const b = Float64Array.from([3, 4]);
    const bCopy = new Float64Array(b);
    const factor = new Float64Array(4);
    const result = solveCholeskyInPlace(a, b, 2, factor);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-positive-definite');
    expect(Array.from(a)).toEqual(Array.from(aCopy));
    expect(Array.from(b)).toEqual(Array.from(bCopy));
  });

  test('rejects non-finite input', () => {
    const a = Float64Array.from([1, 0, 0, NaN]);
    const b = Float64Array.from([1, 1]);
    const result = solveCholeskyInPlace(a, b, 2, new Float64Array(4));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('non-finite-input');
  });

  test('solves the chain mass matrix and agrees with the GE path', () => {
    const rng = mulberry32(0xbeef);
    const params: ChainParameters = { masses: [1.2, 0.7, 1.5, 0.9], lengths: [0.8, 1.1, 0.6, 1.3], g: 9.81 };
    const n = 4;
    for (let trial = 0; trial < 20; trial += 1) {
      const state = Float64Array.from({ length: 2 * n }, () => rng() * 4 - 2);
      const m = chainMassMatrix(state, params);
      const rhs = Float64Array.from({ length: n }, () => rng() * 2 - 1);
      const bChol = new Float64Array(rhs);
      const bGe = new Float64Array(rhs);
      const mGe = new Float64Array(m);
      const chol = solveCholeskyInPlace(m, bChol, n, new Float64Array(n * n));
      expect(chol.ok).toBe(true);
      expect(solveLinearInPlace(mGe, bGe, n).ok).toBe(true);
      for (let i = 0; i < n; i += 1) {
        expect(Math.abs((bChol[i] ?? 0) - (bGe[i] ?? 0))).toBeLessThan(1e-10);
      }
    }
  });
});

describe('rhsChain with the Cholesky fast path', () => {
  test('still reproduces the closed-form double pendulum', () => {
    const params: ChainParameters = { masses: [1.1, 0.8], lengths: [1.0, 0.7], g: 9.81 };
    const rng = mulberry32(0x5eed);
    for (let trial = 0; trial < 25; trial += 1) {
      const state = Float64Array.from({ length: 4 }, () => rng() * 6 - 3);
      const fromChain = rhsChain(state, params, 0.05, new Float64Array(4), createChainWorkspace(2));
      const fromDouble = rhsDouble(state, { m1: 1.1, m2: 0.8, l1: 1.0, l2: 0.7, g: 9.81 }, 0.05, new Float64Array(4));
      for (let i = 0; i < 4; i += 1) {
        expect(Math.abs((fromChain[i] ?? 0) - (fromDouble[i] ?? 0))).toBeLessThan(1e-12);
      }
    }
  });
});

describe('dampingConventionFor', () => {
  test('classifies every system kind', () => {
    expect(dampingConventionFor('double')).toBe('force-level');
    expect(dampingConventionFor('triple')).toBe('force-level');
    expect(dampingConventionFor('chain')).toBe('force-level');
    expect(dampingConventionFor('double-string')).toBe('force-level');
    expect(dampingConventionFor('driven')).toBe('rate-level');
    expect(dampingConventionFor('spherical-chain')).toBe('rate-level');
    expect(dampingConventionFor('spring')).toBe('none');
  });
});
