import { describe, expect, it } from 'vitest';
import {
  conicalRate,
  SphericalPendulum,
  sphericalEnergy,
  sphericalLz,
  sphericalPosition,
  sphericalRhs,
  sphericalTension,
  type SphericalState
} from '../src/physics/spherical';

const params = { l: 1, g: 9.81, damping: 0 };

describe('spherical pendulum (true 3D dynamics)', () => {
  it('conserves energy and vertical angular momentum without damping', () => {
    const pendulum = new SphericalPendulum(params, [1.0, 0, 0.3, 1.5], 0.001);
    pendulum.step(10);
    const diag = pendulum.diagnostics();
    expect(diag.energyDrift).toBeLessThan(1e-7);
    expect(diag.lzDrift).toBeLessThan(1e-7);
    expect(diag.caveat).toContain('Conservative');
  });

  it('reduces to the planar pendulum when φ̇ = 0', () => {
    // With zero azimuthal momentum the motion stays in a vertical plane:
    // φ̇ remains 0 and θ follows the simple pendulum equation.
    const pendulum = new SphericalPendulum(params, [0.1, 0.7, 0, 0], 0.001);
    const period = 2 * Math.PI * Math.sqrt(params.l / params.g);
    pendulum.step(period);
    const [theta, phi, , phiDot] = pendulum.current();
    expect(phiDot).toBeCloseTo(0, 12);
    expect(phi).toBeCloseTo(0.7, 12);
    expect(theta).toBeCloseTo(0.1, 2); // back after one small-oscillation period
  });

  it('sustains a steady conical pendulum at the analytic rate', () => {
    const theta0 = 0.6;
    const rate = conicalRate(theta0, params);
    const pendulum = new SphericalPendulum(params, [theta0, 0, 0, rate], 0.001);
    pendulum.step(5);
    const [theta] = pendulum.current();
    // θ stays at the cone angle (the analytic equilibrium of the reduced potential).
    expect(theta).toBeCloseTo(theta0, 4);
    expect(pendulum.diagnostics().energyDrift).toBeLessThan(1e-8);
  });

  it('is genuinely three-dimensional: the trajectory leaves any single vertical plane', () => {
    const pendulum = new SphericalPendulum(params, [0.8, 0, 0, 1.2], 0.001);
    const positions: { x: number; z: number }[] = [];
    for (let i = 0; i < 200; i += 1) {
      pendulum.step(0.02);
      positions.push({ x: pendulum.position().x, z: pendulum.position().z });
    }
    // The azimuth sweeps: z changes sign and x-z direction rotates.
    expect(positions.some((p) => p.z > 0.05)).toBe(true);
    expect(positions.some((p) => p.z < -0.05)).toBe(true);
    const angles = positions.map((p) => Math.atan2(p.z, p.x));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(Math.PI / 2);
  });

  it('keeps the bob exactly on the sphere (chart-level constraint)', () => {
    const pendulum = new SphericalPendulum(params, [1.2, 0.5, 0.4, 0.9], 0.001);
    pendulum.step(3);
    expect(pendulum.diagnostics().constraintEnergyError).toBeLessThan(1e-12);
    const position = pendulum.position();
    expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(params.l, 12);
  });

  it('damping decays energy and flags the diagnostic caveat', () => {
    const pendulum = new SphericalPendulum({ ...params, damping: 0.3 }, [1.0, 0, 0.3, 1.5], 0.001);
    const e0 = sphericalEnergy(pendulum.current(), params);
    pendulum.step(6);
    expect(sphericalEnergy(pendulum.current(), params)).toBeLessThan(e0);
    expect(pendulum.diagnostics().caveat).toContain('Damping');
  });

  it('string-mode tension goes negative for over-the-top motion (rod-only regime)', () => {
    // Near the inverted pole with low speed a string could not hold the bob.
    const inverted: SphericalState = [3.0, 0, 0, 0];
    expect(sphericalTension(inverted, params)).toBeLessThan(0);
    // Hanging at rest: T = g.
    expect(sphericalTension([0, 0, 0, 0], params)).toBeCloseTo(params.g, 12);
  });

  it('rhs is regular at the pole and position maps correctly', () => {
    const atPole = sphericalRhs([0, 0, 0.5, 0.2], params);
    expect(atPole.every(Number.isFinite)).toBe(true);
    const position = sphericalPosition([Math.PI / 2, 0, 0, 0], params);
    expect(position.x).toBeCloseTo(1, 12);
    expect(position.y).toBeCloseTo(0, 12);
    expect(sphericalLz([Math.PI / 2, 0, 0, 2], params)).toBeCloseTo(2, 12);
  });
});
