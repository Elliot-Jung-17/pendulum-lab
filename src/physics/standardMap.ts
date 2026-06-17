/**
 * The Chirikov–Taylor **standard map** — the paradigm of Hamiltonian (area-
 * preserving) chaos and the classical limit of the quantum kicked rotor
 * (`quantumKickedRotor.ts`):
 *
 *     p_{n+1} = p_n + K sin θ_n ,   θ_{n+1} = θ_n + p_{n+1}  (mod 2π).
 *
 * θ lives on the circle; p is left unwrapped so its spread measures transport.
 * Below the last-invariant-torus threshold K_c ≈ 0.971635 the golden KAM torus
 * spans the cylinder and blocks global momentum transport (⟨p²⟩ stays bounded);
 * well above it the phase space is globally chaotic and p **diffuses**,
 * ⟨p²⟩ ≈ D(K)·n with the random-phase (quasilinear) rate D ≈ K²/2.
 */
import { mulberry32 } from './variational';

/** Greene's last-KAM-torus (golden-mean) critical parameter. */
export const STANDARD_MAP_KC = 0.971635;

const TWO_PI = 2 * Math.PI;

/** One standard-map iterate. θ is wrapped to [0, 2π); p is returned unwrapped. */
export function standardMapStep(theta: number, p: number, K: number): { theta: number; p: number } {
  const pNext = p + K * Math.sin(theta);
  let thetaNext = (theta + pNext) % TWO_PI;
  if (thetaNext < 0) thetaNext += TWO_PI;
  return { theta: thetaNext, p: pNext };
}

/**
 * Mean square momentum ⟨p²⟩(n) over an ensemble started at p = 0 with θ drawn
 * uniformly (seeded). Returns the history (length `steps`+1, including n = 0).
 * Linear growth ⇒ diffusion (chaotic transport); a bounded plateau ⇒ KAM
 * confinement.
 */
export function standardMapEnsembleEnergy(K: number, steps: number, ensembleSize: number, seed = 1): number[] {
  if (steps < 1) throw new Error('standardMapEnsembleEnergy: steps must be ≥ 1.');
  if (ensembleSize < 1) throw new Error('standardMapEnsembleEnergy: ensembleSize must be ≥ 1.');
  const rng = mulberry32(seed >>> 0);
  const theta = new Float64Array(ensembleSize);
  const p = new Float64Array(ensembleSize);
  for (let i = 0; i < ensembleSize; i += 1) theta[i] = TWO_PI * rng();

  const history = new Array<number>(steps + 1).fill(0);
  history[0] = 0; // p starts at 0
  for (let n = 1; n <= steps; n += 1) {
    let sumP2 = 0;
    for (let i = 0; i < ensembleSize; i += 1) {
      const next = standardMapStep(theta[i] ?? 0, p[i] ?? 0, K);
      theta[i] = next.theta;
      p[i] = next.p;
      sumP2 += next.p * next.p;
    }
    history[n] = sumP2 / ensembleSize;
  }
  return history;
}

/**
 * Least-squares diffusion rate D from ⟨p²⟩(n) ≈ D·n (slope through the origin,
 * fit over the second half of the history to skip the initial transient).
 */
export function standardMapDiffusionRate(energyHistory: readonly number[]): number {
  const n = energyHistory.length;
  const start = Math.floor(n / 2);
  let num = 0;
  let den = 0;
  for (let i = start; i < n; i += 1) {
    num += i * (energyHistory[i] ?? 0);
    den += i * i;
  }
  return den > 0 ? num / den : 0;
}
