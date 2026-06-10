import type { Derivative, StateVector } from './types';
import { rk4Step } from './integrators';

/**
 * Event-detection solver. Integrates a system while watching scalar event
 * functions g(state); whenever one crosses zero it bisects inside the step to
 * locate the crossing time and state to a requested tolerance. This is the
 * primitive behind Poincare sections, period measurement, and apex/return
 * detection.
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
  /** Bisection tolerance on the crossing time. */
  rootTol?: number;
  /** Stop after this many events (default: unbounded until maxTime). */
  maxEvents?: number;
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

/** State reached by advancing `from` by a single RK4 step of size tau. */
function advance(from: StateVector, tau: number, rhs: Derivative): StateVector {
  const out = new Float64Array(from.length);
  rk4Step(from, tau, rhs, out);
  return out;
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
  const events: EventHit[] = [];

  let state = new Float64Array(state0);
  let t = 0;
  const next = new Float64Array(state.length);
  let guard = 0;
  const guardMax = Math.ceil(options.maxTime / dt) + 16;

  while (t < options.maxTime && events.length < maxEvents && guard < guardMax) {
    guard += 1;
    const stepDt = Math.min(dt, options.maxTime - t);
    rk4Step(state, stepDt, rhs, next);

    for (let s = 0; s < specs.length; s += 1) {
      const spec = specs[s]!;
      const g0 = spec.g(state);
      const g1 = spec.g(next);
      const dir = accepts(spec.direction, g0, g1);
      if (dir === 0) continue;
      // Bisect in tau within [0, stepDt] to locate the crossing.
      let lo = 0;
      let hi = stepDt;
      let gLo = g0;
      let crossState: StateVector = next;
      while (hi - lo > rootTol) {
        const mid = 0.5 * (lo + hi);
        const midState = advance(state, mid, rhs);
        const gMid = spec.g(midState);
        if (gMid === 0 || (gLo < 0 ? gMid < 0 : gMid > 0)) {
          lo = mid;
          gLo = gMid;
        } else {
          hi = mid;
          crossState = midState;
        }
      }
      events.push({
        time: t + hi,
        eventIndex: s,
        label: spec.label,
        direction: dir,
        state: new Float64Array(crossState)
      });
      if (events.length >= maxEvents) break;
    }

    state.set(next);
    t += stepDt;
  }

  return { events, finalState: state, finalTime: t };
}
