import type { Derivative, Jacobian } from '../physics/types';
import type { PendulumParameters } from '../types/domain';
import { rk4Step } from '../physics/integrators';
import { rhsDouble, jacobianDouble } from '../physics/double';
import { makeVariationalRhs } from './variational';

/**
 * Finite-Time Lyapunov Exponents (FTLE) and the flow-map gradient.
 *
 * Unlike the (asymptotic) Lyapunov spectrum, the FTLE is resolved in *both*
 * initial condition and a *finite* horizon T. It is the largest exponential
 * stretching rate of the flow map F_T over [0,T]:
 *
 *     σ_T(x₀) = (1/T) ln ‖∇F_T(x₀)‖₂ = (1/T) ln σ_max(M),
 *
 * where M = ∂x(T)/∂x(0) is the flow-map gradient (the state-transition /
 * monodromy matrix) and σ_max is its largest singular value, i.e. the square
 * root of the largest eigenvalue of the right Cauchy–Green tensor MᵀM. M is
 * obtained exactly by propagating the variational equation Ṁ = J(x(t)) M with
 * M(0) = I alongside the trajectory — reusing the same analytic Jacobian as the
 * Lyapunov spectrum, so there is no finite-difference error floor.
 *
 * Ridges of the FTLE field are Lagrangian Coherent Structures (LCS): the
 * transport barriers that organise the chaotic mixing of the double pendulum.
 */

export interface FtleOptions {
  /** Integration step. Default 0.01. */
  dt?: number;
}

export interface FlowMapGradient {
  /** ∂x(T)/∂x(0), n×n row-major (column j is the evolved j-th basis perturbation). */
  stm: Float64Array;
  n: number;
}

/**
 * Flow-map gradient M = ∂x(T)/∂x(0) obtained by propagating the variational
 * equation from an identity seed (no renormalization — valid for the modest T
 * used by FTLE, where the growth stays within float64 range).
 */
export function flowMapGradient(
  state0: ArrayLike<number>,
  rhs: Derivative,
  totalTime: number,
  options: FtleOptions = {},
  jacobian?: Jacobian
): FlowMapGradient {
  const n = state0.length;
  const dt = options.dt ?? 0.01;
  const steps = Math.max(1, Math.round(totalTime / dt));
  const varRhs = makeVariationalRhs(rhs, n, n, jacobian);

  const aug = new Float64Array(n * (n + 1));
  const augOut = new Float64Array(aug.length);
  for (let i = 0; i < n; i += 1) aug[i] = Number(state0[i] ?? 0);
  // Identity seed: deviation j = e_j, so the evolved frame is exactly M.
  for (let j = 0; j < n; j += 1) aug[n + j * n + j] = 1;

  for (let s = 0; s < steps; s += 1) {
    rk4Step(aug, dt, varRhs, augOut);
    aug.set(augOut);
  }

  const stm = new Float64Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) stm[i * n + j] = aug[n + j * n + i] ?? 0;
  }
  return { stm, n };
}

/**
 * Largest singular value of an n×n row-major matrix via power iteration on MᵀM
 * (symmetric PSD, so power iteration converges to its largest eigenvalue; the
 * singular value is its square root).
 */
export function largestSingularValue(M: Float64Array, n: number, iterations = 200): number {
  let v = new Float64Array(n);
  for (let i = 0; i < n; i += 1) v[i] = 1 / Math.sqrt(n);
  const mv = new Float64Array(n);
  let lambda = 0;
  for (let it = 0; it < iterations; it += 1) {
    // mv = M v
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      for (let j = 0; j < n; j += 1) s += (M[i * n + j] ?? 0) * (v[j] ?? 0);
      mv[i] = s;
    }
    // u = Mᵀ mv  (= MᵀM v)
    const u = new Float64Array(n);
    for (let j = 0; j < n; j += 1) {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += (M[i * n + j] ?? 0) * (mv[i] ?? 0);
      u[j] = s;
    }
    let norm = 0;
    for (let i = 0; i < n; i += 1) norm += (u[i] ?? 0) ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) return 0;
    for (let i = 0; i < n; i += 1) u[i] = (u[i] ?? 0) / norm;
    lambda = norm; // |MᵀM v| → λ_max(MᵀM) as v → top eigenvector
    v = u;
  }
  return Math.sqrt(Math.max(0, lambda));
}

/** Determinant of an n×n row-major matrix via Gaussian elimination with partial pivoting. */
export function determinant(M: Float64Array, n: number): number {
  const a = Float64Array.from(M);
  let det = 1;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(a[col * n + col] ?? 0);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(a[r * n + col] ?? 0);
      if (val > best) {
        best = val;
        pivot = r;
      }
    }
    if (best === 0) return 0;
    if (pivot !== col) {
      for (let c = 0; c < n; c += 1) {
        const tmp = a[col * n + c] ?? 0;
        a[col * n + c] = a[pivot * n + c] ?? 0;
        a[pivot * n + c] = tmp;
      }
      det = -det;
    }
    const diag = a[col * n + col] ?? 0;
    det *= diag;
    for (let r = col + 1; r < n; r += 1) {
      const factor = (a[r * n + col] ?? 0) / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c += 1) a[r * n + c] = (a[r * n + c] ?? 0) - factor * (a[col * n + c] ?? 0);
    }
  }
  return det;
}

/** Finite-time Lyapunov exponent σ_T(x₀) = (1/T) ln σ_max(∂x(T)/∂x(0)). */
export function finiteTimeLyapunov(
  state0: ArrayLike<number>,
  rhs: Derivative,
  totalTime: number,
  options: FtleOptions = {},
  jacobian?: Jacobian
): number {
  const { stm, n } = flowMapGradient(state0, rhs, totalTime, options, jacobian);
  const sigma = largestSingularValue(stm, n);
  return totalTime > 0 && sigma > 0 ? Math.log(sigma) / totalTime : 0;
}

export interface FtleFieldOptions {
  /** Grid cells per axis (the field is n×n). Default 60. */
  n?: number;
  /** Inclusive angle range [lo, hi] for both θ₁ and θ₂. Default [-3, 3]. */
  range?: [number, number];
  /** Finite horizon T. Default 3. */
  totalTime?: number;
  dt?: number;
}

export interface FtleField {
  /** Row-major FTLE values, length width*height. */
  values: Float64Array;
  width: number;
  height: number;
  min: number;
  max: number;
}

/**
 * FTLE field of the double pendulum over a grid of initial angles (θ₁, θ₂),
 * both released from rest. Ridges of this field are the Lagrangian Coherent
 * Structures of the (θ₁, θ₂) section.
 */
export function doublePendulumFtleField(params: PendulumParameters, options: FtleFieldOptions = {}): FtleField {
  const n = options.n ?? 60;
  const [lo, hi] = options.range ?? [-3, 3];
  const totalTime = options.totalTime ?? 3;
  const dt = options.dt ?? 0.01;
  const rhs: Derivative = (s, o) => {
    rhsDouble(s, params, 0, o);
  };
  const jacobian: Jacobian = (s, j) => {
    jacobianDouble(s, params, 0, j);
  };

  const values = new Float64Array(n * n);
  let min = Infinity;
  let max = -Infinity;
  const state0 = new Float64Array(4);
  for (let iy = 0; iy < n; iy += 1) {
    const theta2 = lo + ((hi - lo) * iy) / (n - 1);
    for (let ix = 0; ix < n; ix += 1) {
      const theta1 = lo + ((hi - lo) * ix) / (n - 1);
      state0[0] = theta1;
      state0[1] = theta2;
      state0[2] = 0;
      state0[3] = 0;
      const f = finiteTimeLyapunov(state0, rhs, totalTime, { dt }, jacobian);
      values[iy * n + ix] = f;
      if (f < min) min = f;
      if (f > max) max = f;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return { values, width: n, height: n, min, max };
}
