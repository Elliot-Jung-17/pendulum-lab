import type { EnergyBreakdown, IntegratorId, PendulumParameters, SystemType } from '../types/domain';

export type StateVector = Float64Array;
export type Derivative = (state: StateVector, out: StateVector) => void;

/**
 * Exact tangent-space Jacobian J[i][j] = df_i/dx_j for a `Derivative`, written
 * row-major into `jac` (length n*n) given the current state. Supplying an
 * analytic Jacobian to the chaos diagnostics removes the ~1e-7 error floor of
 * finite differencing, which is what limits Lyapunov-spectrum accuracy.
 */
export type Jacobian = (state: StateVector, jac: Float64Array) => void;

export interface StepOptions {
  tolerance?: number;
  previousError?: { value: number };
}

export interface IntegratorMeta {
  id: IntegratorId;
  name: string;
  order: number | 'adaptive' | 'implicit';
  symplectic: 'no' | 'canonical-only' | 'pseudo-coordinate' | 'separable-approximation';
  dampingSupport: 'diagnostic-only' | 'supported';
  stabilityNotes: string[];
  recommendedDt: readonly [number, number];
}

export interface PhysicsAdapter {
  derivative(system: SystemType, state: StateVector, parameters: PendulumParameters, gamma: number, out: StateVector): StateVector;
  energy(system: SystemType, state: StateVector, parameters: PendulumParameters): EnergyBreakdown;
  step(method: IntegratorId, state: StateVector, dt: number, rhs: Derivative, out: StateVector, options?: StepOptions): StateVector;
}
