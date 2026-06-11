/**
 * Rope / string pendulum: a bob on an inextensible *string* of length l.
 * Unlike a rigid rod, a string can only pull. The dynamics is a hybrid system:
 *
 *  - TAUT phase (constraint active): standard pendulum ODE in (θ, ω) with
 *    string tension per unit mass T/m = g·cosθ + l·ω². The phase is valid
 *    while T ≥ 0.
 *  - SLACK phase (constraint inactive): when T would go negative the string
 *    folds; the bob is a projectile in (x, y) with the same linear drag.
 *  - CAPTURE event: when the slack bob reaches |r| = l moving outward, the
 *    string snaps taut. The radial velocity component is destroyed (perfectly
 *    inextensible, inelastic capture — kinetic energy drops), the tangential
 *    component continues as l·ω.
 *
 * Angle convention: θ from the downward vertical; x = l·sinθ, y = −l·cosθ.
 */

export type RopePhase = 'taut' | 'slack';

export interface RopeParams {
  /** String length (m). */
  l: number;
  /** Gravity (m/s²). */
  g: number;
  /** Linear damping coefficient γ (1/s) applied in both phases. */
  damping: number;
}

export interface RopeStateSnapshot {
  phase: RopePhase;
  theta: number;
  omega: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  time: number;
  /** Tension per unit mass (N/kg); exactly 0 while slack. */
  tension: number;
  /** Total mechanical energy per unit mass. */
  energy: number;
  /** | |r| − l | — only meaningful approaching capture; 0 when taut. */
  constraintError: number;
}

export interface RopeEvent {
  type: 'slack' | 'capture';
  time: number;
  /** Energy lost at the event (J/kg); > 0 only for capture. */
  energyLoss: number;
}

export class RopePendulum {
  private phase: RopePhase = 'taut';
  private theta: number;
  private omega: number;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private time = 0;
  readonly events: RopeEvent[] = [];

  constructor(readonly params: RopeParams, theta0: number, omega0 = 0) {
    this.theta = theta0;
    this.omega = omega0;
    // A string cannot support negative tension even at t = 0.
    if (this.tautTension() < 0) this.releaseToSlack();
  }

  /** Tension per unit mass in the taut phase: T/m = g·cosθ + l·ω². */
  private tautTension(): number {
    return this.params.g * Math.cos(this.theta) + this.params.l * this.omega * this.omega;
  }

  tension(): number {
    return this.phase === 'taut' ? Math.max(0, this.tautTension()) : 0;
  }

  currentPhase(): RopePhase {
    return this.phase;
  }

  position(): { x: number; y: number } {
    if (this.phase === 'slack') return { x: this.x, y: this.y };
    return { x: this.params.l * Math.sin(this.theta), y: -this.params.l * Math.cos(this.theta) };
  }

  velocity(): { vx: number; vy: number } {
    if (this.phase === 'slack') return { vx: this.vx, vy: this.vy };
    return {
      vx: this.params.l * this.omega * Math.cos(this.theta),
      vy: this.params.l * this.omega * Math.sin(this.theta)
    };
  }

  energy(): number {
    const { x, y } = this.position();
    const { vx, vy } = this.velocity();
    return 0.5 * (vx * vx + vy * vy) + this.params.g * y;
  }

  constraintError(): number {
    if (this.phase === 'taut') return 0;
    return Math.abs(Math.hypot(this.x, this.y) - this.params.l);
  }

  /** Human-readable warning when the string model is near its validity edge. */
  warning(): string | null {
    if (this.phase === 'slack') return 'String is SLACK — bob in free flight; constraint inactive.';
    const tension = this.tautTension();
    if (tension < 0.05 * this.params.g) return `Tension near zero (${tension.toFixed(3)} N/kg) — string about to go slack.`;
    return null;
  }

  private releaseToSlack(): void {
    const { x, y } = this.position();
    const { vx, vy } = this.velocity();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.phase = 'slack';
    this.events.push({ type: 'slack', time: this.time, energyLoss: 0 });
  }

  private captureToTaut(): void {
    const r = Math.hypot(this.x, this.y) || this.params.l;
    // Clamp onto the circle and keep only the tangential velocity.
    const ux = this.x / r;
    const uy = this.y / r;
    const before = this.energy();
    this.x = ux * this.params.l;
    this.y = uy * this.params.l;
    this.theta = Math.atan2(this.x, -this.y);
    const tx = Math.cos(this.theta);
    const ty = Math.sin(this.theta);
    const vTangential = this.vx * tx + this.vy * ty;
    this.omega = vTangential / this.params.l;
    this.phase = 'taut';
    const after = this.energy();
    this.events.push({ type: 'capture', time: this.time, energyLoss: Math.max(0, before - after) });
  }

  /** Advance by dt (internally split into RK4 substeps no larger than 2 ms). */
  step(dt: number): void {
    let remaining = dt;
    const maxSub = 0.002;
    while (remaining > 1e-12) {
      const h = Math.min(maxSub, remaining);
      remaining -= h;
      if (this.phase === 'taut') this.stepTaut(h);
      else this.stepSlack(h);
      this.time += h;
    }
  }

  private stepTaut(h: number): void {
    const { g, l, damping } = this.params;
    const accel = (theta: number, omega: number): number => -(g / l) * Math.sin(theta) - damping * omega;
    const k1t = this.omega;
    const k1w = accel(this.theta, this.omega);
    const k2t = this.omega + (h / 2) * k1w;
    const k2w = accel(this.theta + (h / 2) * k1t, this.omega + (h / 2) * k1w);
    const k3t = this.omega + (h / 2) * k2w;
    const k3w = accel(this.theta + (h / 2) * k2t, this.omega + (h / 2) * k2w);
    const k4t = this.omega + h * k3w;
    const k4w = accel(this.theta + h * k3t, this.omega + h * k3w);
    this.theta += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    this.omega += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    if (this.tautTension() < 0) this.releaseToSlack();
  }

  private stepSlack(h: number): void {
    const { g, damping } = this.params;
    const ax = (vx: number): number => -damping * vx;
    const ay = (vy: number): number => -g - damping * vy;
    // RK4 for the linear-drag projectile.
    const k1 = { x: this.vx, y: this.vy, vx: ax(this.vx), vy: ay(this.vy) };
    const k2 = { x: this.vx + (h / 2) * k1.vx, y: this.vy + (h / 2) * k1.vy, vx: ax(this.vx + (h / 2) * k1.vx), vy: ay(this.vy + (h / 2) * k1.vy) };
    const k3 = { x: this.vx + (h / 2) * k2.vx, y: this.vy + (h / 2) * k2.vy, vx: ax(this.vx + (h / 2) * k2.vx), vy: ay(this.vy + (h / 2) * k2.vy) };
    const k4 = { x: this.vx + h * k3.vx, y: this.vy + h * k3.vy, vx: ax(this.vx + h * k3.vx), vy: ay(this.vy + h * k3.vy) };
    this.x += (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
    this.y += (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
    this.vx += (h / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
    this.vy += (h / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);
    const r = Math.hypot(this.x, this.y);
    const radialOutward = (this.x * this.vx + this.y * this.vy) / (r || 1);
    if (r >= this.params.l && radialOutward > 0) this.captureToTaut();
  }

  snapshot(): RopeStateSnapshot {
    const { x, y } = this.position();
    const { vx, vy } = this.velocity();
    return {
      phase: this.phase,
      theta: this.theta,
      omega: this.omega,
      x,
      y,
      vx,
      vy,
      time: this.time,
      tension: this.tension(),
      energy: this.energy(),
      constraintError: this.constraintError()
    };
  }
}
