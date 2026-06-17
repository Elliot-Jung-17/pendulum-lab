/**
 * **Fermi–Pasta–Ulam–Tsingou (FPUT) lattice** — a 1-D chain of unit masses with
 * fixed ends, coupled by *anharmonic* nearest-neighbour springs. This is the
 * 1955 founding numerical experiment of nonlinear lattice dynamics, and the
 * direct anharmonic generalisation of the harmonic phonon chain in
 * `latticeDispersion` / `pendulumNetwork`: where the harmonic lattice has exact
 * decoupled normal modes (phonons that never exchange energy), the cubic/quartic
 * spring terms couple them, so energy placed in one mode flows to others — the
 * microscopic origin of phonon–phonon scattering and finite thermal
 * conductivity in a crystal. Famously, instead of equipartitioning, the energy
 * nearly *returns* to the initial mode (**FPUT recurrence**), the discovery that
 * launched soliton theory (the KdV continuum limit) and the study of
 * thermalisation in nonlinear lattices.
 *
 * Spring potential per bond V(d) = ½d² + (α/3)d³ + (β/4)d⁴ (d = relative
 * displacement); α-FPUT is the cubic model, β-FPUT the quartic. With fixed ends
 * (q₀ = q_{N+1} = 0) the equations of motion are
 *
 *   q̈_i = (q_{i+1} − 2q_i + q_{i−1})
 *        + α[(q_{i+1}−q_i)² − (q_i−q_{i−1})²]
 *        + β[(q_{i+1}−q_i)³ − (q_i−q_{i−1})³].
 *
 * The harmonic normal modes have frequencies ω_k = 2·sin(kπ/2(N+1)) and the mode
 * energies E_k = ½(Q̇_k² + ω_k²Q_k²) are the natural observable: the helpers
 * here compute the energy, the per-mode energies, and advance the chain with a
 * symplectic **velocity-Verlet** step (energy-conserving to the discretisation
 * floor). Validation pins energy conservation, the exact harmonic limit (Σ_k E_k
 * = total energy when α = β = 0), and the FPUT recurrence of a single-mode start.
 */

export interface FputParameters {
  /** Number of moving masses N (≥ 2); the chain has fixed ends q₀ = q_{N+1} = 0. */
  size: number;
  /** Cubic (α-FPUT) coupling. Default 0. */
  alpha?: number;
  /** Quartic (β-FPUT) coupling. Default 0. */
  beta?: number;
}

function resolve(params: FputParameters): { n: number; alpha: number; beta: number } {
  const n = params.size;
  if (!Number.isInteger(n) || n < 2) throw new Error('FPUT: size must be an integer ≥ 2.');
  return { n, alpha: params.alpha ?? 0, beta: params.beta ?? 0 };
}

/** Bond restoring force V'(d) = d + α d² + β d³. */
function bondForce(d: number, alpha: number, beta: number): number {
  return d + alpha * d * d + beta * d * d * d;
}

/**
 * Acceleration q̈_i of every mass (mass = 1), with fixed-end boundaries. `q` is
 * the length-N displacement block; the result is written into `out`.
 */
export function fputAcceleration(q: ArrayLike<number>, params: FputParameters, out: Float64Array): Float64Array {
  const { n, alpha, beta } = resolve(params);
  if (q.length < n) throw new Error('fputAcceleration: displacement block shorter than size.');
  for (let i = 0; i < n; i += 1) {
    const left = i > 0 ? (q[i - 1] ?? 0) : 0; // fixed wall on the left of mass 0
    const right = i < n - 1 ? (q[i + 1] ?? 0) : 0; // fixed wall on the right of mass N−1
    const qi = q[i] ?? 0;
    const dRight = right - qi;
    const dLeft = qi - left;
    out[i] = bondForce(dRight, alpha, beta) - bondForce(dLeft, alpha, beta);
  }
  return out;
}

/**
 * Total Hamiltonian H = Σ ½p_i² + Σ_bonds [½d² + (α/3)d³ + (β/4)d⁴] of a packed
 * state [q₀..q_{N−1}, p₀..p_{N−1}]. Conserved by the velocity-Verlet flow.
 */
export function fputEnergy(state: ArrayLike<number>, params: FputParameters): number {
  const { n, alpha, beta } = resolve(params);
  if (state.length < 2 * n) throw new Error('fputEnergy: state must be length 2N.');
  let energy = 0;
  for (let i = 0; i < n; i += 1) {
    const p = state[n + i] ?? 0;
    energy += 0.5 * p * p;
  }
  // N+1 bonds, bond b between mass b−1 and b (b = 0..N), walls at 0.
  for (let b = 0; b <= n; b += 1) {
    const left = b > 0 ? (state[b - 1] ?? 0) : 0;
    const right = b < n ? (state[b] ?? 0) : 0;
    const d = right - left;
    energy += 0.5 * d * d + (alpha / 3) * d * d * d + (beta / 4) * d * d * d * d;
  }
  return energy;
}

/** Harmonic normal-mode angular frequency ω_k = 2·sin(kπ / 2(N+1)), k = 1..N. */
export function fputModeFrequency(k: number, size: number): number {
  if (!Number.isInteger(size) || size < 2) throw new Error('fputModeFrequency: size must be an integer ≥ 2.');
  if (!Number.isInteger(k) || k < 1 || k > size) throw new Error('fputModeFrequency: mode k must be in 1..size.');
  return 2 * Math.sin((k * Math.PI) / (2 * (size + 1)));
}

/**
 * Per-mode harmonic energies E_k = ½(Q̇_k² + ω_k²Q_k²), k = 1..N (index k−1),
 * via the discrete sine transform Q_k = √(2/(N+1)) Σ_i q_i sin(i k π/(N+1)). For
 * α = β = 0 these sum to the total energy; with anharmonicity they sum to the
 * harmonic part and redistribute as energy flows between modes.
 */
export function fputModeEnergies(state: ArrayLike<number>, params: FputParameters): number[] {
  const { n } = resolve(params);
  if (state.length < 2 * n) throw new Error('fputModeEnergies: state must be length 2N.');
  const norm = Math.sqrt(2 / (n + 1));
  const energies = new Array<number>(n).fill(0);
  for (let k = 1; k <= n; k += 1) {
    let qMode = 0;
    let pMode = 0;
    for (let i = 0; i < n; i += 1) {
      const s = Math.sin(((i + 1) * k * Math.PI) / (n + 1));
      qMode += (state[i] ?? 0) * s;
      pMode += (state[n + i] ?? 0) * s;
    }
    qMode *= norm;
    pMode *= norm;
    const omega = fputModeFrequency(k, n);
    energies[k - 1] = 0.5 * (pMode * pMode + omega * omega * qMode * qMode);
  }
  return energies;
}

/**
 * Build a packed state initialised in a single harmonic mode k with the given
 * position-space amplitude (velocities zero) — the classic FPUT recurrence
 * start when k = 1.
 */
export function createFputModeState(size: number, k: number, amplitude: number): Float64Array {
  if (!Number.isInteger(size) || size < 2) throw new Error('createFputModeState: size must be an integer ≥ 2.');
  if (!Number.isInteger(k) || k < 1 || k > size) throw new Error('createFputModeState: mode k must be in 1..size.');
  const state = new Float64Array(2 * size);
  for (let i = 0; i < size; i += 1) state[i] = amplitude * Math.sin(((i + 1) * k * Math.PI) / (size + 1));
  return state;
}

export interface FputVerletScratch {
  accelOld: Float64Array;
  accelNew: Float64Array;
}

/** Allocate reusable scratch for {@link fputVelocityVerletStep}. */
export function createFputVerletScratch(size: number): FputVerletScratch {
  return { accelOld: new Float64Array(size), accelNew: new Float64Array(size) };
}

/**
 * Advance a packed FPUT state [q, p] by one symplectic velocity-Verlet step of
 * size dt, in place. Pass reusable `scratch` to avoid per-step allocation.
 */
export function fputVelocityVerletStep(
  state: Float64Array,
  dt: number,
  params: FputParameters,
  scratch?: FputVerletScratch
): Float64Array {
  const { n } = resolve(params);
  if (state.length < 2 * n) throw new Error('fputVelocityVerletStep: state must be length 2N.');
  if (!(dt > 0)) throw new Error('fputVelocityVerletStep: dt must be positive.');
  const work = scratch ?? createFputVerletScratch(n);
  const q = state.subarray(0, n);
  const aOld = fputAcceleration(q, params, work.accelOld);
  const half = 0.5 * dt * dt;
  for (let i = 0; i < n; i += 1) state[i] = (state[i] ?? 0) + dt * (state[n + i] ?? 0) + half * (aOld[i] ?? 0);
  const aNew = fputAcceleration(q, params, work.accelNew);
  for (let i = 0; i < n; i += 1) state[n + i] = (state[n + i] ?? 0) + 0.5 * dt * ((aOld[i] ?? 0) + (aNew[i] ?? 0));
  return state;
}

export interface FputRecurrenceResult {
  /** Times sampled. */
  times: number[];
  /** Energy fraction in the initial mode at each sample. */
  initialModeFraction: number[];
  /** Minimum initial-mode fraction over the run (how far energy spread out). */
  minFraction: number;
  /** Maximum initial-mode fraction *after* the first dip (the recurrence peak). */
  recurrenceFraction: number;
  /** Time of the recurrence peak. */
  recurrenceTime: number;
  /** Max |E(t) − E(0)| / E(0) over the run (energy-conservation witness). */
  energyDrift: number;
}

/**
 * Integrate a single-mode FPUT start and track the energy fraction in that mode,
 * returning the spread (minimum fraction) and the recurrence (the post-dip peak).
 * The canonical demonstration that an anharmonic lattice does *not* thermalise
 * on short timescales but nearly returns to its initial state.
 */
export function fputRecurrence(
  params: FputParameters,
  options: { mode?: number; amplitude?: number; dt?: number; totalTime: number; sampleEvery?: number }
): FputRecurrenceResult {
  const { n } = resolve(params);
  const mode = options.mode ?? 1;
  const amplitude = options.amplitude ?? 1;
  const dt = options.dt ?? 0.05;
  if (!(options.totalTime > 0)) throw new Error('fputRecurrence: totalTime must be positive.');
  const sampleEvery = Math.max(1, Math.trunc(options.sampleEvery ?? 20));
  const state = createFputModeState(n, mode, amplitude);
  const scratch = createFputVerletScratch(n);
  const energy0 = fputEnergy(state, params);
  const totalSteps = Math.max(1, Math.round(options.totalTime / dt));

  const times: number[] = [];
  const initialModeFraction: number[] = [];
  let energyDrift = 0;

  for (let s = 0; s <= totalSteps; s += 1) {
    if (s % sampleEvery === 0) {
      const modes = fputModeEnergies(state, params);
      const total = modes.reduce((a, b) => a + b, 0);
      const fraction = total > 0 ? (modes[mode - 1] ?? 0) / total : 0;
      times.push(s * dt);
      initialModeFraction.push(fraction);
      energyDrift = Math.max(energyDrift, Math.abs(fputEnergy(state, params) - energy0) / Math.abs(energy0));
    }
    if (s < totalSteps) fputVelocityVerletStep(state, dt, params, scratch);
  }

  // Global minimum (how far energy spread out) and the *rebound* after it (the
  // recurrence — energy flowing back toward the initial mode).
  let minFraction = Infinity;
  let minIndex = 0;
  for (let i = 0; i < initialModeFraction.length; i += 1) {
    const f = initialModeFraction[i] ?? 0;
    if (f < minFraction) {
      minFraction = f;
      minIndex = i;
    }
  }
  let recurrenceFraction = initialModeFraction[minIndex] ?? 0;
  let recurrenceTime = times[minIndex] ?? 0;
  for (let i = minIndex; i < initialModeFraction.length; i += 1) {
    const f = initialModeFraction[i] ?? 0;
    if (f > recurrenceFraction) {
      recurrenceFraction = f;
      recurrenceTime = times[i] ?? 0;
    }
  }
  return { times, initialModeFraction, minFraction, recurrenceFraction, recurrenceTime, energyDrift };
}
