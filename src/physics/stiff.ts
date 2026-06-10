import type { Derivative, StateVector, StepOptions } from './types';

/**
 * TR-BDF2: a one-step, L-stable, second-order implicit solver for stiff systems.
 * It composes a trapezoidal substep to t + gamma*h with a BDF2 substep to t + h
 * (gamma = 2 - sqrt(2)). Being self-starting and history-free, it fits the
 * memoryless single-step contract used by `step()` (a classical multistep BDF
 * cannot, because it needs past points carried across calls).
 *
 * Each implicit stage is solved by Newton iteration with a finite-difference
 * Jacobian, so it converges on genuinely stiff problems where the fixed-point
 * iteration used by the explicit-friendly methods would diverge.
 */

const GAMMA = 2 - Math.SQRT2; // ~0.5858
const C1 = 1 / (GAMMA * (2 - GAMMA)); // weight on the trapezoidal-stage result
const C0 = (1 - GAMMA) ** 2 / (GAMMA * (2 - GAMMA)); // weight on y_n
const CF = (1 - GAMMA) / (2 - GAMMA); // weight on h * f(y_{n+1})

/** In-place Gaussian elimination with partial pivoting; solves A x = b into b. */
function solveLinear(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(a[r * n + c] ?? 0) > Math.abs(a[pivot * n + c] ?? 0)) pivot = r;
    }
    if (pivot !== c) {
      for (let k = 0; k < n; k += 1) {
        const t = a[c * n + k] ?? 0;
        a[c * n + k] = a[pivot * n + k] ?? 0;
        a[pivot * n + k] = t;
      }
      const tb = b[c] ?? 0;
      b[c] = b[pivot] ?? 0;
      b[pivot] = tb;
    }
    const diag = a[c * n + c] ?? 0;
    if (Math.abs(diag) < 1e-300) return false;
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

/** Forward-difference Jacobian of `rhs` at `y`, written row-major into `jac`. */
function numericalJacobian(rhs: Derivative, y: StateVector, fy: StateVector, jac: Float64Array, scratch: StateVector, fPert: StateVector): void {
  const n = y.length;
  for (let j = 0; j < n; j += 1) {
    const yj = Number(y[j] ?? 0);
    const eps = 1e-7 * Math.max(1, Math.abs(yj));
    scratch.set(y);
    scratch[j] = yj + eps;
    rhs(scratch, fPert);
    for (let i = 0; i < n; i += 1) jac[i * n + j] = (Number(fPert[i] ?? 0) - Number(fy[i] ?? 0)) / eps;
  }
}

/**
 * Solve one implicit stage of the form  Y = base + coef*h*f(Y)  by Newton's
 * method. The residual is R(Y) = Y - base - coef*h*f(Y) and the Newton matrix is
 * (I - coef*h*J). Writes the solution into `Y` and returns the final residual.
 */
function newtonStage(
  rhs: Derivative,
  base: StateVector,
  coef: number,
  h: number,
  Y: StateVector,
  tolerance: number,
  scratch: { jac: Float64Array; f: StateVector; tmp: StateVector; fPert: StateVector; residual: StateVector }
): number {
  const n = Y.length;
  const { jac, f, tmp, fPert, residual } = scratch;
  let resNorm = Infinity;
  for (let iter = 0; iter < 25; iter += 1) {
    rhs(Y, f);
    resNorm = 0;
    for (let i = 0; i < n; i += 1) {
      residual[i] = Number(Y[i] ?? 0) - Number(base[i] ?? 0) - coef * h * Number(f[i] ?? 0);
      resNorm = Math.max(resNorm, Math.abs(Number(residual[i] ?? 0)));
    }
    if (resNorm < tolerance) break;
    numericalJacobian(rhs, Y, f, jac, tmp, fPert);
    // Newton matrix M = I - coef*h*J.
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        jac[i * n + j] = (i === j ? 1 : 0) - coef * h * Number(jac[i * n + j] ?? 0);
      }
    }
    const rhsVec = new Float64Array(n);
    for (let i = 0; i < n; i += 1) rhsVec[i] = -Number(residual[i] ?? 0);
    if (!solveLinear(jac, rhsVec, n)) break;
    for (let i = 0; i < n; i += 1) Y[i] = Number(Y[i] ?? 0) + Number(rhsVec[i] ?? 0);
  }
  return resNorm;
}

export function trBdf2Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  const n = state.length;
  const tolerance = options.tolerance ?? 1e-10;
  const scratch = {
    jac: new Float64Array(n * n),
    f: new Float64Array(n),
    tmp: new Float64Array(n),
    fPert: new Float64Array(n),
    residual: new Float64Array(n)
  };

  // Trapezoidal stage: Y1 = (y_n + (gamma*h/2) f_n) + (gamma*h/2) f(Y1).
  const fn = new Float64Array(n);
  rhs(state, fn);
  const trapBase = new Float64Array(n);
  for (let i = 0; i < n; i += 1) trapBase[i] = Number(state[i] ?? 0) + (GAMMA * dt / 2) * Number(fn[i] ?? 0);
  const Y1 = new Float64Array(state);
  const res1 = newtonStage(rhs, trapBase, GAMMA / 2, dt, Y1, tolerance, scratch);

  // BDF2 stage: Y2 = (C1*Y1 - C0*y_n) + CF*h*f(Y2).
  const bdfBase = new Float64Array(n);
  for (let i = 0; i < n; i += 1) bdfBase[i] = C1 * Number(Y1[i] ?? 0) - C0 * Number(state[i] ?? 0);
  const Y2 = new Float64Array(Y1);
  const res2 = newtonStage(rhs, bdfBase, CF, dt, Y2, tolerance, scratch);

  out.set(Y2);
  if (options.previousError) options.previousError.value = Math.max(res1, res2);
  return out;
}
