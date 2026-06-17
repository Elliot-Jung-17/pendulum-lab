/**
 * The **quantum kicked rotor** — the canonical model of quantum chaos and the
 * quantisation of the Chirikov standard map (`standardMap.ts`). Its Floquet
 * (one-period) operator is split-operator exact:
 *
 *     U = e^{-i p²/(2ℏ̄)} · e^{-i (K/ℏ̄) cos θ}   ,  p = ℏ̄ m,
 *
 * a position-space kick e^{-i(K/ℏ̄)cosθ} followed by a momentum-space free phase
 * e^{-i ℏ̄ m²/2}, with an FFT (`fft.ts`) hopping between the bases each period.
 *
 * The headline result is **dynamical localization** (Fishman–Grempel–Prange
 * 1982): although the classical map diffuses in momentum (⟨p²⟩ ≈ D·t), the
 * quantum mean energy grows only until a break time and then **saturates**, with
 * an **exponentially localized** momentum distribution |ψ_m|² ∼ e^{-2|m|/ℓ} —
 * the dynamical analogue of Anderson localization (the rotor maps onto a 1-D
 * tight-binding model with pseudo-random site energies; directly relevant to
 * disorder-limited transport in solids).
 */
import { fftInPlace, ifftInPlace } from './fft';

export interface QuantumKickedRotorParams {
  /** Number of momentum/position grid points N (a power of two). */
  gridSize: number;
  /** Kick strength K (the classical stochasticity parameter). */
  kickStrength: number;
  /** Effective Planck constant ℏ̄ (the quantum scale; ℏ̄ → 0 is classical). */
  hbar: number;
}

/** Precomputed split-operator phase factors. */
export interface QkrPlan {
  gridSize: number;
  hbar: number;
  /** Momentum quantum number m for each FFT index. */
  momentum: Int32Array;
  kickRe: Float64Array;
  kickIm: Float64Array;
  freeRe: Float64Array;
  freeIm: Float64Array;
}

/** Complex wavefunction in the momentum basis (FFT-ordered). */
export interface QkrState {
  re: Float64Array;
  im: Float64Array;
}

function assertPow2(n: number): void {
  if (!Number.isInteger(n) || n < 2 || (n & (n - 1)) !== 0) {
    throw new Error('quantumKickedRotor: gridSize must be a power of two ≥ 2.');
  }
}

/** Build the split-operator phase factors for a parameter set. */
export function createQkrPlan(params: QuantumKickedRotorParams): QkrPlan {
  const n = params.gridSize;
  assertPow2(n);
  if (!(params.hbar > 0)) throw new Error('quantumKickedRotor: hbar must be positive.');
  const { kickStrength: k, hbar } = params;
  const momentum = new Int32Array(n);
  const kickRe = new Float64Array(n);
  const kickIm = new Float64Array(n);
  const freeRe = new Float64Array(n);
  const freeIm = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    const theta = (2 * Math.PI * j) / n;
    const kickPhase = -(k / hbar) * Math.cos(theta);
    kickRe[j] = Math.cos(kickPhase);
    kickIm[j] = Math.sin(kickPhase);
    const m = j < n / 2 ? j : j - n;
    momentum[j] = m;
    const freePhase = -0.5 * hbar * m * m;
    freeRe[j] = Math.cos(freePhase);
    freeIm[j] = Math.sin(freePhase);
  }
  return { gridSize: n, hbar, momentum, kickRe, kickIm, freeRe, freeIm };
}

/** Initial state: the zero-momentum eigenstate (ψ_m = δ_{m,0}). */
export function createQkrState(gridSize: number): QkrState {
  assertPow2(gridSize);
  const re = new Float64Array(gridSize);
  const im = new Float64Array(gridSize);
  re[0] = 1;
  return { re, im };
}

/** Advance the (momentum-basis) state by one Floquet period, in place. */
export function qkrStep(state: QkrState, plan: QkrPlan): void {
  const { re, im } = state;
  const n = plan.gridSize;
  // Kick acts in position space: momentum → position.
  ifftInPlace(re, im);
  for (let j = 0; j < n; j += 1) {
    const r = re[j]!;
    const i = im[j]!;
    re[j] = r * plan.kickRe[j]! - i * plan.kickIm[j]!;
    im[j] = r * plan.kickIm[j]! + i * plan.kickRe[j]!;
  }
  // Back to momentum for the free phase.
  fftInPlace(re, im);
  for (let j = 0; j < n; j += 1) {
    const r = re[j]!;
    const i = im[j]!;
    re[j] = r * plan.freeRe[j]! - i * plan.freeIm[j]!;
    im[j] = r * plan.freeIm[j]! + i * plan.freeRe[j]!;
  }
}

/** Total probability Σ_m |ψ_m|² (= 1 for a unitary evolution). */
export function qkrNorm(state: QkrState): number {
  let s = 0;
  for (let j = 0; j < state.re.length; j += 1) s += (state.re[j] ?? 0) ** 2 + (state.im[j] ?? 0) ** 2;
  return s;
}

/** Mean square momentum ⟨m²⟩ = Σ_m m² |ψ_m|² / Σ |ψ_m|². */
export function qkrMeanSquareMomentum(state: QkrState, plan: QkrPlan): number {
  let num = 0;
  let den = 0;
  for (let j = 0; j < plan.gridSize; j += 1) {
    const prob = (state.re[j] ?? 0) ** 2 + (state.im[j] ?? 0) ** 2;
    const m = plan.momentum[j] ?? 0;
    num += m * m * prob;
    den += prob;
  }
  return den > 0 ? num / den : 0;
}

export interface QkrRun {
  /** ⟨m²⟩ at each period (length `periods`+1, including t = 0). */
  energyHistory: number[];
  /** Momentum quantum numbers, ascending. */
  momentum: number[];
  /** |ψ_m|² aligned with `momentum` (the final distribution). */
  probability: number[];
  /** Localization length ℓ from the exponential-tail fit ln P ≈ const − 2|m|/ℓ. */
  localizationLength: number;
  /** R² of that log-linear tail fit (≈1 ⇒ cleanly exponential / localized). */
  localizationFitR2: number;
  /** Final total probability (unitarity check; ≈ 1). */
  finalNorm: number;
}

/** Run the quantum kicked rotor for `periods` kicks from the m = 0 eigenstate. */
export function runQuantumKickedRotor(params: QuantumKickedRotorParams, periods: number): QkrRun {
  if (periods < 1) throw new Error('runQuantumKickedRotor: periods must be ≥ 1.');
  const plan = createQkrPlan(params);
  const state = createQkrState(params.gridSize);
  const energyHistory = new Array<number>(periods + 1).fill(0);
  energyHistory[0] = qkrMeanSquareMomentum(state, plan);
  for (let t = 1; t <= periods; t += 1) {
    qkrStep(state, plan);
    energyHistory[t] = qkrMeanSquareMomentum(state, plan);
  }

  // Final momentum distribution, ordered by m.
  const n = plan.gridSize;
  const pairs: Array<{ m: number; p: number }> = [];
  for (let j = 0; j < n; j += 1) {
    pairs.push({ m: plan.momentum[j] ?? 0, p: (state.re[j] ?? 0) ** 2 + (state.im[j] ?? 0) ** 2 });
  }
  pairs.sort((a, b) => a.m - b.m);
  const momentum = pairs.map((q) => q.m);
  const probability = pairs.map((q) => q.p);

  // Exponential-tail fit: ln P vs |m| over the well-resolved central band.
  const xs: number[] = [];
  const ys: number[] = [];
  const floor = 1e-14;
  for (let i = 0; i < pairs.length; i += 1) {
    const { m, p } = pairs[i]!;
    if (p > floor) {
      xs.push(Math.abs(m));
      ys.push(Math.log(p));
    }
  }
  const { slope, r2 } = linearFit(xs, ys);
  const localizationLength = slope < 0 ? -2 / slope : Infinity;

  return {
    energyHistory,
    momentum,
    probability,
    localizationLength,
    localizationFitR2: r2,
    finalNorm: qkrNorm(state)
  };
}

function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i] ?? 0;
    sy += ys[i] ?? 0;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return { slope: 0, r2: 0 };
  const slope = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { slope, r2 };
}
