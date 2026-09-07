import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import type { UiStateV1 } from '../../../src/product/contracts/ui-state';

export function experimentFixture(): ExperimentStateV1 {
  return {
    schema: 'pendulum-experiment/v1',
    systemId: 'system:double',
    modelVersion: 'double-v1',
    parameters: {
      mass1: { kind: 'scalar', value: 1, unit: 'kg' },
      length1: { kind: 'scalar', value: 1, unit: 'm' },
      gravity: { kind: 'scalar', value: 9.81, unit: 'm/s^2' },
      damping: { kind: 'scalar', value: 0.05, unit: 'kg*m^2/s' }
    },
    initialConditions: {
      theta: { kind: 'vector', values: [Math.PI / 2, Math.PI], unit: 'rad' },
      omega: { kind: 'vector', values: [0, 0.2], unit: 'rad/s' }
    },
    integrator: { kind: 'selectable', id: 'integrator:rk4', version: 'rk4-v1', settings: {} },
    runtime: {
      domain: 'time',
      start: { value: 0, unit: 's' },
      duration: { value: 10, unit: 's' },
      step: { value: 0.001, unit: 's' },
      sampleEvery: 10
    },
    analyses: [],
    seed: { value: '-9007199254740991', generator: 'fixture-generator', generatorVersion: '1' },
    provenance: {
      createdByVersion: '10.36.0',
      source: { kind: 'preset', id: 'preset:double-01' },
      parentExperimentIds: [],
      sourceUnits: { 'initialConditions.theta': 'deg' }
    }
  };
}

export function mapFixture(): ExperimentStateV1 {
  return {
    ...experimentFixture(),
    systemId: 'system:standard-map',
    modelVersion: 'standard-map-v1',
    parameters: { kick: { kind: 'scalar', value: 0.9, unit: '1' } },
    initialConditions: {
      theta: { kind: 'scalar', value: Math.PI, unit: 'rad' },
      momentum: { kind: 'scalar', value: 0.2, unit: '1' }
    },
    integrator: { kind: 'internal', version: 'standard-map-step-v1', settings: {} },
    runtime: { domain: 'iteration', start: 0, iterations: 100, sampleEvery: 1 }
  };
}

export function quantumFixture(): ExperimentStateV1 {
  const base = mapFixture();
  const { provenance: _provenance, ...rest } = base;
  return {
    ...rest,
    systemId: 'system:quantum-kicked-rotor',
    modelVersion: 'qkr-v1',
    parameters: { gridSize: { kind: 'scalar', value: 4, unit: '1' }, hbar: { kind: 'scalar', value: 1, unit: '1' } },
    initialConditions: { wavefunction: { kind: 'complex-vector', re: [1, 0, 0, 0], im: [0, 0, 0, 0], unit: '1' } },
    integrator: { kind: 'internal', version: 'split-operator-v1', settings: {} }
  };
}

export function stochasticFixture(): ExperimentStateV1 {
  const { provenance: _provenance, ...rest } = experimentFixture();
  return {
    ...rest,
    systemId: 'system:langevin',
    modelVersion: 'langevin-v1',
    parameters: { temperature: { kind: 'scalar', value: 1, unit: '1' } },
    initialConditions: { state: { kind: 'vector', values: [0, 0], unit: '1' } },
    modelOptions: { drift: 'ornstein-uhlenbeck-v1' },
    integrator: {
      kind: 'internal',
      version: 'langevin-v1',
      settings: {},
      options: { scheme: 'euler-maruyama', interpretation: 'ito' }
    },
    seed: { value: '4294967295', generator: 'mulberry32-box-muller', generatorVersion: 'cached-spare-v1' }
  };
}

export const uiFixture = (): UiStateV1 => ({
  schema: 'pendulum-ui/v1',
  locale: 'ko',
  theme: 'system',
  layout: { panels: ['configuration', 'simulation', 'plots'], activePanel: 'simulation' },
  displayUnits: { theta: 'deg', omega: 'deg/s' }
});
