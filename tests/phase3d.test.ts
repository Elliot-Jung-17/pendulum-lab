import { describe, expect, it } from 'vitest';
import { rotateProject } from '../src/app/phase3d';

describe('rotateProject', () => {
  it('is the identity projection with no rotation', () => {
    const p = rotateProject({ x: 0.5, y: -0.3, z: 0.8 }, 0, 0);
    expect(p.x).toBeCloseTo(0.5, 12);
    expect(p.y).toBeCloseTo(-0.3, 12);
    expect(p.depth).toBeCloseTo(0.8, 12);
  });

  it('a 90° yaw swaps the x and z axes', () => {
    const p = rotateProject({ x: 1, y: 0, z: 0 }, Math.PI / 2, 0);
    expect(p.x).toBeCloseTo(0, 12); // x maps toward the old z (which was 0)
    expect(p.depth).toBeCloseTo(-1, 12); // z' = -x
  });

  it('a 90° pitch maps the y axis into depth', () => {
    const p = rotateProject({ x: 0, y: 1, z: 0 }, 0, Math.PI / 2);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(1, 12);
  });

  it('preserves the vector norm (rotation is rigid)', () => {
    const v = { x: 0.4, y: -0.7, z: 0.5 };
    const p = rotateProject(v, 0.9, -0.4);
    const before = Math.hypot(v.x, v.y, v.z);
    const after = Math.hypot(p.x, p.y, p.depth);
    expect(after).toBeCloseTo(before, 12);
  });
});
