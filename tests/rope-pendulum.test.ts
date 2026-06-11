import { describe, expect, it } from 'vitest';
import { RopePendulum } from '../src/physics/rope';

const params = { l: 1, g: 9.81, damping: 0 };

describe('rope pendulum (taut/slack hybrid)', () => {
  it('matches the rigid pendulum for small oscillations (string stays taut)', () => {
    const rope = new RopePendulum(params, 0.1, 0);
    const period = 2 * Math.PI * Math.sqrt(params.l / params.g);
    let minTension = Infinity;
    const steps = 400;
    for (let i = 0; i < steps; i += 1) {
      rope.step(period / steps);
      minTension = Math.min(minTension, rope.tension());
      expect(rope.currentPhase()).toBe('taut');
    }
    // After one small-oscillation period the bob is back near θ ≈ 0.1.
    expect(rope.snapshot().theta).toBeCloseTo(0.1, 2);
    // Tension stays near g (small oscillation) and never approaches zero.
    expect(minTension).toBeGreaterThan(0.9 * params.g);
  });

  it('conserves energy in the undamped taut phase', () => {
    const rope = new RopePendulum(params, 1.2, 0);
    const e0 = rope.energy();
    rope.step(5);
    expect(rope.currentPhase()).toBe('taut'); // 1.2 rad swing keeps T > 0
    expect(Math.abs(rope.energy() - e0)).toBeLessThan(1e-6 * Math.max(1, Math.abs(e0)));
  });

  it('goes slack above the horizontal with insufficient speed and reports zero tension', () => {
    const rope = new RopePendulum(params, 2.5, 0); // above horizontal, at rest
    expect(rope.currentPhase()).toBe('slack'); // g·cos(2.5) < 0 immediately
    expect(rope.tension()).toBe(0);
    expect(rope.warning()).toContain('SLACK');
    expect(rope.events[0]!.type).toBe('slack');
  });

  it('free flight stays inside the circle and is recaptured at |r| = l with energy loss', () => {
    const rope = new RopePendulum(params, 2.5, 0);
    let captured = false;
    for (let i = 0; i < 4000 && !captured; i += 1) {
      rope.step(0.002);
      const snapshot = rope.snapshot();
      if (rope.currentPhase() === 'slack') {
        expect(Math.hypot(snapshot.x, snapshot.y)).toBeLessThanOrEqual(params.l + 1e-6);
      } else {
        captured = true;
      }
    }
    expect(captured).toBe(true);
    const capture = rope.events.find((event) => event.type === 'capture');
    expect(capture).toBeTruthy();
    // Inelastic capture destroys radial kinetic energy.
    expect(capture!.energyLoss).toBeGreaterThan(0);
    // Constraint exactly restored.
    const snapshot = rope.snapshot();
    expect(Math.hypot(snapshot.x, snapshot.y)).toBeCloseTo(params.l, 9);
  });

  it('total energy never increases across the hybrid evolution (γ = 0)', () => {
    const rope = new RopePendulum(params, 2.8, 0.5);
    let previous = rope.energy();
    for (let i = 0; i < 3000; i += 1) {
      rope.step(0.002);
      const energy = rope.energy();
      expect(energy).toBeLessThanOrEqual(previous + 1e-7);
      previous = energy;
    }
  });

  it('warns when tension approaches zero before release', () => {
    // Start just below the release angle with no speed: T = g cosθ small.
    const rope = new RopePendulum(params, Math.PI / 2 - 0.02, 0);
    expect(rope.currentPhase()).toBe('taut');
    expect(rope.warning()).toContain('Tension near zero');
  });

  it('fast whirling keeps the string taut even upside down', () => {
    // ω² l > g at the top keeps T > 0 throughout the loop.
    const omega0 = Math.sqrt((5.2 * params.g) / params.l);
    const rope = new RopePendulum(params, 0, omega0);
    for (let i = 0; i < 2000; i += 1) {
      rope.step(0.002);
      expect(rope.currentPhase()).toBe('taut');
    }
  });

  it('damped rope dissipates energy', () => {
    const rope = new RopePendulum({ ...params, damping: 0.4 }, 1.4, 0);
    const e0 = rope.energy();
    rope.step(6);
    expect(rope.energy()).toBeLessThan(e0 - 0.5);
  });
});
