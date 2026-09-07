import { createDoublePendulumDerivative, energyDouble } from '../../src/physics/double';
import { createCompoundDoublePendulumDerivative, energyCompoundDouble } from '../../src/physics/compoundDouble';
import { rk4Step } from '../../src/physics/integrators';
import { eulerMaruyamaStep, gaussianSampler } from '../../src/physics/stochastic';
import { standardMapStep } from '../../src/physics/standardMap';
import { fftInPlace } from '../../src/physics/fft';
import { recurrenceQuantification } from '../../src/chaos/rqa';
import { poincareSectionPreset } from '../../src/chaos/poincare';

/** Inputs are explicit: no mutable application defaults, time, or ambient RNG. */
export const goldenInputs = {
  planar: {
    parameters: { m1: 0.9, m2: 1.3, l1: 1.1, l2: 0.8, g: 9.81 },
    initialState: [0.7, -0.4, 0.2, -0.1],
    gamma: 0,
    integrator: 'rk4',
    dt: 0.001,
    steps: 1024,
    snapshotSteps: [0, 1, 25, 250, 1024]
  },
  stochastic: {
    initialState: [0.3, -0.2, 0.05, 0.1],
    gamma: 0.08,
    diffusion: [0, 0, 0.1, 0.15],
    integrator: 'euler-maruyama',
    dt: 0.001,
    steps: 256,
    snapshotSteps: [0, 1, 16, 64, 256],
    seed: 20260907,
    generator: 'mulberry32 + cached Box-Muller (stochasticStepperShared.ts)',
    gaussianPrefixLength: 8
  },
  standardMap: {
    initialState: { theta: 0.37, p: -0.23 },
    K: 0.7,
    steps: 16,
    snapshotSteps: [0, 1, 4, 8, 16]
  },
  fft: {
    source: 'double.theta1',
    sampleEvery: 4,
    samples: 256,
    startStep: 0,
    window: 'none',
    normalization: 'unnormalized forward complex FFT',
    bins: [0, 1, 2, 3, 4, 8, 16, 32, 64, 128, 255]
  },
  rqa: {
    source: 'double.theta1',
    sampleEvery: 16,
    samples: 64,
    startStep: 0,
    options: { dimension: 2, delay: 2, epsilon: 0.04, lMin: 2, vMin: 2, theiler: 2 }
  },
  poincare: {
    source: 'double',
    preset: { kind: 'coordinate' as const, index: 0, value: 0, direction: 'both' as const },
    dt: 0.002,
    maxTime: 6,
    maxPoints: 4,
    transientDiscard: 0,
    rootTol: 1e-10
  }
};

export function observePlanarGolden(model: 'double' | 'compound') {
  const input = goldenInputs.planar;
  const derivative =
    model === 'double'
      ? createDoublePendulumDerivative(input.parameters, input.gamma)
      : createCompoundDoublePendulumDerivative(input.parameters, input.gamma);
  const energy = model === 'double' ? energyDouble : energyCompoundDouble;
  const state = Float64Array.from(input.initialState);
  const next = new Float64Array(4);
  const initialEnergy = energy(state, input.parameters).total;
  const theta1: number[] = [];
  const snapshots = [];
  let maxAbsoluteEnergyDrift = 0;
  for (let step = 0; step <= input.steps; step += 1) {
    theta1.push(state[0]!);
    const currentEnergy = energy(state, input.parameters);
    maxAbsoluteEnergyDrift = Math.max(maxAbsoluteEnergyDrift, Math.abs(currentEnergy.total - initialEnergy));
    if (input.snapshotSteps.includes(step)) {
      const rhs = new Float64Array(4);
      derivative(state, rhs);
      snapshots.push({
        step,
        time: step * input.dt,
        state: Array.from(state),
        rhs: Array.from(rhs),
        energy: currentEnergy
      });
    }
    if (step < input.steps) {
      rk4Step(state, input.dt, derivative, next);
      state.set(next);
    }
  }
  return { snapshots, maxAbsoluteEnergyDrift, theta1 };
}

export function observeStochasticGolden(seed = goldenInputs.stochastic.seed) {
  const input = goldenInputs.stochastic;
  const drift = createDoublePendulumDerivative(goldenInputs.planar.parameters, input.gamma);
  const gaussian = gaussianSampler(seed);
  const prefixSampler = gaussianSampler(seed);
  const gaussianPrefix = Array.from({ length: input.gaussianPrefixLength }, () => prefixSampler());
  const state = Float64Array.from(input.initialState);
  const next = new Float64Array(4);
  const snapshots = [];
  for (let step = 0; step <= input.steps; step += 1) {
    if (input.snapshotSteps.includes(step)) snapshots.push({ step, time: step * input.dt, state: Array.from(state) });
    if (step < input.steps) {
      eulerMaruyamaStep(state, input.dt, drift, input.diffusion, gaussian, next);
      state.set(next);
    }
  }
  return { gaussianPrefix, snapshots };
}

export function observeStandardMapGolden() {
  const input = goldenInputs.standardMap;
  let state = { ...input.initialState };
  const snapshots = [];
  for (let step = 0; step <= input.steps; step += 1) {
    if (input.snapshotSteps.includes(step)) snapshots.push({ step, ...state });
    if (step < input.steps) state = standardMapStep(state.theta, state.p, input.K);
  }
  return snapshots;
}

export function observeAnalysisGolden(theta1: readonly number[]) {
  const fftInput = goldenInputs.fft;
  const re = Float64Array.from(
    { length: fftInput.samples },
    (_, i) => theta1[fftInput.startStep + i * fftInput.sampleEvery]!
  );
  const im = new Float64Array(re.length);
  fftInPlace(re, im);
  const fft = fftInput.bins.map((bin) => ({ bin, re: re[bin]!, im: im[bin]! }));
  const rqaInput = goldenInputs.rqa;
  const series = Array.from(
    { length: rqaInput.samples },
    (_, i) => theta1[rqaInput.startStep + i * rqaInput.sampleEvery]!
  );
  const rqa = recurrenceQuantification(series, rqaInput.options);
  const input = goldenInputs.planar;
  const section = poincareSectionPreset(
    input.initialState,
    createDoublePendulumDerivative(input.parameters, input.gamma),
    goldenInputs.poincare
  );
  const poincare = {
    points: section.points.map((point) => Array.from(point)),
    times: section.times,
    directions: section.directions,
    rootResiduals: section.rootResiduals,
    rootBracketWidths: section.rootBracketWidths,
    metadata: section.metadata
  };
  return { fft, rqa, poincare };
}

/** Observation only; intentionally contains no fixture-update/write mode. */
export function observeNumericalGolden() {
  const double = observePlanarGolden('double');
  const compound = observePlanarGolden('compound');
  return {
    double: { snapshots: double.snapshots, maxAbsoluteEnergyDrift: double.maxAbsoluteEnergyDrift },
    compound: { snapshots: compound.snapshots, maxAbsoluteEnergyDrift: compound.maxAbsoluteEnergyDrift },
    stochastic: observeStochasticGolden(),
    standardMap: observeStandardMapGolden(),
    analysis: observeAnalysisGolden(double.theta1)
  };
}
