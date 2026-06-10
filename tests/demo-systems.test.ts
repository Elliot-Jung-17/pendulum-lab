import { describe, expect, test } from 'vitest';
import { createDemoSystems } from '../src/demo/systems';

const systems = createDemoSystems();
const view = { cx: 100, cy: 60, scale: 40 };

describe('demo system registry', () => {
  test('exposes the five expected systems', () => {
    expect(systems.map((s) => s.id)).toEqual(['double', 'triple', 'chain', 'driven', 'spring']);
  });

  for (const sys of systems) {
    describe(sys.id, () => {
      test('default state matches the declared dimension', () => {
        expect(sys.defaultState().length).toBe(sys.dim);
      });

      test('rhs and energy produce finite values', () => {
        const state = sys.defaultState();
        const out = new Float64Array(sys.dim);
        sys.rhs(state, out);
        for (let i = 0; i < sys.dim; i += 1) expect(Number.isFinite(out[i] ?? NaN)).toBe(true);
        expect(Number.isFinite(sys.energy(state))).toBe(true);
      });

      test('bobPositions returns the pivot plus each body', () => {
        const pts = sys.bobPositions(sys.defaultState(), view);
        // Chains: pivot + N bodies = dim/2 + 1. Driven/spring: pivot + 1 body.
        expect(pts.length).toBeGreaterThanOrEqual(2);
        expect(pts[0]).toEqual({ x: view.cx, y: view.cy });
        for (const p of pts) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      });

      test('detectPoincare returns null when before === after (no crossing)', () => {
        const s = sys.defaultState();
        expect(sys.detectPoincare(s, s)).toBeNull();
      });
    });
  }

  test('only the double pendulum advertises canonical support; only driven supports bifurcation', () => {
    expect(systems.filter((s) => s.supportsCanonical).map((s) => s.id)).toEqual(['double']);
    expect(systems.filter((s) => s.supportsBifurcation).map((s) => s.id)).toEqual(['driven']);
  });
});
