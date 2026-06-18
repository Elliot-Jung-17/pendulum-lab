import { describe, expect, it } from 'vitest';
import {
  promotedDoublePendulumClv,
  promotedDoublePendulumVariationalFtleField,
  webgpuDoublePendulumClvCandidate,
  webgpuDoublePendulumVariationalFtleFieldCandidate
} from '../src/runtime/gpuChaosPromotion';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const state0 = [1.2, 0.7, 0.12, -0.04];

describe('WebGPU CLV and variational-FTLE promotion paths', () => {
  it('does not fabricate CLV candidates outside a browser WebGPU runtime', async () => {
    const candidate = await webgpuDoublePendulumClvCandidate(params, state0, {
      dt: 0.01,
      renormEvery: 4,
      forwardTransient: 4,
      window: 8,
      backwardTransient: 2,
      seed: 0x1234
    });
    expect(candidate).toBeNull();
  });

  it('fails CLV promotion closed to the CPU f64 oracle when WebGPU is unavailable', async () => {
    const promotion = await promotedDoublePendulumClv(params, state0, {
      dt: 0.01,
      renormEvery: 4,
      forwardTransient: 4,
      window: 8,
      backwardTransient: 2,
      seed: 0x1234
    });
    expect(promotion.backend).toBe('cpu');
    expect(promotion.gpuCandidate).toBeNull();
    expect(promotion.result.exponents).toHaveLength(4);
    expect(promotion.result).toBe(promotion.cpuOracle);
  });

  it('does not fabricate variational-FTLE field candidates outside a browser WebGPU runtime', async () => {
    const candidate = await webgpuDoublePendulumVariationalFtleFieldCandidate(params, {
      n: 3,
      range: [-1, 1],
      totalTime: 0.12,
      dt: 0.03
    });
    expect(candidate).toBeNull();
  });

  it('fails variational-FTLE promotion closed to the CPU f64 oracle when WebGPU is unavailable', async () => {
    const promotion = await promotedDoublePendulumVariationalFtleField(params, {
      n: 3,
      range: [-1, 1],
      totalTime: 0.12,
      dt: 0.03
    });
    expect(promotion.backend).toBe('cpu');
    expect(promotion.gpuCandidate).toBeNull();
    expect(promotion.field.values).toHaveLength(9);
    expect(promotion.field).toBe(promotion.cpuOracle);
  });
});
