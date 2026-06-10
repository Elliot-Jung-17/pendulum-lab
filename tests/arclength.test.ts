import { describe, expect, test } from 'vitest';
import { continueArclength } from '../src/chaos/index';

/**
 * Pseudo-arclength continuation is validated on algebraic branches whose folds
 * are known in closed form. Natural-parameter continuation cannot pass these
 * turning points (the branch has a vertical tangent there); pseudo-arclength
 * traces around them, staying on the solution curve to ~1e-10.
 *
 *   x² − λ = 0           one fold at (x, λ) = (0, 0)
 *   x³ − 3x − λ = 0      folds at (1, −2) and (−1, 2)
 */

describe('pseudo-arclength turns a simple fold', () => {
  test('traces x² − λ = 0 around its fold from the upper to the lower branch', () => {
    const result = continueArclength(
      { residual: (x, l) => [x[0]! * x[0]! - l], dimension: 1 },
      { x0: [1], lambda0: 1, ds: 0.05, steps: 90, direction: -1 }
    );

    expect(result.branch.length).toBeGreaterThan(30);
    // Every point stays on the solution curve.
    for (const p of result.branch) expect(Math.abs(p.x[0]! * p.x[0]! - p.lambda)).toBeLessThan(1e-9);
    // The branch passed the fold onto the lower (x < 0) sheet — impossible for
    // natural-parameter continuation in λ.
    expect(Math.min(...result.branch.map((p) => p.x[0]!))).toBeLessThan(-1);
    // Exactly one fold, at the origin.
    expect(result.folds.length).toBe(1);
    expect(Math.abs(result.folds[0]!.lambda)).toBeLessThan(0.05);
    expect(Math.abs(result.folds[0]!.x[0]!)).toBeLessThan(0.1);
  });
});

describe('pseudo-arclength turns both folds of a cubic', () => {
  test('traces x³ − 3x − λ = 0 and finds folds at (1, −2) and (−1, 2)', () => {
    const result = continueArclength(
      { residual: (x, l) => [x[0]! ** 3 - 3 * x[0]! - l], dimension: 1 },
      { x0: [2], lambda0: 2, ds: 0.08, steps: 120, direction: -1 }
    );

    for (const p of result.branch) expect(Math.abs(p.x[0]! ** 3 - 3 * p.x[0]! - p.lambda)).toBeLessThan(1e-8);

    expect(result.folds.length).toBe(2);
    // Folds are located to the arclength-step granularity (ds = 0.08).
    const folds = [...result.folds].sort((a, b) => a.lambda - b.lambda);
    expect(Math.abs(folds[0]!.lambda - -2)).toBeLessThan(0.1);
    expect(Math.abs(folds[0]!.x[0]! - 1)).toBeLessThan(0.15);
    expect(Math.abs(folds[1]!.lambda - 2)).toBeLessThan(0.1);
    expect(Math.abs(folds[1]!.x[0]! - -1)).toBeLessThan(0.15);
  });
});
