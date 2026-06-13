import { describe, expect, it } from 'vitest';
import { flipBasinField, ftleFieldFiniteDifference, sweepLambdaField } from '../src/runtime/gpuFields';
import { doublePendulumFlipBasin } from '../src/chaos/basin';

const PARAMS = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

describe('GPU field scans (CPU fallback path in Node)', () => {
  it('flip-basin CPU fallback reproduces doublePendulumFlipBasin exactly', async () => {
    const result = await flipBasinField(PARAMS, { n: 20, maxTime: 8, forceCpu: true });
    expect(result.backend).toBe('cpu');
    expect(result.validation).toBeNull();
    expect(result.width).toBe(20);
    const reference = doublePendulumFlipBasin(PARAMS, { n: 20, maxTime: 8 });
    expect(Array.from(result.labels)).toEqual(Array.from(reference.labels));
    expect(result.caveat).toContain('CPU f64');
  });

  it('sweep λ field separates the chaotic high-energy region from small-angle motion', async () => {
    const chaotic = await sweepLambdaField(PARAMS, { n: 3, range: [1.9, 2.5], steps: 1200, forceCpu: true });
    expect(chaotic.backend).toBe('cpu');
    const chaoticMax = Math.max(...Array.from(chaotic.values));
    expect(chaoticMax).toBeGreaterThan(0.3);
    const regular = await sweepLambdaField(PARAMS, { n: 3, range: [0.05, 0.2], steps: 1200, forceCpu: true });
    for (const value of regular.values) {
      expect(Math.abs(value)).toBeLessThan(0.15);
    }
  });

  it('finite-difference FTLE field is finite with real contrast across the grid', async () => {
    const result = await ftleFieldFiniteDifference(PARAMS, { n: 14, totalTime: 2, forceCpu: true });
    expect(result.backend).toBe('cpu');
    expect(result.values).toHaveLength(14 * 14);
    for (const value of result.values) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // The [-3, 3]² grid spans both regular wells and the chaotic sea, so the
    // stretching field must show clear contrast.
    expect(result.max - result.min).toBeGreaterThan(0.3);
    expect(result.max).toBeGreaterThan(0);
  });
});
