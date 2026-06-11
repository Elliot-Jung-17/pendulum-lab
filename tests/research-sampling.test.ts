import { describe, expect, test } from 'vitest';
import { generateStudyValues } from '../src/research/researchSampling';

describe('research sampling strategies', () => {
  test('low-discrepancy sampling is deterministic and bounded', () => {
    const values = generateStudyValues('sobol', -1, 1, 8, 'seed');
    expect(values).toHaveLength(8);
    expect(values).toEqual(generateStudyValues('sobol', -1, 1, 8, 'other-seed'));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
  });

  test('chebyshev sampling clusters near edges', () => {
    const values = generateStudyValues('chebyshev', -1, 1, 7, 'seed');
    expect(values).toHaveLength(7);
    expect(values[0]).toBeLessThan(-0.9);
    expect(values.at(-1)).toBeGreaterThan(0.9);
  });

  test('latin hypercube is deterministic for the same seed text', () => {
    const a = generateStudyValues('latin-hypercube', 0, 10, 6, 'abc');
    const b = generateStudyValues('latin-hypercube', 0, 10, 6, 'abc');
    expect(a).toEqual(b);
    expect(a).not.toEqual(generateStudyValues('latin-hypercube', 0, 10, 6, 'xyz'));
  });
});
