import type { Derivative, StateVector } from '../physics/types';
import { detectEvents, type CrossingDirection, type EventFunction } from '../physics/events';

/**
 * Poincare-section sampling and parameter-sweep bifurcation diagrams, both
 * built on the event-detection solver so section points sit exactly on the
 * section (to the bisection tolerance) rather than at the nearest time step.
 */

export interface PoincareOptions {
  section: EventFunction;
  direction?: CrossingDirection;
  dt?: number;
  maxTime: number;
  /** Drop this many initial crossings as transient (default 0). */
  transientCrossings?: number;
  /** Cap on the number of retained section points. */
  maxPoints?: number;
  rootTol?: number;
}

export interface PoincareResult {
  /** Full state vectors recorded on the section. */
  points: StateVector[];
  /** Crossing times for the retained points. */
  times: number[];
}

export function poincareSection(state0: ArrayLike<number>, rhs: Derivative, options: PoincareOptions): PoincareResult {
  const transient = options.transientCrossings ?? 0;
  const maxPoints = options.maxPoints ?? Infinity;
  const result = detectEvents(new Float64Array(state0), rhs, [{ g: options.section, direction: options.direction ?? 'both' }], {
    dt: options.dt ?? 1e-3,
    maxTime: options.maxTime,
    rootTol: options.rootTol ?? 1e-9,
    maxEvents: Number.isFinite(maxPoints) ? transient + maxPoints : Infinity
  });
  const kept = result.events.slice(transient);
  return {
    points: kept.map((e) => e.state),
    times: kept.map((e) => e.time)
  };
}

export interface BifurcationOptions<P> {
  /** Parameter values to sweep. */
  parameters: readonly P[];
  /** Build the RHS for a given parameter value. */
  makeRhs: (param: P) => Derivative;
  /** Initial state for a given parameter value (allows continuation if desired). */
  makeState0: (param: P) => ArrayLike<number>;
  /** Section predicate (e.g. a stroboscopic phase or a coordinate plane). */
  section: EventFunction;
  /** Scalar plotted on the bifurcation axis, evaluated at each section crossing. */
  observable: (state: StateVector) => number;
  direction?: CrossingDirection;
  dt?: number;
  maxTime: number;
  transientCrossings?: number;
  maxPointsPerParam?: number;
}

export interface BifurcationColumn<P> {
  param: P;
  values: number[];
}

/**
 * Sweep a parameter, integrate to the attractor, and record the observable at
 * each Poincare crossing. A periodic window yields a few repeated values; a
 * chaotic window yields a broad scatter — the classic bifurcation picture.
 */
export function bifurcationDiagram<P>(options: BifurcationOptions<P>): BifurcationColumn<P>[] {
  const columns: BifurcationColumn<P>[] = [];
  for (const param of options.parameters) {
    const section = poincareSection(options.makeState0(param), options.makeRhs(param), {
      section: options.section,
      direction: options.direction ?? 'both',
      dt: options.dt ?? 1e-3,
      maxTime: options.maxTime,
      transientCrossings: options.transientCrossings ?? 0,
      maxPoints: options.maxPointsPerParam ?? 200
    });
    columns.push({ param, values: section.points.map(options.observable) });
  }
  return columns;
}

/**
 * Count distinct clusters in a list of values to a tolerance — a cheap way to
 * classify a bifurcation column as period-n (small count) vs chaotic (large).
 */
export function distinctValueCount(values: readonly number[], tol = 1e-3): number {
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  let last = Number.NaN;
  for (const v of sorted) {
    if (Number.isNaN(last) || Math.abs(v - last) > tol) {
      count += 1;
      last = v;
    }
  }
  return count;
}
