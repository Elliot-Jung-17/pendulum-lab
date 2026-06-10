import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';

/**
 * Generalized planar chain ("N-pendulum"). The double and triple pendulums are
 * the N = 2 and N = 3 special cases of these equations; `tests/n-pendulum.test.ts`
 * checks that this RHS reproduces `rhsDouble` and `rhsTriple` to machine epsilon.
 *
 * State layout: [theta_0 .. theta_{N-1}, omega_0 .. omega_{N-1}].
 * Angles are measured from the downward vertical.
 */
export interface ChainParameters {
  /** Bob masses, length N. */
  masses: readonly number[];
  /** Link lengths, length N. */
  lengths: readonly number[];
  g: number;
}

const DET_THRESHOLD = 1e-14;

export function chainLength(parameters: ChainParameters): number {
  return Math.min(parameters.masses.length, parameters.lengths.length);
}

/**
 * Solve the linear system A x = b in place using Gaussian elimination with
 * partial pivoting. `a` is row-major n*n, `b` length n; the solution is written
 * back into `b`. Returns false if the matrix is numerically singular.
 */
function solveLinear(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(a[r * n + c] ?? 0) > Math.abs(a[pivot * n + c] ?? 0)) pivot = r;
    }
    if (pivot !== c) {
      for (let k = 0; k < n; k += 1) {
        const tmp = a[c * n + k] ?? 0;
        a[c * n + k] = a[pivot * n + k] ?? 0;
        a[pivot * n + k] = tmp;
      }
      const tb = b[c] ?? 0;
      b[c] = b[pivot] ?? 0;
      b[pivot] = tb;
    }
    const diag = a[c * n + c] ?? 0;
    if (Math.abs(diag) < DET_THRESHOLD) return false;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const factor = (a[r * n + c] ?? 0) / diag;
      if (factor === 0) continue;
      for (let k = c; k < n; k += 1) a[r * n + k] = (a[r * n + k] ?? 0) - factor * (a[c * n + k] ?? 0);
      b[r] = (b[r] ?? 0) - factor * (b[c] ?? 0);
    }
  }
  for (let i = 0; i < n; i += 1) b[i] = (b[i] ?? 0) / (a[i * n + i] ?? 1);
  return true;
}

// Suffix mass sums S_j = sum_{i >= j} m_i, precomputed for the coupling terms.
function suffixMass(masses: readonly number[], n: number): Float64Array {
  const s = new Float64Array(n);
  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += masses[j] ?? 0;
    s[j] = acc;
  }
  return s;
}

/**
 * Equations of motion for the N-link chain pendulum.
 *
 *   M_jk = S_{max(j,k)} * l_j * l_k * cos(theta_j - theta_k)
 *   f_j  = -sum_k C_jk * omega_k^2 - g * l_j * sin(theta_j) * S_j - gamma * omega_j
 *   C_jk = S_{max(j,k)} * l_j * l_k * sin(theta_j - theta_k)
 *
 * Solving M * alpha = f yields the angular accelerations.
 */
export function rhsChain(state: ArrayLike<number>, parameters: ChainParameters, gamma: number, out: StateVector): StateVector {
  const n = chainLength(parameters);
  const { masses, lengths, g } = parameters;
  const s = suffixMass(masses, n);

  const matrix = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    const tj = Number(state[j] ?? 0);
    const wj = Number(state[n + j] ?? 0);
    const lj = lengths[j] ?? 0;
    out[j] = wj; // d(theta_j)/dt = omega_j
    let coupling = 0;
    for (let k = 0; k < n; k += 1) {
      const tk = Number(state[k] ?? 0);
      const wk = Number(state[n + k] ?? 0);
      const lk = lengths[k] ?? 0;
      const sjk = s[Math.max(j, k)] ?? 0;
      const delta = tj - tk;
      matrix[j * n + k] = sjk * lj * lk * Math.cos(delta);
      coupling += sjk * lj * lk * Math.sin(delta) * wk * wk;
    }
    rhs[j] = -coupling - g * lj * Math.sin(tj) * (s[j] ?? 0) - gamma * wj;
  }

  const ok = solveLinear(matrix, rhs, n);
  for (let j = 0; j < n; j += 1) out[n + j] = ok ? (rhs[j] ?? 0) : 0;
  return out;
}

export function energyChain(state: ArrayLike<number>, parameters: ChainParameters): EnergyBreakdown {
  const n = chainLength(parameters);
  const { masses, lengths, g } = parameters;
  let vx = 0;
  let vy = 0;
  let y = 0;
  let KE = 0;
  let PE = 0;
  for (let i = 0; i < n; i += 1) {
    const ti = Number(state[i] ?? 0);
    const wi = Number(state[n + i] ?? 0);
    const li = lengths[i] ?? 0;
    const mi = masses[i] ?? 0;
    // Cumulative joint position and velocity along the chain.
    vx += li * Math.cos(ti) * wi;
    vy += li * Math.sin(ti) * wi;
    y -= li * Math.cos(ti);
    KE += 0.5 * mi * (vx * vx + vy * vy);
    PE += g * mi * y;
  }
  return { total: KE + PE, KE, PE };
}
