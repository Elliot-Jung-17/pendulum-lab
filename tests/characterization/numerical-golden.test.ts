import { beforeAll, describe, expect, test } from 'vitest';
import fixture from './numerical-golden.fixture.json';
import { goldenInputs, observeNumericalGolden, observeStochasticGolden } from './numerical-golden-cases';
import { createDoublePendulumDerivative } from '../../src/physics/double';
import { createCompoundDoublePendulumDerivative } from '../../src/physics/compoundDouble';
import { eulerStep, rk4Step } from '../../src/physics/integrators';
import { eulerMaruyamaStep, gaussianSampler } from '../../src/physics/stochastic';
import { fftInPlace, ifftInPlace } from '../../src/physics/fft';
import { standardMapStep } from '../../src/physics/standardMap';

type Tolerance = { absolute: number; relative: number };

/** Compare every key/element; additions, truncation and nonfinite results fail. */
function expectGolden(actual: unknown, expected: unknown, tolerance: Tolerance, path: string): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    if (typeof actual !== 'number') throw new Error(`${path}: expected a number`);
    expect(Number.isFinite(actual), path).toBe(true);
    expect(Number.isFinite(expected), `${path}: fixture must be finite`).toBe(true);
    expect(Math.abs(actual - expected), path).toBeLessThanOrEqual(
      tolerance.absolute + tolerance.relative * Math.abs(expected)
    );
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    if (!Array.isArray(actual)) throw new Error(`${path}: expected an array`);
    expect(actual.length, `${path}.length`).toBe(expected.length);
    expected.forEach((value, index) => expectGolden(actual[index], value, tolerance, `${path}[${index}]`));
  } else if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', path).toBe(true);
    if (actual === null || typeof actual !== 'object') throw new Error(`${path}: expected an object`);
    const actualRecord = actual as Record<string, unknown>;
    expect(Object.keys(actualRecord).sort(), `${path}: keys`).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expectGolden(actualRecord[key], value, tolerance, `${path}.${key}`);
    }
  } else {
    expect(actual, path).toBe(expected);
  }
}

describe('S01 fixed numerical characterization (existing production engine)', () => {
  let actual: ReturnType<typeof observeNumericalGolden>;
  beforeAll(() => {
    actual = observeNumericalGolden();
  });

  test('keeps the captured inputs, tolerances, source provenance and state units explicit', () => {
    expect(fixture.schema).toBe('pendulum-redesign/numerical-golden/v1');
    expect(fixture.inputs).toEqual(goldenInputs);
    expect(fixture.provenance.repositoryCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(Object.keys(fixture.provenance.sourceSha256)).toHaveLength(13);
    for (const hash of Object.values(fixture.provenance.sourceSha256)) expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.units.planarState).toEqual(['rad', 'rad', 'rad/s', 'rad/s']);
    expect(fixture.tolerance.numeric).toEqual({ absolute: 1e-11, relative: 1e-10 });
    expect(fixture.tolerance.poincare).toEqual({ absolute: 2e-8, relative: 1e-9 });
  });

  test.each(['double', 'compound'] as const)('%s preserves sampled state, RHS and energy', (model) => {
    expectGolden(actual[model], fixture.expected[model], fixture.tolerance.numeric, model);
    // A replay value alone is not a conservation check: enforce a separate bound.
    expect(actual[model].maxAbsoluteEnergyDrift).toBeLessThan(1e-8);
    for (const sample of actual[model].snapshots) {
      expect(sample.energy.KE).toBeGreaterThanOrEqual(0);
      expect(sample.energy.total).toBeCloseTo(sample.energy.KE + sample.energy.PE, 12);
    }
  });

  test('seeded Langevin path and cached normal stream preserve their fixed outputs', () => {
    expectGolden(actual.stochastic, fixture.expected.stochastic, fixture.tolerance.numeric, 'stochastic');
    expect(observeStochasticGolden()).toEqual(actual.stochastic);
    expect(observeStochasticGolden(goldenInputs.stochastic.seed + 1).snapshots.at(-1)?.state).not.toEqual(
      actual.stochastic.snapshots.at(-1)?.state
    );
  });

  test('standard map preserves wrapped angle, unwrapped momentum and iteration order', () => {
    expectGolden(actual.standardMap, fixture.expected.standardMap, fixture.tolerance.numeric, 'standardMap');
    for (const snapshot of actual.standardMap) {
      expect(snapshot.theta).toBeGreaterThanOrEqual(0);
      expect(snapshot.theta).toBeLessThan(2 * Math.PI);
    }
  });

  test.each(['fft', 'rqa'] as const)('%s preserves fixed analysis results of the double trajectory', (analysis) => {
    expectGolden(actual.analysis[analysis], fixture.expected.analysis[analysis], fixture.tolerance.numeric, analysis);
  });

  test('Poincare preserves four refined crossings, times, directions and certification metadata', () => {
    const section = actual.analysis.poincare;
    expectGolden(section, fixture.expected.analysis.poincare, fixture.tolerance.poincare, 'poincare');
    expect(section.points).toHaveLength(4);
    section.points.forEach((point, index) => {
      // eventLocator defines rootTol in seconds (bracket width), not radians.
      expect(section.rootBracketWidths[index]).toBeLessThanOrEqual(goldenInputs.poincare.rootTol);
      expect(section.rootResiduals[index]).toBe(Math.abs(point[0]!));
      expect(Math.abs(point[0]!)).toBeLessThan(1e-8);
      expect(Math.sign(point[2]!)).toBe(section.directions[index]);
      if (index > 0) expect(section.times[index]).toBeGreaterThan(section.times[index - 1]!);
    });
  });

  test.each(['double', 'compound'] as const)('%s preserves the rest equilibrium and rejects invalid mass', (model) => {
    const createDerivative =
      model === 'double' ? createDoublePendulumDerivative : createCompoundDoublePendulumDerivative;
    const derivative = createDerivative(goldenInputs.planar.parameters, 0);
    const rest = new Float64Array(4);
    const next = new Float64Array(4);
    rk4Step(rest, goldenInputs.planar.dt, derivative, next);
    expect(Array.from(next)).toEqual([0, 0, 0, 0]);
    expect(() => createDerivative({ ...goldenInputs.planar.parameters, m1: 0 })).toThrow();
  });

  test('zero additive diffusion reduces to the existing Euler step without consuming random samples', () => {
    const state = Float64Array.from(goldenInputs.stochastic.initialState);
    const drift = createDoublePendulumDerivative(goldenInputs.planar.parameters, goldenInputs.stochastic.gamma);
    const deterministic = new Float64Array(4);
    const stochastic = new Float64Array(4);
    const random = gaussianSampler(goldenInputs.stochastic.seed);
    const untouched = gaussianSampler(goldenInputs.stochastic.seed);
    eulerStep(state, goldenInputs.stochastic.dt, drift, deterministic);
    eulerMaruyamaStep(state, goldenInputs.stochastic.dt, drift, [0, 0, 0, 0], random, stochastic);
    expect(stochastic).toEqual(deterministic);
    expect(random()).toBe(untouched());
  });

  test('zero-kick map preserves unwrapped momentum even across angle wrapping', () => {
    const next = standardMapStep(0.1, -8, 0);
    expect(next.p).toBe(-8);
    expect(next.theta).toBeGreaterThanOrEqual(0);
    expect(next.theta).toBeLessThan(2 * Math.PI);
  });

  test('FFT normalization retains a known impulse and its inverse', () => {
    const re = new Float64Array(16);
    re[0] = 1;
    const im = new Float64Array(16);
    fftInPlace(re, im);
    expect(Array.from(re)).toEqual(new Array(16).fill(1));
    expect(Array.from(im)).toEqual(new Array(16).fill(0));
    ifftInPlace(re, im);
    expect(re[0]).toBe(1);
    expect(Array.from(re.slice(1))).toEqual(new Array(15).fill(0));
    expect(Array.from(im).every((value) => value === 0)).toBe(true);
  });
});
