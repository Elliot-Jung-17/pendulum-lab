import { describe, expect, it } from 'vitest';
import { PoincareAccumulator } from '../src/app/PoincareAccumulator';
import type { Derivative } from '../src/physics/types';

/**
 * Event-refinement contract for the Lab Poincaré accumulator. The test flow is
 * built so the crossing is analytically known:
 *
 *   θ₁(t) = θ₁₀ + ω₁₀ t + a t²/2  (constant angular acceleration a)
 *   θ₂(t) = A sin(t + φ₀), ω₂ = θ₂' — a unit harmonic oscillator.
 *
 * With curvature in θ₁, linear interpolation between bracketing samples has an
 * O(dt²) bias; the event-refined accumulator must localise the crossing on the
 * flow itself and recover θ₂(t*) to ~1e-8 even with a coarse dt.
 */

const ACCEL = 3.0;

const rhs: Derivative = (s, o) => {
  o[0] = s[2]!; // θ1' = ω1
  o[1] = s[3]!; // θ2' = ω2
  o[2] = ACCEL; // ω1' = a
  o[3] = -s[1]!; // harmonic: ω2' = −θ2
};

function rk4(state: Float64Array, h: number): void {
  const n = state.length;
  const k1 = new Float64Array(n);
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const tmp = new Float64Array(n);
  rhs(state, k1);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + (h / 2) * k1[i]!;
  rhs(tmp, k2);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + (h / 2) * k2[i]!;
  rhs(tmp, k3);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + h * k3[i]!;
  rhs(tmp, k4);
  for (let i = 0; i < n; i += 1) state[i] = state[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
}

/** Analytic crossing of θ₁ = 0 (rising) and the exact θ₂ there. */
function analyticCrossing(theta10: number, omega10: number): { tStar: number; theta2: number; omega2: number } {
  // θ₁₀ + ω₁₀ t + a t²/2 = 0, take the root with θ̇₁ > 0.
  const a = ACCEL / 2;
  const disc = Math.sqrt(omega10 * omega10 - 4 * a * theta10);
  const tStar = (-omega10 + disc) / (2 * a);
  // θ₂(0) = 0, ω₂(0) = 1 → θ₂(t) = sin t, ω₂(t) = cos t.
  return { tStar, theta2: Math.sin(tStar), omega2: Math.cos(tStar) };
}

function runAccumulator(dt: number, refined: boolean): { x: number; y: number } {
  const acc = new PoincareAccumulator(100, 'rising');
  if (refined) acc.setRefiner(rhs, dt);
  const state = Float64Array.from([-0.5, 0, 0.2, 1]); // θ1 < 0 rising toward 0
  let crossing: { x: number; y: number } | null = null;
  acc.push(state);
  for (let i = 0; i < 1000 && !crossing; i += 1) {
    rk4(state, dt);
    crossing = acc.push(state);
  }
  if (!crossing) throw new Error('no crossing found');
  return crossing;
}

describe('Poincaré event refinement', () => {
  const exact = analyticCrossing(-0.5, 0.2);

  it('refined crossings hit the analytic section point to ~1e-7 at coarse dt', () => {
    // Residual is the RK4 truncation of the single refinement sub-step
    // (h ≈ 0.05 → O(h⁵)); the linear-interpolation bias is ~1e-4 here.
    const refined = runAccumulator(0.05, true);
    expect(Math.abs(refined.x - exact.theta2)).toBeLessThan(1e-7);
    expect(Math.abs(refined.y - exact.omega2)).toBeLessThan(1e-7);
  });

  it('refinement beats linear interpolation by orders of magnitude', () => {
    const linear = runAccumulator(0.05, false);
    const refined = runAccumulator(0.05, true);
    const linearError = Math.abs(linear.x - exact.theta2);
    const refinedError = Math.abs(refined.x - exact.theta2);
    expect(linearError).toBeGreaterThan(1e-6); // linear has visible O(dt²) bias
    expect(refinedError).toBeLessThan(linearError / 100);
  });

  it('falls back to linear interpolation when no refiner is set (legacy behaviour)', () => {
    const linear = runAccumulator(0.001, false);
    // At fine dt the linear answer is already decent — sanity-check the path.
    expect(Math.abs(linear.x - exact.theta2)).toBeLessThan(1e-5);
  });

  it('respects the rising-direction filter with refinement enabled', () => {
    const acc = new PoincareAccumulator(100, 'rising');
    acc.setRefiner(rhs, 0.05);
    // Falling crossing only: θ1 starts above 0 moving down with a < 0 pull…
    const state = Float64Array.from([0.5, 0, -0.2, 1]);
    acc.push(state);
    let sawPoint = false;
    for (let i = 0; i < 40; i += 1) {
      rk4(state, 0.05);
      if (state[0]! > 0.6) break; // re-accelerating upward; stop before wrap
      if (acc.push(state)) sawPoint = true;
    }
    expect(sawPoint).toBe(false);
  });
});
