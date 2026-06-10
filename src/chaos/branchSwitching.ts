import type { Derivative } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { rhsDriven, type DrivenParameters } from '../physics/driven';
import { eigenvalues2x2, monodromyMatrix, type FloquetMultiplier } from './floquet';

/**
 * Branch switching at a period-doubling bifurcation of the driven pendulum.
 *
 * When the period-1 orbit's real Floquet multiplier crosses −1 at A = A_PD, a
 * period-2 orbit branches off along the critical eigenvector. Natural
 * continuation of the period-1 branch sails straight past (the orbit persists,
 * just unstable); *following the new branch* requires switching maps: the
 * period-2 orbit is a fixed point of the **double-period stroboscopic map** P²,
 * found by Newton seeded a small step along the critical eigenvector of the
 * monodromy — the direction in which the new branch peels off.
 *
 * For the classic damped driven pendulum (γ = 0.5, ω = 2/3) this is the first
 * step of the Feigenbaum cascade: P1 → A ≈ 1.066 → P2 → … → chaos near 1.08.
 */

export interface PeriodNOrbitResult {
  /** Fixed point of Pⁿ (θ, ω) at drive phase φ = 0. */
  orbit: [number, number];
  /** All n cycle points under the single-period strobe P. */
  cycle: Array<[number, number]>;
  /** Multipliers of the n-period monodromy (eigenvalues of DPⁿ). */
  multipliers: FloquetMultiplier[];
  maxModulus: number;
  stable: boolean;
  /** Map multiplicity (n = 2 for the period-doubled orbit). */
  n: number;
  /** Single drive period T; the orbit's period is n·T. */
  drivePeriod: number;
  converged: boolean;
  residual: number;
  iterations: number;
}

export interface BranchSwitchOptions {
  dt?: number;
  tolerance?: number;
  maxIterations?: number;
  /** Eigenvector step sizes tried in order until the Newton leaves the old orbit. */
  seedSteps?: number[];
  /** Minimum (θ, ω) distance from the period-1 point for a switch to count. */
  minSeparation?: number;
}

export interface BranchSwitchResult {
  /** The period-doubled orbit (fixed point of P², 2-cycle of P). */
  doubled: PeriodNOrbitResult;
  /** Multiplier of the period-1 orbit nearest −1 (the one that crossed). */
  criticalMultiplier: FloquetMultiplier;
  /** Unit eigenvector along which the new branch was seeded. */
  eigenvector: [number, number];
  /** Seed step that produced the successful switch. */
  seedStep: number;
  /** (θ, ω) distance between the period-2 orbit and the period-1 point. */
  separation: number;
  switched: boolean;
}

/** Real eigenvector of a 2×2 row-major matrix for a (real) eigenvalue, normalised. */
export function realEigenvector2x2(M: ArrayLike<number>, lambda: number): [number, number] {
  const a = Number(M[0] ?? 0);
  const b = Number(M[1] ?? 0);
  const c = Number(M[2] ?? 0);
  const d = Number(M[3] ?? 0);
  // Rows of (M − λI) are orthogonal to v; take the larger row for conditioning.
  const r1: [number, number] = [a - lambda, b];
  const r2: [number, number] = [c, d - lambda];
  const n1 = Math.hypot(r1[0], r1[1]);
  const n2 = Math.hypot(r2[0], r2[1]);
  const row = n1 >= n2 ? r1 : r2;
  const norm = Math.max(n1, n2);
  if (norm < 1e-14) return [1, 0]; // M ≈ λI: any direction is an eigenvector
  const v: [number, number] = [-row[1] / norm, row[0] / norm];
  const vn = Math.hypot(v[0], v[1]);
  return [v[0] / vn, v[1] / vn];
}

/** n-fold strobe with an exact-period step (dt adjusted so steps·dt = T exactly). */
function strobeN(rhs: Derivative, theta: number, omega: number, drivePeriod: number, n: number, dt: number): Array<[number, number]> {
  const stepsPerPeriod = Math.max(1, Math.round(drivePeriod / dt));
  const dtEff = drivePeriod / stepsPerPeriod;
  const cur = new Float64Array([theta, omega, 0]);
  const nxt = new Float64Array(3);
  const points: Array<[number, number]> = [];
  for (let k = 0; k < n; k += 1) {
    for (let s = 0; s < stepsPerPeriod; s += 1) {
      rk4Step(cur, dtEff, rhs, nxt);
      cur.set(nxt);
    }
    points.push([cur[0] ?? 0, cur[1] ?? 0]);
  }
  return points;
}

/**
 * Fixed point of the n-fold stroboscopic map Pⁿ via 2-D Newton (the Jacobian is
 * the (θ, ω) block of the state-transition matrix over n·T), with the cycle
 * points and the n-period Floquet verdict. `n = 1` reproduces the period-1
 * solver; `n = 2` targets the period-doubled orbit.
 */
export function drivenPeriodicOrbitN(
  params: DrivenParameters,
  guess: [number, number],
  n: number,
  options: BranchSwitchOptions = {}
): PeriodNOrbitResult {
  const drivePeriod = (2 * Math.PI) / params.driveFrequency;
  const dt = options.dt ?? 0.005;
  const tol = options.tolerance ?? 1e-9;
  const maxIterations = options.maxIterations ?? 60;
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, params, o);
  };

  let theta = guess[0];
  let omega = guess[1];
  let residual = Infinity;
  let iterations = 0;
  let converged = false;

  for (let it = 0; it < maxIterations; it += 1) {
    iterations = it + 1;
    const end = strobeN(rhs, theta, omega, drivePeriod, n, dt)[n - 1]!;
    const f0 = end[0] - theta;
    const f1 = end[1] - omega;
    residual = Math.hypot(f0, f1);
    if (residual < tol) {
      converged = true;
      break;
    }
    const M = monodromyMatrix([theta, omega, 0], rhs, n * drivePeriod, { dt }, undefined, 2);
    const a = (M[0] ?? 0) - 1;
    const b = M[1] ?? 0;
    const c = M[2] ?? 0;
    const d = (M[3] ?? 0) - 1;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-14) break;
    theta += (-f0 * d + b * f1) / det;
    omega += (-a * f1 + c * f0) / det;
  }

  const M = monodromyMatrix([theta, omega, 0], rhs, n * drivePeriod, { dt }, undefined, 2);
  const multipliers = eigenvalues2x2(M);
  const maxModulus = Math.max(multipliers[0]!.modulus, multipliers[1]!.modulus);
  const cycle = strobeN(rhs, theta, omega, drivePeriod, n, dt);
  // The last cycle point is Pⁿ(x) ≈ x; report the fixed point itself first.
  cycle.pop();
  cycle.unshift([theta, omega]);

  return {
    orbit: [theta, omega],
    cycle,
    multipliers,
    maxModulus,
    stable: maxModulus <= 1 + 1e-6,
    n,
    drivePeriod,
    converged,
    residual,
    iterations
  };
}

/**
 * Switch from a period-1 orbit just past its period-doubling onto the
 * period-2 branch. `period1` must be the (possibly unstable) period-1 fixed
 * point at the *current* parameters, with a real multiplier ρ < −1 (or near
 * −1). The Newton for P² is seeded at x* + ε·v with v the critical
 * eigenvector, retrying over `seedSteps` until it converges to a genuinely
 * different orbit (Newton can fall back into x*, which is also a fixed point
 * of P² — that is rejected by the separation check, not reported as success).
 */
export function switchPeriodDoubling(
  params: DrivenParameters,
  period1: [number, number],
  options: BranchSwitchOptions = {}
): BranchSwitchResult {
  const drivePeriod = (2 * Math.PI) / params.driveFrequency;
  const dt = options.dt ?? 0.005;
  const minSeparation = options.minSeparation ?? 1e-3;
  const seedSteps = options.seedSteps ?? [0.02, 0.05, 0.1, 0.2];
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, params, o);
  };

  const M = monodromyMatrix([period1[0], period1[1], 0], rhs, drivePeriod, { dt }, undefined, 2);
  const multipliers = eigenvalues2x2(M);
  // The PD-critical multiplier: the real one nearest −1.
  const critical = multipliers.reduce((best, mu) =>
    Math.abs(mu.im) < 1e-9 && Math.abs(mu.re + 1) < Math.abs(best.re + 1) ? mu : best
  );
  const eigenvector = realEigenvector2x2(M, critical.re);

  let last: PeriodNOrbitResult | null = null;
  for (const step of seedSteps) {
    const seed: [number, number] = [period1[0] + step * eigenvector[0], period1[1] + step * eigenvector[1]];
    const candidate = drivenPeriodicOrbitN(params, seed, 2, options);
    last = candidate;
    const separation = Math.hypot(candidate.orbit[0] - period1[0], candidate.orbit[1] - period1[1]);
    if (candidate.converged && separation > minSeparation) {
      return { doubled: candidate, criticalMultiplier: critical, eigenvector, seedStep: step, separation, switched: true };
    }
  }
  return {
    doubled: last ?? drivenPeriodicOrbitN(params, period1, 2, options),
    criticalMultiplier: critical,
    eigenvector,
    seedStep: seedSteps[seedSteps.length - 1] ?? 0,
    separation: 0,
    switched: false
  };
}
