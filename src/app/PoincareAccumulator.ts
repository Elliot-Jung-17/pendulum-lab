import type { Point2D } from '../viz/poincare';

/**
 * Collects Poincaré-section points for the Lab panel. The section condition is a
 * rising zero-crossing of θ₁ (θ₁ = 0, θ̇₁ > 0); at each crossing it records
 * (θ₂, ω₂), linearly interpolated to the crossing instant for sub-step accuracy.
 *
 * Feed it the full state each integration step via `push`. State layout matches
 * the engine: [θ1, θ2, ω1, ω2, …].
 */
export class PoincareAccumulator {
  private readonly points: Point2D[] = [];
  private prev: Float64Array | null = null;
  private readonly cap: number;
  private readonly direction: 'rising' | 'falling' | 'both';

  constructor(cap = 4000, direction: 'rising' | 'falling' | 'both' = 'rising') {
    this.cap = Math.max(1, cap);
    this.direction = direction;
  }

  /** Number of recorded section points. */
  get size(): number {
    return this.points.length;
  }

  list(): readonly Point2D[] {
    return this.points;
  }

  clear(): void {
    this.points.length = 0;
    this.prev = null;
  }

  /**
   * Push one state. Returns the new section point when this step crossed the
   * section, otherwise null.
   */
  push(state: ArrayLike<number>): Point2D | null {
    const t1 = Number(state[0] ?? 0);
    const w1 = Number(state[2] ?? 0);
    const previous = this.prev;
    // Store a copy for the next comparison.
    this.prev = Float64Array.from(state as ArrayLike<number>);

    if (!previous) return null;
    const t1Prev = previous[0]!;
    // Accept either direction; strict direction filters live in research UI.
    // Rising crossing of θ1 = 0 (θ̇1 > 0): previous below 0, current at/above 0.
    const rising = t1Prev < 0 && t1 >= 0 && w1 > 0;
    const falling = t1Prev > 0 && t1 <= 0 && w1 < 0;
    if (this.direction === 'rising' && !rising) return null;
    if (this.direction === 'falling' && !falling) return null;
    if (this.direction === 'both' && !rising && !falling) return null;

    // Linear interpolation factor to the zero crossing.
    const denom = t1 - t1Prev;
    const frac = denom === 0 ? 0 : -t1Prev / denom;
    const t2 = previous[1]! + frac * (Number(state[1] ?? 0) - previous[1]!);
    const w2 = previous[3]! + frac * (Number(state[3] ?? 0) - previous[3]!);

    const point: Point2D = { x: t2, y: w2 };
    this.points.push(point);
    if (this.points.length > this.cap) this.points.splice(0, this.points.length - this.cap);
    return point;
  }
}
