import type { Derivative, Jacobian } from './types';
import { rhsDouble, energyDouble, jacobianDouble } from './double';
import { rhsTriple } from './triple';
import { energyTriple } from './energy';
import { rhsChain, energyChain } from './nPendulum';
import { rhsDriven, energyDriven } from './driven';
import { rhsSpring, energySpring } from './spring';
import type { EnergyBreakdown } from '../types/domain';

/**
 * Data-only descriptor of a physical system. Because it is plain JSON it can
 * cross a Web Worker boundary, where `buildRhs` reconstructs the actual
 * `Derivative` closure. This is what lets the chaos computations move off the
 * main thread without trying (and failing) to serialize a function.
 */
export type SystemSpec =
  | { kind: 'double'; m1: number; m2: number; l1: number; l2: number; g: number }
  | { kind: 'triple'; m1: number; m2: number; m3: number; l1: number; l2: number; l3: number; g: number }
  | { kind: 'chain'; masses: number[]; lengths: number[]; g: number }
  | { kind: 'driven'; g: number; length: number; damping: number; driveAmplitude: number; driveFrequency: number }
  | { kind: 'spring'; mass: number; stiffness: number; restLength: number; g: number };

/** Reconstruct the (undamped unless the spec encodes damping) RHS for a spec. */
export function buildRhs(spec: SystemSpec): Derivative {
  switch (spec.kind) {
    case 'double': {
      const p = spec;
      return (s, o) => {
        rhsDouble(s, p, 0, o);
      };
    }
    case 'triple': {
      const p = spec;
      return (s, o) => {
        rhsTriple(s, p, 0, o);
      };
    }
    case 'chain': {
      const p = { masses: spec.masses, lengths: spec.lengths, g: spec.g };
      return (s, o) => {
        rhsChain(s, p, 0, o);
      };
    }
    case 'driven': {
      const p = spec;
      return (s, o) => {
        rhsDriven(s, p, o);
      };
    }
    case 'spring': {
      const p = spec;
      return (s, o) => {
        rhsSpring(s, p, o);
      };
    }
    default: {
      const exhaustive: never = spec;
      throw new Error(`unknown system spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Exact analytic Jacobian for a spec, where one is known in closed form
 * (currently the double pendulum). Returns `undefined` otherwise, so callers
 * transparently fall back to the central-difference Jacobian. Supplying this to
 * the Lyapunov spectrum removes the finite-difference error floor.
 */
export function buildJacobian(spec: SystemSpec): Jacobian | undefined {
  if (spec.kind === 'double') {
    const p = spec;
    return (state, jac) => {
      jacobianDouble(state, p, 0, jac);
    };
  }
  return undefined;
}

/** Total/kinetic/potential energy for a spec's state, mirroring `buildRhs`. */
export function energyForSpec(spec: SystemSpec, state: ArrayLike<number>): EnergyBreakdown {
  switch (spec.kind) {
    case 'double':
      return energyDouble(state, spec);
    case 'triple':
      return energyTriple(state, spec);
    case 'chain':
      return energyChain(state, { masses: spec.masses, lengths: spec.lengths, g: spec.g });
    case 'driven':
      return energyDriven(state, spec);
    case 'spring':
      return energySpring(state, spec);
    default: {
      const exhaustive: never = spec;
      throw new Error(`unknown system spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}
