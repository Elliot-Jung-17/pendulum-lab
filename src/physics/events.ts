import type { Derivative, StateVector } from './types';
import { rk4Step } from './integrators';
import { dormandPrince54StepDense } from './adaptive';
import { refineCrossing } from './eventLocator';

/**
 * Event-detection solver. Integrates a system while watching scalar event
 * functions g(state); whenever one crosses zero it refines the crossing time
 * and state inside the step (shared secant/bisection hybrid from
 * `eventLocator.ts`) to a requested tolerance. This is the primitive behind
 * Poincare sections, period measurement, and apex/return detection.
 *
 * Two refinement back-ends are available: re-advancing the step prefix with
 * RK4 per probe (default, matches the historical behaviour), or a single
 * Dormand-Prince 5(4) step whose free 4th-order dense output makes each probe
 * a polynomial evaluation instead of a re-integration (`denseOutput: true`).
 */

export type EventFunction = (state: StateVector) => number;

export type CrossingDirection = 'rising' | 'falling' | 'both';

export interface EventSpec {
  /** Scalar function whose sign change marks an event. */
  g: EventFunction;
  /** Which zero-crossing direction to report. Defaults to 'both'. */
  direction?: CrossingDirection;
  /** Optional label carried through to the hit record. */
  label?: string;
}

export interface EventHit {
  time: number;
  /** Index of the triggering spec in the input array. */
  eventIndex: number;
  label: string | undefined;
  /** +1 for a rising crossing (g goes - to +), -1 for falling. */
  direction: 1 | -1;
  state: StateVector;
}

export interface EventSolveOptions {
  dt?: number;
  maxTime: number;
  /** Root-refinement tolerance on the crossing time. */
  rootTol?: number;
  /** Stop after this many events (default: unbounded until maxTime). */
  maxEvents?: number;
  /**
   * Advance with Dormand-Prince 5(4) and refine crossings on its dense-output
   * interpolant (one polynomial evaluation per probe) instead of re-running
   * RK4 prefixes. Higher-order trajectory and cheaper refinement.
   */
  denseOutput?: boolean;
}

export interface EventSolveResult {
  events: EventHit[];
  finalState: StateVector;
  finalTime: number;
}

function accepts(direction: CrossingDirection | undefined, g0: number, g1: number): 1 | -1 | 0 {
  const rising = g0 <= 0 && g1 > 0;
  const falling = g0 >= 0 && g1 < 0;
  const dir = direction ?? 'both';
  if (rising && (dir === 'rising' || dir === 'both')) return 1;
  if (falling && (dir === 'falling' || dir === 'both')) return -1;
  return 0;
}

export function detectEvents(
  state0: StateVector,
  rhs: Derivative,
  specs: readonly EventSpec[],
  options: EventSolveOptions
): EventSolveResult {
  const dt = options.dt ?? 1e-3;
  const rootTol = options.rootTol ?? 1e-9;
  const maxEvents = options.maxEvents ?? Infinity;
  const dense = options.denseOutput ?? false;
  const events: EventHit[] = [];

  const state = new Float64Array(state0);
  let t = 0;
  const next = new Float64Array(state.length);
  const probe = new Float64Array(state.length);
  let guard = 0;
  const guardMax = Math.ceil(options.maxTime / dt) + 16;

  while (t < options.maxTime && events.length < maxEvents && guard < guardMax) {
    guard += 1;
    const stepDt = Math.min(dt, options.maxTime - t);
    // `stateAt(tau)` evaluates the in-step trajectory at offset tau into `probe`.
    let stateAt: (tau: number) => StateVector;
    if (dense) {
      const denseStep = dormandPrince54StepDense(state, stepDt, rhs);
      next.set(denseStep.y);
      stateAt = (tau) => denseStep.interpolate(tau / stepDt, probe);
    } else {
      rk4Step(state, stepDt, rhs, next);
      stateAt = (tau) => rk4Step(state, tau, rhs, probe);
    }

    for (let s = 0; s < specs.length; s += 1) {
      const spec = specs[s]!;
      const g0 = spec.g(state);
      const g1 = spec.g(next);
      const dir = accepts(spec.direction, g0, g1);
      if (dir === 0) continue;
      const crossing = refineCrossing((tau) => spec.g(stateAt(tau)), 0, stepDt, g0, g1, { tol: rootTol });
      events.push({
        time: t + crossing.tAfter,
        eventIndex: s,
        label: spec.label,
        direction: dir,
        state: new Float64Array(stateAt(crossing.tAfter))
      });
      if (events.length >= maxEvents) break;
    }

    state.set(next);
    t += stepDt;
  }

  return { events, finalState: state, finalTime: t };
}
