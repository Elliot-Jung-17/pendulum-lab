import { describe, expect, it } from 'vitest';
import {
  SINE_GORDON_KINK_REST_ENERGY,
  breatherEnergy,
  createKinkAntikinkField,
  createSineGordonField,
  frenkelKontorovaEnergy,
  kinkCenter,
  kinkEnergy,
  kinkMomentum,
  peierlsNabarroBarrier,
  relaxFrenkelKontorovaKink,
  sineGordonBreather,
  sineGordonDispersion,
  sineGordonFieldEnergy,
  sineGordonGroupVelocity,
  sineGordonKink,
  sineGordonKinkPositions,
  sineGordonKinkRate,
  sineGordonResidual,
  stepSineGordon,
  topologicalCharge
} from '../src/physics/sineGordon';

describe('sine-Gordon analytic solitons', () => {
  it('the moving kink satisfies u_tt - u_xx + sin u = 0', () => {
    const params = { velocity: 0.3, center: 1.5, sign: 1 as const };
    const u = (x: number, t: number) => sineGordonKink(x, t, params);
    let worst = 0;
    for (const x of [-3, -1, 0, 1.5, 2, 4]) {
      for (const t of [0, 0.7, 1.3]) {
        worst = Math.max(worst, Math.abs(sineGordonResidual(u, x, t)));
      }
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('the antikink satisfies the equation and carries charge -1', () => {
    const params = { velocity: -0.5, sign: -1 as const };
    const u = (x: number, t: number) => sineGordonKink(x, t, params);
    expect(Math.abs(sineGordonResidual(u, 0.4, 0.2))).toBeLessThan(1e-4);

    const n = 4001;
    const dx = 0.02;
    const field = new Float64Array(n);
    for (let i = 0; i < n; i += 1) field[i] = sineGordonKink(-40 + i * dx, 0, params);
    expect(topologicalCharge(field)).toBeCloseTo(-1, 3);
  });

  it('the kink carries charge +1 over a wide window', () => {
    const params = { velocity: 0, sign: 1 as const };
    const n = 4001;
    const dx = 0.02;
    const field = new Float64Array(n);
    for (let i = 0; i < n; i += 1) field[i] = sineGordonKink(-40 + i * dx, 0, params);
    expect(topologicalCharge(field)).toBeCloseTo(1, 3);
  });

  it('the breather satisfies the equation', () => {
    const params = { omega: 0.6 };
    const u = (x: number, t: number) => sineGordonBreather(x, t, params);
    let worst = 0;
    for (const x of [-2, -0.5, 0.5, 2]) {
      for (const t of [0.1, 1.0, 2.3]) {
        worst = Math.max(worst, Math.abs(sineGordonResidual(u, x, t)));
      }
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('reproduces the relativistic kink energy-momentum relation E^2 - P^2 = 64', () => {
    expect(kinkEnergy(0)).toBeCloseTo(SINE_GORDON_KINK_REST_ENERGY, 12);
    for (const v of [0.2, 0.5, 0.8, -0.6]) {
      const e = kinkEnergy(v);
      const p = kinkMomentum(v);
      expect(e * e - p * p).toBeCloseTo(64, 9);
    }
  });

  it('the static-kink energy density integrates to the rest energy 8', () => {
    // E = ∫ [½ u_x² + (1 − cos u)] dx for the v = 0 kink, via the trapezoid rule.
    const params = { velocity: 0, sign: 1 as const };
    const dx = 0.005;
    const half = 30;
    const n = Math.round((2 * half) / dx) + 1;
    let energy = 0;
    let prevDensity = 0;
    for (let i = 0; i < n; i += 1) {
      const x = -half + i * dx;
      const ux = (sineGordonKink(x + dx, 0, params) - sineGordonKink(x - dx, 0, params)) / (2 * dx);
      const u = sineGordonKink(x, 0, params);
      const density = 0.5 * ux * ux + (1 - Math.cos(u));
      if (i > 0) energy += 0.5 * (density + prevDensity) * dx;
      prevDensity = density;
    }
    expect(energy).toBeCloseTo(8, 3);
  });

  it('the breather energy interpolates between 0 and 2·E_rest', () => {
    expect(breatherEnergy(0.999)).toBeLessThan(1);
    expect(breatherEnergy(0.01)).toBeGreaterThan(15);
    expect(breatherEnergy(0.6)).toBeCloseTo(16 * Math.sqrt(1 - 0.36), 12);
  });
});

describe('sine-Gordon dispersion', () => {
  it('is the massive Klein-Gordon band omega = sqrt(1 + k^2)', () => {
    expect(sineGordonDispersion(0)).toBeCloseTo(1, 12); // gap at k = 0
    expect(sineGordonDispersion(2)).toBeCloseTo(Math.sqrt(5), 12);
    // group velocity → 1 (the wave speed) as k grows, 0 at the band edge.
    expect(sineGordonGroupVelocity(0)).toBeCloseTo(0, 12);
    expect(sineGordonGroupVelocity(1000)).toBeGreaterThan(0.999);
    expect(sineGordonGroupVelocity(1000)).toBeLessThan(1);
  });
});

describe('sine-Gordon leapfrog field integrator', () => {
  it('propagates a launched kink at its velocity, conserving charge and energy', () => {
    const v = 0.4;
    const params = { velocity: v, center: 10, sign: 1 as const };
    const points = 400;
    const length = 40;
    const grid = createSineGordonField({
      points,
      length,
      dt: 0.04,
      boundary: 'fixed',
      initial: (x) => sineGordonKink(x, 0, params),
      initialRate: (x) => sineGordonKinkRate(x, 0, params)
    });

    const energy0 = sineGordonFieldEnergy(grid);
    const center0 = kinkCenter(grid);
    expect(center0).toBeCloseTo(10, 1);

    const tEnd = 10;
    const steps = Math.round(tEnd / grid.dt);
    for (let s = 0; s < steps; s += 1) stepSineGordon(grid);

    const centerEnd = kinkCenter(grid);
    // Analytic centre at t = 10 is 10 + v·t = 14.
    expect(centerEnd).toBeCloseTo(10 + v * tEnd, 0);

    const fullCharge = topologicalCharge(grid.u);
    expect(fullCharge).toBeCloseTo(1, 1);

    const energyEnd = sineGordonFieldEnergy(grid);
    const drift = Math.abs(energyEnd - energy0) / energy0;
    expect(drift).toBeLessThan(0.02);
  });
});

describe('Frenkel-Kontorova kink & Peierls-Nabarro barrier', () => {
  it('relaxes a single kink to a stationary point with charge +1', () => {
    const relaxed = relaxFrenkelKontorovaKink(3, { sites: 81 });
    expect(relaxed.charge).toBeCloseTo(1, 9);
    expect(relaxed.gradNorm).toBeLessThan(1e-10); // Newton reaches machine precision
    // The relaxed configuration sits below a coarse step-function seed.
    const seed = new Float64Array(81);
    for (let i = 0; i < 81; i += 1) seed[i] = i < 40 ? 0 : 2 * Math.PI;
    expect(relaxed.energy).toBeLessThan(frenkelKontorovaEnergy(seed, 3));
  });

  it('the Peierls-Nabarro barrier is positive and shrinks (exponentially) as coupling grows', () => {
    const weak = peierlsNabarroBarrier(1, { sites: 121 });
    const strong = peierlsNabarroBarrier(3, { sites: 121 });
    // Site-centred kink (an atom on the substrate peak) is the saddle, the
    // bond-centred kink the minimum → a positive depinning barrier.
    expect(weak.siteEnergy).toBeGreaterThan(weak.bondEnergy);
    expect(weak.barrier).toBeGreaterThan(0);
    expect(strong.barrier).toBeGreaterThan(0);
    // The continuum limit (large K) restores translational freedom → smaller barrier.
    expect(strong.barrier).toBeLessThan(weak.barrier);
  });

  it('the kink rate matches the time derivative of the kink', () => {
    const params = { velocity: 0.35, center: 0, sign: 1 as const };
    const h = 1e-5;
    for (const x of [-1, 0, 1, 2]) {
      const numeric = (sineGordonKink(x, h, params) - sineGordonKink(x, -h, params)) / (2 * h);
      expect(sineGordonKinkRate(x, 0, params)).toBeCloseTo(numeric, 6);
    }
  });
});

describe('sine-Gordon kink–antikink collision', () => {
  it('builds a charge-0 pair that collides with the topological charge protected', () => {
    const grid = createKinkAntikinkField({ points: 1000, length: 60, dt: 0.025, separation: 12, velocity: 0.4 });

    // Initial state: a clean kink+antikink bump on the u = 0 vacuum.
    expect(topologicalCharge(grid.u)).toBeCloseTo(0, 6);
    const start = sineGordonKinkPositions(grid);
    expect(start.length).toBe(2); // two solitons
    expect(start[0]!).toBeCloseTo(18, 0);
    expect(start[1]!).toBeCloseTo(42, 0);
    let maxU = 0;
    for (const v of grid.u) maxU = Math.max(maxU, v);
    expect(maxU).toBeGreaterThan(2 * Math.PI - 0.5); // the 2π bump is present

    const energy0 = sineGordonFieldEnergy(grid);
    let minSeparation = Infinity;
    let maxAbsCharge = 0;
    let maxDrift = 0;
    const steps = Math.round(42 / grid.dt); // through the collision near t ≈ 30
    for (let s = 0; s < steps; s += 1) {
      stepSineGordon(grid);
      if (s % 8 === 0) {
        const pos = sineGordonKinkPositions(grid);
        if (pos.length === 2) minSeparation = Math.min(minSeparation, Math.abs((pos[1] ?? 0) - (pos[0] ?? 0)));
        maxAbsCharge = Math.max(maxAbsCharge, Math.abs(topologicalCharge(grid.u)));
        maxDrift = Math.max(maxDrift, Math.abs(sineGordonFieldEnergy(grid) - energy0) / Math.abs(energy0));
      }
    }

    // The net topological charge is exactly conserved (the solitons cannot
    // annihilate — they are topologically protected): charge stays 0 throughout.
    expect(maxAbsCharge).toBeLessThan(1e-9);
    // The solitons actually collide (close to within a couple of grid widths).
    expect(minSeparation).toBeLessThan(3);
    // Energy is conserved through the collision; the violent overlap excites
    // short-wavelength modes, so a per-mille-to-percent drift at this resolution
    // is the documented numerical reality, not annihilation.
    expect(maxDrift).toBeLessThan(0.02);
  });
});
