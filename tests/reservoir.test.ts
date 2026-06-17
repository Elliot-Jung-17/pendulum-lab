import { describe, expect, it } from 'vitest';
import {
  buildNextStepTargets,
  predictEsnFree,
  predictEsnOneStep,
  predictionNrmse,
  trainEsn
} from '../src/research/reservoir';
import { eigenvaluesGeneral } from '../src/research/eigenGeneral';
import { complexAbs } from '../src/research/complexEig';

/** A limit cycle: the unit circle traced at angular rate ω (a 2-D rotation). */
function circleSeries(count: number, dt: number, omega: number): number[][] {
  const out: number[][] = [];
  for (let t = 0; t < count; t += 1) {
    const ph = omega * t * dt;
    out.push([Math.sin(ph), Math.cos(ph)]);
  }
  return out;
}

function spectralRadiusOf(flat: number[], n: number): number {
  const rows: number[][] = [];
  for (let i = 0; i < n; i += 1) rows.push(flat.slice(i * n, i * n + n));
  let r = 0;
  for (const lambda of eigenvaluesGeneral(rows)) r = Math.max(r, complexAbs(lambda));
  return r;
}

describe('echo state network — construction', () => {
  it('rescales the reservoir to the requested spectral radius exactly', () => {
    const series = circleSeries(400, 0.1, 1);
    const { inputs, targets } = buildNextStepTargets(series);
    const esn = trainEsn(inputs, targets, { reservoirSize: 60, dimension: 2, spectralRadius: 0.8, seed: 7 });
    expect(spectralRadiusOf(esn.reservoir, 60)).toBeCloseTo(0.8, 6);
  });

  it('is deterministic for a fixed seed', () => {
    const series = circleSeries(400, 0.1, 1);
    const { inputs, targets } = buildNextStepTargets(series);
    const spec = { reservoirSize: 50, dimension: 2, seed: 42 };
    const a = trainEsn(inputs, targets, spec);
    const b = trainEsn(inputs, targets, spec);
    expect(a.readout).toEqual(b.readout);
    expect(a.reservoir).toEqual(b.reservoir);
  });
});

describe('echo state network — prediction', () => {
  it('learns one-step prediction of a limit cycle to high accuracy', () => {
    const dt = 0.1;
    const omega = 1;
    const series = circleSeries(800, dt, omega);
    const train = series.slice(0, 600);
    const { inputs, targets } = buildNextStepTargets(train);
    const esn = trainEsn(inputs, targets, {
      reservoirSize: 100,
      dimension: 2,
      spectralRadius: 0.9,
      leakRate: 1,
      ridge: 1e-7,
      washout: 50,
      seed: 3
    });

    const testInputs = series.slice(600, 799);
    const testTargets = series.slice(601, 800);
    const predicted = predictEsnOneStep(esn, testInputs);
    const nrmse = predictionNrmse(predicted, testTargets);
    expect(nrmse).toBeLessThan(0.05);
  });

  it('free-runs as a surrogate, tracking the cycle over a horizon', () => {
    const dt = 0.1;
    const omega = 1;
    const series = circleSeries(900, dt, omega);
    const train = series.slice(0, 600);
    const { inputs, targets } = buildNextStepTargets(train);
    const esn = trainEsn(inputs, targets, {
      reservoirSize: 120,
      dimension: 2,
      spectralRadius: 0.95,
      leakRate: 1,
      ridge: 1e-7,
      washout: 60,
      seed: 11
    });

    const warmup = series.slice(540, 600);
    const horizon = 150;
    const generated = predictEsnFree(esn, warmup, horizon);
    const truth = series.slice(600, 600 + horizon);
    const nrmse = predictionNrmse(generated, truth);
    expect(nrmse).toBeLessThan(0.3);
    // The surrogate stays on the cycle: radius ≈ 1 throughout.
    const lastRadius = Math.hypot(generated[horizon - 1]![0] ?? 0, generated[horizon - 1]![1] ?? 0);
    expect(lastRadius).toBeGreaterThan(0.7);
    expect(lastRadius).toBeLessThan(1.3);
  });

  it('beats a persistence baseline on a quasi-periodic signal', () => {
    const series: number[][] = [];
    for (let t = 0; t < 1000; t += 1) {
      const x = 0.6 * Math.sin(0.21 * t) + 0.4 * Math.sin(0.34 * t + 0.7);
      series.push([x]);
    }
    const train = series.slice(0, 700);
    const { inputs, targets } = buildNextStepTargets(train);
    const esn = trainEsn(inputs, targets, {
      reservoirSize: 150,
      dimension: 1,
      spectralRadius: 0.9,
      ridge: 1e-6,
      washout: 100,
      seed: 5
    });

    const testInputs = series.slice(700, 999);
    const testTargets = series.slice(701, 1000);
    const predicted = predictEsnOneStep(esn, testInputs);
    const esnNrmse = predictionNrmse(predicted, testTargets);
    // Persistence: predict next = current.
    const persistenceNrmse = predictionNrmse(testInputs, testTargets);
    expect(esnNrmse).toBeLessThan(persistenceNrmse);
    expect(esnNrmse).toBeLessThan(0.1);
  });
});
