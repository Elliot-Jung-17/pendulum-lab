import type { Derivative } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { mulberry32 } from '../chaos/variational';

/**
 * Incremental maximal-Lyapunov estimator (Benettin two-trajectory method) for
 * the live Lab λ panel. A shadow trajectory is integrated alongside the
 * reference; every `renormEvery` steps their separation is measured, its log
 * growth accumulated, and the shadow rescaled back to the initial separation.
 *
 * Unlike the batch `maximalLyapunov`, this version is driven one step at a time
 * by whatever loop owns the reference trajectory, so it produces a running
 * estimate and convergence curve in real time.
 */
export class LyapunovEstimator {
  private readonly shadow: Float64Array;
  private readonly out: Float64Array;
  private readonly convergence: number[] = [];
  private logSum = 0;
  private elapsed = 0;
  private counter = 0;
  private started = false;

  constructor(
    private readonly rhs: Derivative,
    private readonly dim: number,
    private readonly dt: number,
    private readonly d0 = 1e-8,
    private readonly renormEvery = 10,
    private readonly seed = 0x9e37
  ) {
    this.shadow = new Float64Array(dim);
    this.out = new Float64Array(dim);
  }

  /** Seed the shadow a distance d0 from the reference along a random direction. */
  reset(reference: ArrayLike<number>): void {
    const rng = mulberry32(this.seed);
    const dir = new Float64Array(this.dim);
    let norm = 0;
    for (let i = 0; i < this.dim; i += 1) {
      const v = rng() - 0.5;
      dir[i] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dim; i += 1) this.shadow[i] = Number(reference[i] ?? 0) + (this.d0 / norm) * dir[i]!;
    this.logSum = 0;
    this.elapsed = 0;
    this.counter = 0;
    this.convergence.length = 0;
    this.started = true;
  }

  /** Advance the shadow one reference step; renormalize on schedule. */
  step(reference: ArrayLike<number>): void {
    if (!this.started) this.reset(reference);
    rk4Step(this.shadow, this.dt, this.rhs, this.out);
    this.shadow.set(this.out);
    this.counter += 1;
    if (this.counter < this.renormEvery) return;
    this.counter = 0;

    let d = 0;
    for (let i = 0; i < this.dim; i += 1) {
      const diff = this.shadow[i]! - Number(reference[i] ?? 0);
      d += diff * diff;
    }
    d = Math.sqrt(d);
    if (d <= 0) return;
    this.logSum += Math.log(d / this.d0);
    this.elapsed += this.renormEvery * this.dt;
    this.convergence.push(this.logSum / this.elapsed);
    const scale = this.d0 / d;
    for (let i = 0; i < this.dim; i += 1) {
      const ref = Number(reference[i] ?? 0);
      this.shadow[i] = ref + scale * (this.shadow[i]! - ref);
    }
  }

  /** Current running estimate of the maximal Lyapunov exponent. */
  value(): number {
    return this.elapsed > 0 ? this.logSum / this.elapsed : 0;
  }

  /** Convergence curve (one entry per renormalization). */
  history(): readonly number[] {
    return this.convergence;
  }
}
