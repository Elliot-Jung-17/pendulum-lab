import type { DrivenParameters } from '../physics/driven';
import { drivenPeriodicOrbit, type FloquetMultiplier } from './floquet';

/**
 * Numerical continuation (AUTO-style) of the driven-pendulum period-1 orbit, and
 * detection of the bifurcation where it loses stability.
 *
 * A period-1 orbit is a fixed point of the stroboscopic map; `drivenPeriodicOrbit`
 * finds it (and its Floquet multipliers) by Newton. Natural-parameter
 * continuation steps a chosen parameter and re-solves from the previous orbit as
 * the initial guess, tracing the solution branch and its multipliers. The orbit
 * loses stability when a Floquet multiplier leaves the unit circle; the kind of
 * crossing names the bifurcation:
 *
 *   ρ → −1 (real)         period-doubling (flip)
 *   ρ → +1 (real)         tangent: a fold / transcritical / pitchfork — which one
 *                         needs further analysis, so it is reported generically
 *   complex pair, |ρ| → 1 Neimark–Sacker (torus birth)
 *
 * Natural-parameter continuation traces branches that are graphs over the
 * parameter; turning a fold requires pseudo-arclength continuation, and
 * switching onto detected PD/pitchfork/transcritical/NS branches is handled by
 * the dedicated branch-switching/torus modules rather than this scanner.
 */

export type BifurcationType = 'period-doubling' | 'neimark-sacker' | 'tangent';

/** Classify a stability-loss bifurcation from the multipliers at the first unstable point. */
export function classifyBifurcation(multipliers: readonly FloquetMultiplier[]): BifurcationType {
  // The critical multiplier is the one furthest outside the unit circle.
  let crit = multipliers[0]!;
  for (const m of multipliers) if (m.modulus > crit.modulus) crit = m;
  if (Math.abs(crit.im) > 1e-6) return 'neimark-sacker';
  return crit.re < 0 ? 'period-doubling' : 'tangent';
}

export interface ContinuationPoint {
  parameter: number;
  /** Period-1 orbit (θ, ω) at drive phase φ = 0. */
  orbit: [number, number];
  /** Largest |Floquet multiplier| — the orbit is stable iff ≤ 1. */
  maxModulus: number;
  multipliers: FloquetMultiplier[];
  stable: boolean;
  converged: boolean;
}

export interface ContinuationBifurcation {
  parameter: number;
  type: BifurcationType;
  multipliers: FloquetMultiplier[];
}

export interface ContinuationResult {
  branch: ContinuationPoint[];
  /** First stability-loss along the branch, or null if none was found in range. */
  bifurcation: ContinuationBifurcation | null;
}

export interface ContinuationOptions {
  /** Which driven-pendulum parameter to continue in. */
  parameter: keyof DrivenParameters;
  start: number;
  end: number;
  step: number;
  /** Initial (θ, ω) guess at the start parameter. Default [0, 0]. */
  guess?: [number, number];
  dt?: number;
  tolerance?: number;
  maxIterations?: number;
}

/**
 * Continue the driven-pendulum period-1 orbit across a parameter, recording the
 * orbit and its Floquet multipliers at each step and reporting the first
 * bifurcation where the orbit loses stability.
 */
export function continueDrivenPeriodicOrbit(base: DrivenParameters, options: ContinuationOptions): ContinuationResult {
  const { parameter, start, end, step } = options;
  const dt = options.dt ?? 0.004;
  const tolerance = options.tolerance ?? 1e-11;
  const maxIterations = options.maxIterations ?? 80;
  const dir = end >= start ? 1 : -1;
  const stepSize = Math.abs(step) * dir;

  const branch: ContinuationPoint[] = [];
  let bifurcation: ContinuationBifurcation | null = null;
  let guess: [number, number] = options.guess ?? [0, 0];
  let prevStable: boolean | null = null;

  for (let value = start; dir > 0 ? value <= end + 1e-12 : value >= end - 1e-12; value += stepSize) {
    const params: DrivenParameters = { ...base, [parameter]: value };
    const r = drivenPeriodicOrbit(params, guess, { dt, tolerance, maxIterations });
    if (r.converged) guess = r.orbit; // warm-start the next step

    const point: ContinuationPoint = {
      parameter: value,
      orbit: r.orbit,
      maxModulus: r.maxModulus,
      multipliers: r.multipliers,
      stable: r.stable,
      converged: r.converged
    };
    branch.push(point);

    if (!r.converged) break; // lost the branch — stop (a fold needs arclength continuation)
    if (bifurcation === null && prevStable === true && !r.stable) {
      bifurcation = { parameter: value, type: classifyBifurcation(r.multipliers), multipliers: r.multipliers };
    }
    prevStable = r.stable;
  }

  return { branch, bifurcation };
}
