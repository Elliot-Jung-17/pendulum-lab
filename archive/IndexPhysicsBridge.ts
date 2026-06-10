import type { IntegratorId, PendulumParameters } from '../types/domain';
import type { PendulumLegacyPhysics } from '../types/globals';
import { energyDouble, rhsDouble, rk2Step, rk4Step, eulerStep, gaussLegendre4Step } from '../physics';

type LegacyRhs = (state: Float64Array, out: Float64Array) => void;

const INDEX_STEP_METHODS = new Set<IntegratorId>(['euler', 'rk2', 'rk4', 'gauss2']);

function toFloat64(state: Float64Array | number[]): Float64Array {
  return state instanceof Float64Array ? state : new Float64Array(state);
}

export function installIndexPhysicsBridge(physics: PendulumLegacyPhysics | undefined = window.Physics): boolean {
  if (!physics || (physics as PendulumLegacyPhysics & { __indexBridge?: boolean }).__indexBridge) return false;

  const legacyStep = physics.step.bind(physics);
  const legacyRk4 = physics.rk4step.bind(physics);

  physics.rhs2 = (state: Float64Array | number[], parameters: PendulumParameters, gamma: number, out: Float64Array) =>
    rhsDouble(state, parameters, gamma, out) as Float64Array;

  physics.energy2 = (state: Float64Array | number[], parameters: PendulumParameters) => energyDouble(state, parameters);

  physics.rk4step = (state: Float64Array, dt: number, rhs: LegacyRhs, n: number, out: Float64Array) => {
    if (n !== 4) return legacyRk4(state, dt, rhs, n, out);
    return rk4Step(toFloat64(state), dt, rhs, out) as Float64Array;
  };

  physics.step = (method: IntegratorId, state: Float64Array, dt: number, rhs: LegacyRhs, n: number, out: Float64Array, options?: { tolerance?: number }) => {
    if (n !== 4 || !INDEX_STEP_METHODS.has(method)) return legacyStep(method, state, dt, rhs, n, out, options);
    if (method === 'euler') return eulerStep(state, dt, rhs, out);
    if (method === 'rk2') return rk2Step(state, dt, rhs, out);
    if (method === 'gauss2') return gaussLegendre4Step(state, dt, rhs, out, options?.tolerance === undefined ? {} : { tolerance: options.tolerance });
    return rk4Step(state, dt, rhs, out);
  };

  (physics as PendulumLegacyPhysics & { __indexBridge?: boolean }).__indexBridge = true;
  return true;
}
