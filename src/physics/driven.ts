import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';

/**
 * Sinusoidally driven, damped single pendulum — the canonical low-dimensional
 * route to chaos. The system is made autonomous by carrying the drive phase as
 * a third coordinate, so it integrates with any explicit solver without a
 * time-dependent RHS signature.
 *
 * State layout: [theta, omega, phi] where phi is the drive phase (phi' = driveFrequency).
 * Unit bob mass and unit length are assumed unless `length` overrides it.
 *
 *   theta' = omega
 *   omega' = -(g / l) sin(theta) - gamma * omega + driveAmplitude * cos(phi)
 *   phi'   = driveFrequency
 */
export interface DrivenParameters {
  g: number;
  length: number;
  damping: number;
  driveAmplitude: number;
  driveFrequency: number;
}

/** A widely-cited chaotic parameter set for the damped driven pendulum. */
export const DAMPED_DRIVEN_CHAOS_PRESET: DrivenParameters = Object.freeze({
  g: 1,
  length: 1,
  damping: 0.5,
  driveAmplitude: 1.15,
  driveFrequency: 2 / 3
});

export function rhsDriven(state: ArrayLike<number>, parameters: DrivenParameters, out: StateVector): StateVector {
  const theta = Number(state[0] ?? 0);
  const omega = Number(state[1] ?? 0);
  const phi = Number(state[2] ?? 0);
  const { g, length, damping, driveAmplitude, driveFrequency } = parameters;
  out[0] = omega;
  out[1] = -(g / length) * Math.sin(theta) - damping * omega + driveAmplitude * Math.cos(phi);
  out[2] = driveFrequency;
  return out;
}

/**
 * Instantaneous mechanical energy of the bob (unit mass). For a driven and/or
 * damped pendulum this is deliberately NOT conserved — it is reported as a
 * diagnostic of energy injection and dissipation, not as a conservation check.
 */
export function energyDriven(state: ArrayLike<number>, parameters: DrivenParameters): EnergyBreakdown {
  const theta = Number(state[0] ?? 0);
  const omega = Number(state[1] ?? 0);
  const { g, length } = parameters;
  const KE = 0.5 * length * length * omega * omega;
  const PE = -g * length * Math.cos(theta);
  return { total: KE + PE, KE, PE };
}
