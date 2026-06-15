import type { IntegratorId } from '../types/domain';
import { energyDriven, rhsDriven, type DrivenParameters } from './driven';
import { chainLength, energyChain, rhsChain, type ChainParameters } from './nPendulum';
import { sphericalEnergy, sphericalPosition, sphericalRhs, type SphericalParams, type SphericalState } from './spherical';
import { rk4Step, step } from './integrators';
import { gramSchmidt, makeVariationalRhs, seedTangentFrame } from './variational';
import { createChainJacobianWorkspace, jacobianChain, jacobianDriven } from './jacobians';
import { analyzeSpectrumConsistency, type SpectrumConsistency } from './spectrumConsistency';
import type { Derivative, Jacobian, StateVector } from './types';

export const EXPANSION_MODEL_IDS = [
  'driven',
  'coupled',
  'inverted',
  'cartpole',
  'parametric',
  'spherical',
  'chain'
] as const;

export type ExpansionModelId = (typeof EXPANSION_MODEL_IDS)[number];

export type ExpansionParameterMap = Record<string, number>;

export interface ExpansionPoint {
  x: number;
  y: number;
}

export interface ExpansionSweepSpec {
  parameter: string;
  label: string;
  min: number;
  max: number;
}

export interface ExpansionModelDefinition {
  id: ExpansionModelId;
  label: string;
  family: string;
  dimension: number;
  conservative: boolean;
  defaultDt: number;
  defaultHorizon: number;
  defaultState: readonly number[];
  defaultParameters: ExpansionParameterMap;
  sweep: ExpansionSweepSpec;
  equation: string;
  energyNote: string;
  caveat: string;
}

export interface ExpansionSystem {
  definition: ExpansionModelDefinition;
  parameters: ExpansionParameterMap;
  initialState: Float64Array;
  rhs: Derivative;
  energy: (state: ArrayLike<number>) => number;
  coordinates: (state: ArrayLike<number>) => ExpansionPoint[];
  phasePoint: (state: ArrayLike<number>) => ExpansionPoint;
}

export interface ExpansionSuiteConfig {
  model: ExpansionModelId;
  methods?: readonly IntegratorId[];
  parameterOverrides?: Partial<ExpansionParameterMap>;
  initialState?: readonly number[];
  dt?: number;
  horizon?: number;
  sampleLimit?: number;
  ghostEpsilon?: number;
  bifurcationColumns?: number;
}

export interface ExpansionPreset {
  id: string;
  label: string;
  model: ExpansionModelId;
  description: string;
  config: ExpansionSuiteConfig;
}

export interface GoldenExperimentResult {
  presetId: string;
  label: string;
  ok: boolean;
  hash: string;
  bestMethod: IntegratorId;
  energyShellSpan: number;
  maxGhostDivergence: number;
  reason: string;
}

export interface BatchExperimentResult {
  presetId: string;
  label: string;
  result: ExpansionSuiteResult;
}

export type ResearchComparisonKind = 'parameter' | 'integrator';

export interface ResearchComparisonRun {
  id: string;
  label: string;
  kind: ResearchComparisonKind;
  hash: string;
  model: ExpansionModelId;
  variedParameter: string;
  parameterValue: number;
  method: IntegratorId;
  stable: boolean;
  stabilityScore: number;
  energyDrift: number;
  referenceDivergence: number;
  runtimeMs: number;
  miniGraph: number[];
}

export interface ExpansionSweepAxis {
  parameter: string;
  label: string;
  unit: string;
  min: number;
  max: number;
}

export interface ExpansionMatrixCell {
  x: number;
  y: number;
  score: number;
  stable: boolean;
  energyDrift: number;
  runtimeMs: number;
  finalPhase: ExpansionPoint;
}

export interface ExpansionDimensionlessMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  note: string;
}

export interface ExpansionPoincarePoint {
  x: number;
  y: number;
  time: number;
}

export interface ExpansionLyapunovTimelinePoint {
  time: number;
  leading: number;
  secondary: number;
}

/**
 * A true Lyapunov profile for an expansion model, computed from the variational
 * (tangent-linear) flow with Gram-Schmidt/QR reorthonormalization — not the
 * single-perturbation ghost divergence. `spectrum` holds all `count` exponents
 * in descending order; `timeline` is the running estimate of the leading and
 * secondary exponents versus time (which converge to `spectrum[0]`/`spectrum[1]`).
 */
export interface ExpansionLyapunovProfile {
  /** All exponents, descending. Length = the model state dimension. */
  spectrum: number[];
  /**
   * Batched-means ("block bootstrap") standard error per exponent, aligned with
   * `spectrum`. Decorrelates neighbouring renormalization intervals, so it is an
   * honest uncertainty rather than the optimistic naive standard error.
   */
  blockStdError: number[];
  /** Σλ (≈ 0 for a conservative/Hamiltonian model; ≈ −trace(damping) for dissipative). */
  sum: number;
  /** Kaplan–Yorke (Lyapunov) dimension from the spectrum. */
  kaplanYorkeDimension: number;
  /** Largest exponent (= spectrum[0]); >0 signals sensitive dependence. */
  leadingExponent: number;
  /**
   * Hamiltonian self-consistency verdict (Σλ ≈ 0, symplectic pairing, zero-exponent
   * count) — a free, independent validation of the whole tangent-space pipeline,
   * meaningful for the conservative models. Reported, not assumed.
   */
  consistency: SpectrumConsistency;
  /** Running (leading, secondary) exponents versus time. */
  timeline: ExpansionLyapunovTimelinePoint[];
  /** The settings the estimate was computed with (a bare number is not reproducible). */
  settings: { dt: number; steps: number; renormEvery: number; transientSteps: number; count: number; jacobian: 'exact' | 'central-difference' };
}

export interface ExpansionBasinCell {
  x: number;
  y: number;
  basin: number;
  stable: boolean;
}

export interface ExpansionEnergyCell {
  x: number;
  y: number;
  energy: number;
  separatrix: boolean;
}

export interface ExpansionResearchMatrixResult {
  schemaVersion: 'pendulum-research-matrix/v1';
  generatedAt: string;
  base: ExpansionSuiteResult;
  comparison: ResearchComparisonRun[];
  sweep2d: {
    xAxis: ExpansionSweepAxis;
    yAxis: ExpansionSweepAxis;
    size: number;
    cells: ExpansionMatrixCell[];
  };
  physicalMetrics: ExpansionDimensionlessMetric[];
  diagnostics: {
    poincare: ExpansionPoincarePoint[];
    lyapunovTimeline: ExpansionLyapunovTimelinePoint[];
    /** Full variational/QR Lyapunov spectrum (descending) for the base condition. */
    lyapunovSpectrum: number[];
    /** Kaplan–Yorke dimension implied by `lyapunovSpectrum`. */
    kaplanYorkeDimension: number;
    /** Hamiltonian self-consistency verdict for `lyapunovSpectrum` (Σλ≈0, symplectic pairing). */
    lyapunovConsistency: SpectrumConsistency;
    basin: {
      xAxis: ExpansionSweepAxis;
      yAxis: ExpansionSweepAxis;
      size: number;
      cells: ExpansionBasinCell[];
    };
    energyLandscape: {
      xAxis: ExpansionSweepAxis;
      yAxis: ExpansionSweepAxis;
      size: number;
      cells: ExpansionEnergyCell[];
      referenceEnergy: number;
    };
  };
  summary: {
    bestComparison: string;
    bestScore: number;
    stableComparisons: number;
    sweepStableRatio: number;
    maxLyapunovEstimate: number;
  };
  manifest: {
    schemaVersion: 'pendulum-research-matrix-manifest/v1';
    hash: string;
    createdAt: string;
  };
}

export interface GoldenCenterMethodResult {
  presetId: string;
  presetLabel: string;
  method: IntegratorId;
  pass: boolean;
  driftPass: boolean;
  runtimePass: boolean;
  regressionPass: boolean;
  energyDrift: number;
  runtimeMs: number;
  stabilityScore: number;
  regressionHash: string;
  threshold: string;
}

export interface GoldenCenterPresetResult {
  presetId: string;
  label: string;
  pass: boolean;
  methods: GoldenCenterMethodResult[];
}

export interface GoldenCenterResult {
  schemaVersion: 'pendulum-golden-center/v1';
  generatedAt: string;
  presets: GoldenCenterPresetResult[];
  summary: {
    passed: number;
    failed: number;
    totalMethods: number;
    medianRuntimeMs: number;
  };
  manifest: {
    hash: string;
    createdAt: string;
  };
}

export interface ExpansionTrajectorySample {
  time: number;
  state: number[];
  energy: number;
  phase: ExpansionPoint;
  coordinates: ExpansionPoint[];
}

export interface ExpansionMethodResult {
  method: IntegratorId;
  stable: boolean;
  completedSteps: number;
  elapsedMs: number;
  stepsPerMs: number;
  energyDrift: number;
  energySpan: number;
  referenceDivergence: number;
  maxAbsState: number;
  embeddedError: number | null;
  finalState: number[];
  samples: ExpansionTrajectorySample[];
}

export interface ExpansionHeatmap {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  bins: number;
  counts: number[][];
  maxCount: number;
}

export interface ExpansionGhostFrame {
  time: number;
  divergence: number;
  base: ExpansionPoint[];
  ghost: ExpansionPoint[];
}

export interface ExpansionBifurcationColumn {
  parameter: number;
  values: number[];
}

export interface ExpansionSuiteResult {
  schemaVersion: 'pendulum-expansion-suite/v1';
  generatedAt: string;
  model: ExpansionModelId;
  modelLabel: string;
  family: string;
  conservative: boolean;
  parameters: ExpansionParameterMap;
  initialState: number[];
  methods: IntegratorId[];
  referenceMethod: IntegratorId;
  dt: number;
  horizon: number;
  rows: ExpansionMethodResult[];
  phaseHeatmap: ExpansionHeatmap;
  ghost: ExpansionGhostFrame[];
  /**
   * True variational/QR Lyapunov spectrum for the run, populated when the suite
   * is asked for it (`runExpansionSuite(config, { includeLyapunov: true })`).
   * The ghost frames above are a single-perturbation divergence illustration;
   * this is the research-grade exponent estimate.
   */
  lyapunov?: ExpansionLyapunovProfile;
  bifurcation: ExpansionBifurcationColumn[];
  replay: ExpansionPoint[][];
  summary: {
    bestMethod: IntegratorId;
    bestScore: number;
    stableMethods: number;
    maxGhostDivergence: number;
    energyShellSpan: number;
  };
  manifest: {
    schemaVersion: 'pendulum-expansion-manifest/v1';
    hash: string;
    shareHash: string;
    createdAt: string;
  };
}

export const DEFAULT_EXPANSION_METHODS: readonly IntegratorId[] = ['rk4', 'dopri5', 'leapfrog', 'symplectic', 'euler'];

export const EXPANSION_MODEL_DEFINITIONS: readonly ExpansionModelDefinition[] = [
  {
    id: 'driven',
    label: 'Forced and Damped Pendulum',
    family: 'single-pendulum chaos',
    dimension: 3,
    conservative: false,
    defaultDt: 0.01,
    defaultHorizon: 28,
    defaultState: [0.2, 0, 0],
    defaultParameters: { g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 },
    sweep: { parameter: 'driveAmplitude', label: 'drive', min: 0.7, max: 1.45 },
    equation: "theta' = omega; omega' = -(g/l) sin(theta) - gamma omega + A cos(phi); phi' = Omega.",
    energyNote: 'Mechanical bob energy is diagnostic only because damping and drive exchange energy with the system.',
    caveat: 'Do not quote energy drift as conservation error when drive or damping is active.'
  },
  {
    id: 'coupled',
    label: 'Coupled Pendulums',
    family: 'normal modes and energy exchange',
    dimension: 4,
    conservative: true,
    defaultDt: 0.006,
    defaultHorizon: 22,
    defaultState: [0.65, -0.2, 0, 0],
    defaultParameters: { g: 9.81, length: 1, coupling: 2.2, damping: 0 },
    sweep: { parameter: 'coupling', label: 'coupling', min: 0.1, max: 5 },
    equation: "theta_i' = omega_i; omega_1' = -(g/l) sin(theta_1) - k(theta_1-theta_2); omega_2' = -(g/l) sin(theta_2) + k(theta_1-theta_2).",
    energyNote: 'Energy includes two pendulum potentials plus a quadratic coupling spring.',
    caveat: 'The coupling is a compact educational model, not a full elastic-rod derivation.'
  },
  {
    id: 'inverted',
    label: 'Inverted Pendulum',
    family: 'unstable equilibrium',
    dimension: 2,
    conservative: true,
    defaultDt: 0.004,
    defaultHorizon: 10,
    defaultState: [0.035, 0],
    defaultParameters: { g: 9.81, length: 1, damping: 0 },
    sweep: { parameter: 'damping', label: 'damping', min: 0, max: 1.2 },
    equation: "theta' = omega; omega' = (g/l) sin(theta) - gamma omega.",
    energyNote: 'Energy is measured relative to the upright potential peak.',
    caveat: 'The equilibrium is exponentially unstable; long-horizon agreement is not expected.'
  },
  {
    id: 'cartpole',
    label: 'Cart-Pole',
    family: 'underactuated control benchmark',
    dimension: 4,
    conservative: true,
    defaultDt: 0.006,
    defaultHorizon: 9,
    defaultState: [0, 0.12, 0, 0],
    defaultParameters: { cartMass: 1, poleMass: 0.16, length: 0.75, g: 9.81, force: 0, friction: 0 },
    sweep: { parameter: 'force', label: 'force', min: -3, max: 3 },
    equation: "x' = v; theta' = omega; accelerations follow the standard underactuated cart-pole equations.",
    energyNote: 'Energy combines cart kinetic energy, pole kinetic energy, and upright pole potential.',
    caveat: 'No controller is applied; the force parameter is open-loop and constant.'
  },
  {
    id: 'parametric',
    label: 'Parametric Pendulum',
    family: 'time-periodic excitation',
    dimension: 3,
    conservative: false,
    defaultDt: 0.008,
    defaultHorizon: 24,
    defaultState: [0.18, 0, 0],
    defaultParameters: { g: 9.81, length: 1, damping: 0.04, amplitude: 0.34, frequency: 6.25 },
    sweep: { parameter: 'amplitude', label: 'amplitude', min: 0, max: 0.7 },
    equation: "theta' = omega; omega' = -(g/l)(1 + a cos(phi)) sin(theta) - gamma omega; phi' = Omega.",
    energyNote: 'The apparent gravitational field is time-periodic, so bob energy is not conserved.',
    caveat: 'Parametric resonance is finite-time and parameter-window dependent.'
  },
  {
    id: 'spherical',
    label: 'Spherical Pendulum',
    family: '3D constrained motion',
    dimension: 4,
    conservative: true,
    defaultDt: 0.004,
    defaultHorizon: 14,
    defaultState: [0.8, 0, 0, 2.2],
    defaultParameters: { g: 9.81, length: 1, damping: 0 },
    sweep: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
    equation: "theta' = thetaDot; phi' = phiDot; thetaDot' = sin(theta)cos(theta)phiDot^2 - (g/l)sin(theta); phiDot' = -2 cot(theta) thetaDot phiDot.",
    energyNote: 'Conservative runs preserve both energy and vertical angular momentum in exact arithmetic.',
    caveat: 'Spherical coordinates are regularized near the poles; avoid over-interpreting pole-adjacent runs.'
  },
  {
    id: 'chain',
    label: 'N-Link Pendulum',
    family: 'many-body planar chain',
    dimension: 8,
    conservative: true,
    defaultDt: 0.003,
    defaultHorizon: 12,
    defaultState: [1.05, 0.8, 0.45, 0.2, 0, 0, 0, 0],
    defaultParameters: { links: 4, g: 9.81, damping: 0, mass1: 1, mass2: 0.9, mass3: 0.8, mass4: 0.7, length1: 1, length2: 0.85, length3: 0.7, length4: 0.55 },
    sweep: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
    equation: "M(theta) alpha = f(theta, omega), with state [theta_0..theta_N, omega_0..omega_N].",
    energyNote: 'Energy is the full chain kinetic plus gravitational potential energy.',
    caveat: 'Large N and energetic initial states can be stiff; compare methods before trusting fine structure.'
  }
];

export const EXPANSION_PRESETS: readonly ExpansionPreset[] = [
  {
    id: 'driven-chaos',
    label: 'Driven chaos window',
    model: 'driven',
    description: 'Classic damped-driven single pendulum route to chaos.',
    config: { model: 'driven', parameterOverrides: { driveAmplitude: 1.15 }, horizon: 24, dt: 0.01, bifurcationColumns: 10 }
  },
  {
    id: 'coupled-normal-mode',
    label: 'Coupled normal modes',
    model: 'coupled',
    description: 'Energy exchange between two weakly coupled pendulums.',
    config: { model: 'coupled', initialState: [0.45, -0.45, 0, 0], parameterOverrides: { coupling: 1.2 }, horizon: 18, dt: 0.006 }
  },
  {
    id: 'inverted-growth',
    label: 'Inverted growth',
    model: 'inverted',
    description: 'Small perturbation near the unstable upright equilibrium.',
    config: { model: 'inverted', initialState: [0.02, 0], horizon: 8, dt: 0.004 }
  },
  {
    id: 'cartpole-open-loop',
    label: 'Cart-pole open loop',
    model: 'cartpole',
    description: 'Underactuated cart-pole without feedback control.',
    config: { model: 'cartpole', parameterOverrides: { force: 0.5 }, horizon: 7, dt: 0.006 }
  },
  {
    id: 'parametric-resonance',
    label: 'Parametric resonance',
    model: 'parametric',
    description: 'Length/gravity modulation pumps energy into the bob.',
    config: { model: 'parametric', parameterOverrides: { amplitude: 0.42 }, horizon: 18, dt: 0.008 }
  },
  {
    id: 'spherical-conical',
    label: 'Spherical conical orbit',
    model: 'spherical',
    description: 'Near-conical 3D pendulum orbit with angular momentum.',
    config: { model: 'spherical', initialState: [0.75, 0, 0, 2.7], horizon: 12, dt: 0.004 }
  },
  {
    id: 'chain-cascade',
    label: 'N-link cascade',
    model: 'chain',
    description: 'Four-link chain cascade with strong nonlinear coupling.',
    config: { model: 'chain', horizon: 10, dt: 0.003, bifurcationColumns: 8 }
  }
];

export const GOLDEN_EXPANSION_PRESET_IDS = ['coupled-normal-mode', 'spherical-conical', 'chain-cascade'] as const;

function cloneParameters(definition: ExpansionModelDefinition, overrides: Partial<ExpansionParameterMap> = {}): ExpansionParameterMap {
  const parameters: ExpansionParameterMap = { ...definition.defaultParameters };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) parameters[key] = value;
  }
  return parameters;
}

export function expansionModelDefinition(id: ExpansionModelId): ExpansionModelDefinition {
  const definition = EXPANSION_MODEL_DEFINITIONS.find((item) => item.id === id);
  if (!definition) throw new Error(`unknown expansion model: ${id}`);
  return definition;
}

function numberAt(values: ArrayLike<number>, index: number, fallback = 0): number {
  const value = Number(values[index] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function finiteParam(parameters: ExpansionParameterMap, key: string, fallback: number): number {
  const value = parameters[key];
  return Number.isFinite(value) ? Number(value) : fallback;
}

function drivenParams(parameters: ExpansionParameterMap): DrivenParameters {
  return {
    g: finiteParam(parameters, 'g', 1),
    length: finiteParam(parameters, 'length', 1),
    damping: finiteParam(parameters, 'damping', 0.5),
    driveAmplitude: finiteParam(parameters, 'driveAmplitude', 1.15),
    driveFrequency: finiteParam(parameters, 'driveFrequency', 2 / 3)
  };
}

function sphericalParams(parameters: ExpansionParameterMap): SphericalParams {
  return {
    g: finiteParam(parameters, 'g', 9.81),
    l: finiteParam(parameters, 'length', 1),
    damping: finiteParam(parameters, 'damping', 0)
  };
}

function chainParams(parameters: ExpansionParameterMap): ChainParameters {
  const n = Math.max(2, Math.min(8, Math.round(finiteParam(parameters, 'links', 4))));
  const masses = Array.from({ length: n }, (_, i) => finiteParam(parameters, `mass${i + 1}`, Math.max(0.25, 1 - i * 0.1)));
  const lengths = Array.from({ length: n }, (_, i) => finiteParam(parameters, `length${i + 1}`, Math.max(0.25, 1 - i * 0.15)));
  return { masses, lengths, g: finiteParam(parameters, 'g', 9.81) };
}

function wrapAngle(theta: number): number {
  let value = theta;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function pendulumPoint(theta: number, length: number, x0 = 0): ExpansionPoint {
  return { x: x0 + length * Math.sin(theta), y: -length * Math.cos(theta) };
}

function coupledRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta1 = numberAt(state, 0);
  const theta2 = numberAt(state, 1);
  const omega1 = numberAt(state, 2);
  const omega2 = numberAt(state, 3);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const coupling = finiteParam(parameters, 'coupling', 2);
  const damping = finiteParam(parameters, 'damping', 0);
  out[0] = omega1;
  out[1] = omega2;
  out[2] = -(g / length) * Math.sin(theta1) - damping * omega1 - coupling * (theta1 - theta2);
  out[3] = -(g / length) * Math.sin(theta2) - damping * omega2 + coupling * (theta1 - theta2);
}

function coupledEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta1 = numberAt(state, 0);
  const theta2 = numberAt(state, 1);
  const omega1 = numberAt(state, 2);
  const omega2 = numberAt(state, 3);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const coupling = finiteParam(parameters, 'coupling', 2);
  return 0.5 * length * length * (omega1 * omega1 + omega2 * omega2)
    - g * length * (Math.cos(theta1) + Math.cos(theta2))
    + 0.5 * coupling * (theta1 - theta2) * (theta1 - theta2);
}

function invertedRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const damping = finiteParam(parameters, 'damping', 0);
  out[0] = omega;
  out[1] = (g / length) * Math.sin(theta) - damping * omega;
}

function invertedEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  return 0.5 * length * length * omega * omega + g * length * Math.cos(theta);
}

function cartPoleRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta = numberAt(state, 1);
  const xDot = numberAt(state, 2);
  const thetaDot = numberAt(state, 3);
  const cartMass = finiteParam(parameters, 'cartMass', 1);
  const poleMass = finiteParam(parameters, 'poleMass', 0.16);
  const length = finiteParam(parameters, 'length', 0.75);
  const g = finiteParam(parameters, 'g', 9.81);
  const force = finiteParam(parameters, 'force', 0);
  const friction = finiteParam(parameters, 'friction', 0);
  const totalMass = cartMass + poleMass;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const temp = (force - friction * xDot + poleMass * length * thetaDot * thetaDot * sin) / totalMass;
  const denom = length * (4 / 3 - (poleMass * cos * cos) / totalMass);
  const thetaAcc = (g * sin - cos * temp) / denom;
  const xAcc = temp - (poleMass * length * thetaAcc * cos) / totalMass;
  out[0] = xDot;
  out[1] = thetaDot;
  out[2] = xAcc;
  out[3] = thetaAcc;
}

function cartPoleEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta = numberAt(state, 1);
  const xDot = numberAt(state, 2);
  const thetaDot = numberAt(state, 3);
  const cartMass = finiteParam(parameters, 'cartMass', 1);
  const poleMass = finiteParam(parameters, 'poleMass', 0.16);
  const length = finiteParam(parameters, 'length', 0.75);
  const g = finiteParam(parameters, 'g', 9.81);
  const bobVx = xDot + length * Math.cos(theta) * thetaDot;
  const bobVy = -length * Math.sin(theta) * thetaDot;
  const ke = 0.5 * cartMass * xDot * xDot + 0.5 * poleMass * (bobVx * bobVx + bobVy * bobVy);
  const pe = poleMass * g * length * Math.cos(theta);
  return ke + pe;
}

function parametricRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const phase = numberAt(state, 2);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const damping = finiteParam(parameters, 'damping', 0.04);
  const amplitude = finiteParam(parameters, 'amplitude', 0.34);
  const frequency = finiteParam(parameters, 'frequency', 6.25);
  out[0] = omega;
  out[1] = -(g / length) * (1 + amplitude * Math.cos(phase)) * Math.sin(theta) - damping * omega;
  out[2] = frequency;
}

function parametricEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const length = finiteParam(parameters, 'length', 1);
  const g = finiteParam(parameters, 'g', 9.81);
  return 0.5 * length * length * omega * omega - g * length * Math.cos(theta);
}

export function createExpansionSystem(
  id: ExpansionModelId,
  parameterOverrides: Partial<ExpansionParameterMap> = {},
  initialState?: readonly number[]
): ExpansionSystem {
  const definition = expansionModelDefinition(id);
  const parameters = cloneParameters(definition, parameterOverrides);
  const state = new Float64Array(initialState ?? definition.defaultState);
  if (state.length !== definition.dimension) {
    throw new Error(`${definition.label}: expected state dimension ${definition.dimension}, got ${state.length}`);
  }

  if (id === 'driven') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => { rhsDriven(s, drivenParams(parameters), out); },
      energy: (s) => energyDriven(s, drivenParams(parameters)).total,
      coordinates: (s) => [pendulumPoint(numberAt(s, 0), finiteParam(parameters, 'length', 1))],
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 1) })
    };
  }
  if (id === 'coupled') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => coupledRhs(s, parameters, out),
      energy: (s) => coupledEnergy(s, parameters),
      coordinates: (s) => [
        pendulumPoint(numberAt(s, 0), finiteParam(parameters, 'length', 1), -0.75),
        pendulumPoint(numberAt(s, 1), finiteParam(parameters, 'length', 1), 0.75)
      ],
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0) - numberAt(s, 1)), y: numberAt(s, 2) - numberAt(s, 3) })
    };
  }
  if (id === 'inverted') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => invertedRhs(s, parameters, out),
      energy: (s) => invertedEnergy(s, parameters),
      coordinates: (s) => [pendulumPoint(numberAt(s, 0), finiteParam(parameters, 'length', 1))],
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 1) })
    };
  }
  if (id === 'cartpole') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => cartPoleRhs(s, parameters, out),
      energy: (s) => cartPoleEnergy(s, parameters),
      coordinates: (s) => {
        const x = numberAt(s, 0);
        const theta = numberAt(s, 1);
        const length = finiteParam(parameters, 'length', 0.75);
        return [{ x, y: 0 }, { x: x + length * Math.sin(theta), y: -length * Math.cos(theta) }];
      },
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 1)), y: numberAt(s, 3) })
    };
  }
  if (id === 'parametric') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => parametricRhs(s, parameters, out),
      energy: (s) => parametricEnergy(s, parameters),
      coordinates: (s) => {
        const length = finiteParam(parameters, 'length', 1) * (1 + 0.15 * finiteParam(parameters, 'amplitude', 0.34) * Math.cos(numberAt(s, 2)));
        return [pendulumPoint(numberAt(s, 0), length)];
      },
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 1) })
    };
  }
  if (id === 'spherical') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => {
        const next = sphericalRhs([numberAt(s, 0), numberAt(s, 1), numberAt(s, 2), numberAt(s, 3)] as SphericalState, sphericalParams(parameters));
        out[0] = next[0];
        out[1] = next[1];
        out[2] = next[2];
        out[3] = next[3];
      },
      energy: (s) => sphericalEnergy([numberAt(s, 0), numberAt(s, 1), numberAt(s, 2), numberAt(s, 3)] as SphericalState, sphericalParams(parameters)),
      coordinates: (s) => {
        const position = sphericalPosition([numberAt(s, 0), numberAt(s, 1), numberAt(s, 2), numberAt(s, 3)] as SphericalState, sphericalParams(parameters));
        return [{ x: position.x, y: position.y }, { x: position.z, y: position.y }];
      },
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 2) })
    };
  }

  return {
    definition,
    parameters,
    initialState: state,
    rhs: (s, out) => rhsChain(s, chainParams(parameters), finiteParam(parameters, 'damping', 0), out),
    energy: (s) => energyChain(s, chainParams(parameters)).total,
    coordinates: (s) => {
      const params = chainParams(parameters);
      const points: ExpansionPoint[] = [];
      let x = 0;
      let y = 0;
      for (let i = 0; i < params.lengths.length; i += 1) {
        const length = params.lengths[i] ?? 1;
        x += length * Math.sin(numberAt(s, i));
        y += -length * Math.cos(numberAt(s, i));
        points.push({ x, y });
      }
      return points;
    },
    phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, Math.max(1, Math.floor(s.length / 2))) })
  };
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function relativeDrift(value: number, initial: number): number {
  return Math.abs(value - initial) / Math.max(1e-12, Math.abs(initial));
}

function maxAbs(state: ArrayLike<number>): number {
  let value = 0;
  for (let i = 0; i < state.length; i += 1) value = Math.max(value, Math.abs(numberAt(state, i)));
  return value;
}

function cloneState(state: ArrayLike<number>): Float64Array {
  return Float64Array.from(Array.from({ length: state.length }, (_, i) => numberAt(state, i)));
}

function simulateMethod(
  system: ExpansionSystem,
  method: IntegratorId,
  dt: number,
  steps: number,
  sampleStride: number
): ExpansionMethodResult {
  const state = cloneState(system.initialState);
  const out = new Float64Array(state.length);
  const previousError = { value: 0 };
  const e0 = system.energy(state);
  let eMin = e0;
  let eMax = e0;
  let stable = true;
  let completedSteps = 0;
  const samples: ExpansionTrajectorySample[] = [];
  const started = nowMs();

  for (let i = 0; i < steps; i += 1) {
    step(method, state, dt, system.rhs, out, { tolerance: 1e-9, previousError });
    state.set(out);
    completedSteps = i + 1;
    const energy = system.energy(state);
    eMin = Math.min(eMin, energy);
    eMax = Math.max(eMax, energy);
    if (!Number.isFinite(energy) || maxAbs(state) > 1e6) {
      stable = false;
      break;
    }
    if (i % sampleStride === 0 || i === steps - 1) {
      samples.push({
        time: (i + 1) * dt,
        state: Array.from(state),
        energy,
        phase: system.phasePoint(state),
        coordinates: system.coordinates(state)
      });
    }
  }

  const elapsedMs = Math.max(0.001, nowMs() - started);
  const finalEnergy = system.energy(state);
  return {
    method,
    stable,
    completedSteps,
    elapsedMs,
    stepsPerMs: completedSteps / elapsedMs,
    energyDrift: relativeDrift(finalEnergy, e0),
    energySpan: Math.abs(eMax - eMin) / Math.max(1e-12, Math.abs(e0)),
    referenceDivergence: 0,
    maxAbsState: maxAbs(state),
    embeddedError: previousError.value > 0 ? previousError.value : null,
    finalState: Array.from(state),
    samples
  };
}

function stateDistance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function scoreRow(row: ExpansionMethodResult, conservative: boolean): number {
  const driftPenalty = conservative ? Math.log10(1 + row.energyDrift * 1e6) : Math.log10(1 + row.referenceDivergence * 1e4);
  const stabilityPenalty = row.stable ? 0 : 100;
  const speedBonus = Math.log10(1 + row.stepsPerMs);
  return Math.max(0, 100 - driftPenalty * 12 - Math.log10(1 + row.referenceDivergence * 1e6) * 9 - stabilityPenalty + speedBonus * 2);
}

function heatmapFromSamples(samples: readonly ExpansionTrajectorySample[], bins = 36): ExpansionHeatmap {
  const yMaxRaw = Math.max(1, ...samples.map((sample) => Math.abs(sample.phase.y)));
  const yMax = Math.min(40, Math.max(2, yMaxRaw));
  const counts = Array.from({ length: bins }, () => Array.from({ length: bins }, () => 0));
  let maxCount = 0;
  for (const sample of samples) {
    const xi = Math.max(0, Math.min(bins - 1, Math.floor(((sample.phase.x + Math.PI) / (Math.PI * 2)) * bins)));
    const yi = Math.max(0, Math.min(bins - 1, Math.floor(((sample.phase.y + yMax) / (2 * yMax)) * bins)));
    const row = counts[yi]!;
    row[xi] = (row[xi] ?? 0) + 1;
    maxCount = Math.max(maxCount, row[xi] ?? 0);
  }
  return { xMin: -Math.PI, xMax: Math.PI, yMin: -yMax, yMax, bins, counts, maxCount };
}

function ghostFrames(system: ExpansionSystem, method: IntegratorId, dt: number, steps: number, sampleStride: number, epsilon: number): ExpansionGhostFrame[] {
  const base = cloneState(system.initialState);
  const ghost = cloneState(system.initialState);
  ghost[0] = numberAt(ghost, 0) + epsilon;
  const outA = new Float64Array(base.length);
  const outB = new Float64Array(ghost.length);
  const frames: ExpansionGhostFrame[] = [];
  for (let i = 0; i < steps; i += 1) {
    step(method, base, dt, system.rhs, outA);
    step(method, ghost, dt, system.rhs, outB);
    base.set(outA);
    ghost.set(outB);
    if (i % sampleStride === 0 || i === steps - 1) {
      frames.push({
        time: (i + 1) * dt,
        divergence: stateDistance(Array.from(base), Array.from(ghost)),
        base: system.coordinates(base),
        ghost: system.coordinates(ghost)
      });
    }
  }
  return frames;
}

function bifurcationPreview(config: Required<Pick<ExpansionSuiteConfig, 'model' | 'dt' | 'horizon' | 'bifurcationColumns'>> & {
  parameterOverrides: Partial<ExpansionParameterMap>;
  initialState?: readonly number[];
}): ExpansionBifurcationColumn[] {
  const definition = expansionModelDefinition(config.model);
  const columns: ExpansionBifurcationColumn[] = [];
  const count = Math.max(4, Math.min(32, Math.round(config.bifurcationColumns)));
  const steps = Math.max(100, Math.min(5000, Math.round((config.horizon * 0.7) / config.dt)));
  const transient = Math.floor(steps * 0.65);
  const stride = Math.max(1, Math.floor((steps - transient) / 24));
  for (let c = 0; c < count; c += 1) {
    const u = count === 1 ? 0 : c / (count - 1);
    const value = definition.sweep.min + (definition.sweep.max - definition.sweep.min) * u;
    const system = createExpansionSystem(config.model, { ...config.parameterOverrides, [definition.sweep.parameter]: value }, config.initialState);
    const state = cloneState(system.initialState);
    const out = new Float64Array(state.length);
    const values: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      step('rk4', state, config.dt, system.rhs, out);
      state.set(out);
      if (i >= transient && i % stride === 0) values.push(system.phasePoint(state).x);
    }
    columns.push({ parameter: value, values });
  }
  return columns;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function stableExperimentHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `exp-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function shareHash(config: ExpansionSuiteConfig): string {
  const payload = stableStringify({
    model: config.model,
    dt: config.dt,
    horizon: config.horizon,
    methods: config.methods,
    parameterOverrides: config.parameterOverrides
  });
  if (typeof btoa === 'function') return `#expansion=${btoa(payload).replace(/=+$/g, '')}`;
  return `#expansion=${encodeURIComponent(payload)}`;
}

export function parseExpansionShareHash(hash: string): ExpansionSuiteConfig | null {
  const marker = '#expansion=';
  if (!hash.startsWith(marker)) return null;
  const raw = hash.slice(marker.length);
  try {
    const json = typeof atob === 'function' ? atob(raw) : decodeURIComponent(raw);
    const parsed = JSON.parse(json) as Partial<ExpansionSuiteConfig>;
    if (!parsed.model || !EXPANSION_MODEL_IDS.includes(parsed.model)) return null;
    return {
      model: parsed.model,
      ...(Array.isArray(parsed.methods) ? { methods: parsed.methods.filter((method): method is IntegratorId => typeof method === 'string') as IntegratorId[] } : {}),
      ...(typeof parsed.dt === 'number' ? { dt: parsed.dt } : {}),
      ...(typeof parsed.horizon === 'number' ? { horizon: parsed.horizon } : {}),
      ...(parsed.parameterOverrides && typeof parsed.parameterOverrides === 'object' ? { parameterOverrides: parsed.parameterOverrides as ExpansionParameterMap } : {})
    };
  } catch {
    return null;
  }
}

export function expansionPreset(id: string): ExpansionPreset {
  const preset = EXPANSION_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`unknown expansion preset: ${id}`);
  return preset;
}

export function configFromPreset(id: string): ExpansionSuiteConfig {
  const preset = expansionPreset(id);
  return {
    ...preset.config,
    parameterOverrides: { ...(preset.config.parameterOverrides ?? {}) },
    ...(preset.config.initialState === undefined ? {} : { initialState: [...preset.config.initialState] }),
    ...(preset.config.methods === undefined ? {} : { methods: [...preset.config.methods] })
  };
}

export function buildExpansionReport(result: ExpansionSuiteResult): string {
  const rows = result.rows
    .map((row) => `| ${row.method} | ${row.stable ? 'yes' : 'no'} | ${row.energyDrift.toExponential(3)} | ${row.referenceDivergence.toExponential(3)} | ${row.stepsPerMs.toFixed(1)} |`)
    .join('\n');
  const params = Object.entries(result.parameters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  const definition = expansionModelDefinition(result.model);
  return [
    `# Pendulum Expansion Report`,
    ``,
    `Model: ${result.modelLabel}`,
    `Family: ${result.family}`,
    `Hash: ${result.manifest.hash}`,
    `Generated: ${result.generatedAt}`,
    ``,
    `## Model`,
    definition.equation,
    ``,
    `Energy: ${definition.energyNote}`,
    `Caveat: ${definition.caveat}`,
    ``,
    `## Parameters`,
    params,
    ``,
    `## Integrator Comparison`,
    `| Method | Stable | Energy drift | Ref divergence | Steps/ms |`,
    `|---|---:|---:|---:|---:|`,
    rows,
    ``,
    `## Summary`,
    `- Best method: ${result.summary.bestMethod}`,
    `- Best score: ${result.summary.bestScore}`,
    `- Stable methods: ${result.summary.stableMethods}/${result.rows.length}`,
    `- Energy shell span: ${result.summary.energyShellSpan.toExponential(3)}`,
    `- Max ghost divergence: ${result.summary.maxGhostDivergence.toExponential(3)}`,
    ``,
    `## Reproducibility`,
    `- dt: ${result.dt}`,
    `- horizon: ${result.horizon}`,
    `- initial state: [${result.initialState.join(', ')}]`,
    `- share: ${result.manifest.shareHash}`
  ].join('\n');
}

export function runGoldenExpansionChecks(presetIds: readonly string[] = GOLDEN_EXPANSION_PRESET_IDS): GoldenExperimentResult[] {
  return presetIds.map((presetId) => {
    const preset = expansionPreset(presetId);
    const result = runExpansionSuite({
      ...configFromPreset(presetId),
      methods: ['rk4', 'dopri5', 'leapfrog'],
      sampleLimit: 80,
      bifurcationColumns: 5
    });
    const conservativeLimit = result.conservative ? 0.08 : 1;
    const ok = result.summary.stableMethods >= 2 && result.summary.energyShellSpan <= conservativeLimit && Number.isFinite(result.summary.maxGhostDivergence);
    return {
      presetId,
      label: preset.label,
      ok,
      hash: result.manifest.hash,
      bestMethod: result.summary.bestMethod,
      energyShellSpan: result.summary.energyShellSpan,
      maxGhostDivergence: result.summary.maxGhostDivergence,
      reason: ok ? 'within golden thresholds' : `threshold miss: shell=${result.summary.energyShellSpan.toExponential(2)}, stable=${result.summary.stableMethods}`
    };
  });
}

export function runExpansionBatch(presetIds: readonly string[] = EXPANSION_PRESETS.map((preset) => preset.id)): BatchExperimentResult[] {
  return presetIds.map((presetId) => {
    const preset = expansionPreset(presetId);
    return {
      presetId,
      label: preset.label,
      result: runExpansionSuite({
        ...configFromPreset(presetId),
        methods: ['rk4', 'dopri5', 'symplectic'],
        sampleLimit: 72,
        bifurcationColumns: 5
      })
    };
  });
}

export function runExpansionSuite(config: ExpansionSuiteConfig, options: { includeLyapunov?: boolean } = {}): ExpansionSuiteResult {
  const definition = expansionModelDefinition(config.model);
  const methods = [...(config.methods?.length ? config.methods : DEFAULT_EXPANSION_METHODS)];
  const dt = config.dt ?? definition.defaultDt;
  const horizon = config.horizon ?? definition.defaultHorizon;
  const steps = Math.max(10, Math.min(80_000, Math.round(horizon / dt)));
  const sampleLimit = Math.max(24, Math.min(600, Math.round(config.sampleLimit ?? 240)));
  const sampleStride = Math.max(1, Math.floor(steps / sampleLimit));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const rows = methods.map((method) => simulateMethod(system, method, dt, steps, sampleStride));
  const reference = rows[0]!;
  for (const row of rows) row.referenceDivergence = row === reference ? 0 : stateDistance(row.finalState, reference.finalState);
  const best = rows.reduce((acc, row) => (scoreRow(row, definition.conservative) > scoreRow(acc, definition.conservative) ? row : acc), rows[0]!);
  const primarySamples = best.samples.length > 0 ? best.samples : reference.samples;
  const ghost = ghostFrames(system, best.method, dt, Math.min(steps, Math.round(18 / dt)), sampleStride, config.ghostEpsilon ?? 1e-5);
  const lyapunov = options.includeLyapunov ? expansionLyapunovProfile(config, { maxTimelinePoints: 120 }) : undefined;
  const maxGhostDivergence = Math.max(0, ...ghost.map((frame) => frame.divergence));
  const energyShellSpan = Math.max(0, ...rows.map((row) => row.energySpan));
  const createdAt = new Date().toISOString();
  const summary = {
    bestMethod: best.method,
    bestScore: Number(scoreRow(best, definition.conservative).toFixed(2)),
    stableMethods: rows.filter((row) => row.stable).length,
    maxGhostDivergence,
    energyShellSpan
  };
  const hashPayload = {
    model: config.model,
    parameters: system.parameters,
    initialState: Array.from(system.initialState),
    methods,
    dt,
    horizon,
    summary,
    rows: rows.map((row) => ({ method: row.method, energyDrift: row.energyDrift, referenceDivergence: row.referenceDivergence, stable: row.stable }))
  };
  const hash = stableExperimentHash(hashPayload);
  return {
    schemaVersion: 'pendulum-expansion-suite/v1',
    generatedAt: createdAt,
    model: config.model,
    modelLabel: definition.label,
    family: definition.family,
    conservative: definition.conservative,
    parameters: system.parameters,
    initialState: Array.from(system.initialState),
    methods,
    referenceMethod: reference.method,
    dt,
    horizon,
    rows,
    phaseHeatmap: heatmapFromSamples(primarySamples),
    ghost,
    ...(lyapunov ? { lyapunov } : {}),
    bifurcation: bifurcationPreview({
      model: config.model,
      dt,
      horizon,
      bifurcationColumns: config.bifurcationColumns ?? 12,
      parameterOverrides: config.parameterOverrides ?? {},
      ...(config.initialState === undefined ? {} : { initialState: config.initialState })
    }),
    replay: primarySamples.map((sample) => sample.coordinates),
    summary,
    manifest: {
      schemaVersion: 'pendulum-expansion-manifest/v1',
      hash,
      shareHash: shareHash({ ...config, dt, horizon, methods }),
      createdAt
    }
  };
}

function parameterUnit(model: ExpansionModelId, parameter: string): string {
  const units: Record<string, string> = {
    g: 'm/s^2',
    length: 'm',
    length1: 'm',
    length2: 'm',
    length3: 'm',
    length4: 'm',
    damping: '1/s',
    driveAmplitude: 'rad/s^2',
    driveFrequency: 'rad/s',
    frequency: 'rad/s',
    amplitude: '1',
    coupling: '1/s^2',
    force: 'N',
    friction: 'N s/m',
    cartMass: 'kg',
    poleMass: 'kg',
    links: 'count'
  };
  if (model === 'spherical' && parameter === 'length') return 'm';
  return units[parameter] ?? 'model unit';
}

function modelAxis(model: ExpansionModelId, parameter: string, label: string, min: number, max: number): ExpansionSweepAxis {
  return { parameter, label, unit: parameterUnit(model, parameter), min, max };
}

function researchAxes(model: ExpansionModelId): { xAxis: ExpansionSweepAxis; yAxis: ExpansionSweepAxis } {
  switch (model) {
    case 'driven':
      return {
        xAxis: modelAxis(model, 'driveAmplitude', 'drive amplitude', 0.7, 1.45),
        yAxis: modelAxis(model, 'damping', 'damping', 0.05, 0.9)
      };
    case 'cartpole':
      return {
        xAxis: modelAxis(model, 'force', 'cart force', -3, 3),
        yAxis: modelAxis(model, 'length', 'pole length', 0.35, 1.4)
      };
    case 'parametric':
      return {
        xAxis: modelAxis(model, 'amplitude', 'modulation amplitude', 0, 0.7),
        yAxis: modelAxis(model, 'frequency', 'modulation frequency', 3, 9)
      };
    case 'coupled':
      return {
        xAxis: modelAxis(model, 'coupling', 'coupling', 0.1, 5),
        yAxis: modelAxis(model, 'length', 'length', 0.45, 1.8)
      };
    case 'inverted':
      return {
        xAxis: modelAxis(model, 'g', 'gravity', 2, 18),
        yAxis: modelAxis(model, 'length', 'length', 0.35, 1.8)
      };
    case 'spherical':
    case 'chain':
      return {
        xAxis: modelAxis(model, 'g', 'gravity', 2, 18),
        yAxis: modelAxis(model, 'length', 'length', 0.45, 1.8)
      };
    default: {
      const exhaustive: never = model;
      throw new Error(`unknown research axis model: ${String(exhaustive)}`);
    }
  }
}

function phaseIndexes(model: ExpansionModelId, stateLength: number): { position: number; velocity: number } {
  switch (model) {
    case 'cartpole':
      return { position: 1, velocity: 3 };
    case 'coupled':
      return { position: 0, velocity: 2 };
    case 'spherical':
      return { position: 0, velocity: 2 };
    case 'chain':
      return { position: 0, velocity: Math.max(1, Math.floor(stateLength / 2)) };
    case 'driven':
    case 'inverted':
    case 'parametric':
      return { position: 0, velocity: 1 };
    default: {
      const exhaustive: never = model;
      throw new Error(`unknown phase-index model: ${String(exhaustive)}`);
    }
  }
}

function primaryLength(parameters: ExpansionParameterMap): number {
  const direct = finiteParam(parameters, 'length', Number.NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const length1 = finiteParam(parameters, 'length1', Number.NaN);
  return Number.isFinite(length1) && length1 > 0 ? length1 : 1;
}

function primaryMass(parameters: ExpansionParameterMap): number {
  const cartMass = finiteParam(parameters, 'cartMass', Number.NaN);
  const poleMass = finiteParam(parameters, 'poleMass', Number.NaN);
  if (Number.isFinite(cartMass) && Number.isFinite(poleMass)) return Math.max(1e-9, cartMass + poleMass);
  return Math.max(1e-9, finiteParam(parameters, 'mass1', 1));
}

function rounded(value: number, digits = 6): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function miniGraphFromSamples(samples: readonly ExpansionTrajectorySample[], count = 28): number[] {
  if (samples.length === 0) return [];
  const stride = Math.max(1, Math.floor(samples.length / count));
  const values = samples.filter((_, index) => index % stride === 0).slice(0, count).map((sample) => sample.energy);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-12, max - min);
  return values.map((value) => rounded((value - min) / span, 4));
}

function comparisonRow(
  suite: ExpansionSuiteResult,
  row: ExpansionMethodResult,
  label: string,
  kind: ResearchComparisonKind,
  variedParameter: string,
  parameterValue: number
): ResearchComparisonRun {
  return {
    id: `${kind}-${label}-${row.method}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    kind,
    hash: suite.manifest.hash,
    model: suite.model,
    variedParameter,
    parameterValue,
    method: row.method,
    stable: row.stable,
    stabilityScore: Number(scoreRow(row, suite.conservative).toFixed(2)),
    energyDrift: row.energyDrift,
    referenceDivergence: row.referenceDivergence,
    runtimeMs: row.elapsedMs,
    miniGraph: miniGraphFromSamples(row.samples)
  };
}

function quickProbe(config: ExpansionSuiteConfig, method: IntegratorId, horizonCap = 5): {
  row: ExpansionMethodResult;
  score: number;
  finalPhase: ExpansionPoint;
} {
  const definition = expansionModelDefinition(config.model);
  const dt = config.dt ?? definition.defaultDt;
  const horizon = Math.min(config.horizon ?? definition.defaultHorizon, horizonCap);
  const steps = Math.max(10, Math.min(16_000, Math.round(horizon / dt)));
  const stride = Math.max(1, Math.floor(steps / 60));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const row = simulateMethod(system, method, dt, steps, stride);
  const finalPhase = row.samples[row.samples.length - 1]?.phase ?? system.phasePoint(row.finalState);
  return { row, score: scoreRow(row, definition.conservative), finalPhase };
}

function interpolate(min: number, max: number, index: number, size: number): number {
  return size <= 1 ? (min + max) / 2 : min + (max - min) * (index / (size - 1));
}

function build2dSweep(config: ExpansionSuiteConfig, gridSize: number): ExpansionResearchMatrixResult['sweep2d'] {
  const { xAxis, yAxis } = researchAxes(config.model);
  const size = Math.max(4, Math.min(12, Math.round(gridSize)));
  const cells: ExpansionMatrixCell[] = [];
  for (let yIndex = 0; yIndex < size; yIndex += 1) {
    const y = interpolate(yAxis.min, yAxis.max, yIndex, size);
    for (let xIndex = 0; xIndex < size; xIndex += 1) {
      const x = interpolate(xAxis.min, xAxis.max, xIndex, size);
      const { row, score, finalPhase } = quickProbe({
        ...config,
        methods: ['rk4'],
        parameterOverrides: {
          ...(config.parameterOverrides ?? {}),
          [xAxis.parameter]: x,
          [yAxis.parameter]: y
        },
        sampleLimit: 48,
        bifurcationColumns: 4
      }, 'rk4', 4);
      cells.push({
        x,
        y,
        score: Number(score.toFixed(2)),
        stable: row.stable,
        energyDrift: row.energyDrift,
        runtimeMs: row.elapsedMs,
        finalPhase
      });
    }
  }
  return { xAxis, yAxis, size, cells };
}

function physicalMetricsFor(config: ExpansionSuiteConfig, result: ExpansionSuiteResult): ExpansionDimensionlessMetric[] {
  const parameters = result.parameters;
  const g = Math.max(1e-9, finiteParam(parameters, 'g', 9.81));
  const length = Math.max(1e-9, primaryLength(parameters));
  const characteristicTime = Math.sqrt(length / g);
  const dt = result.dt;
  const horizon = result.horizon;
  const damping = finiteParam(parameters, 'damping', 0);
  const driveFrequency = finiteParam(parameters, 'driveFrequency', finiteParam(parameters, 'frequency', 0));
  const force = finiteParam(parameters, 'force', 0);
  const coupling = finiteParam(parameters, 'coupling', 0);
  const driveAmplitude = finiteParam(parameters, 'driveAmplitude', finiteParam(parameters, 'amplitude', 0));
  const metrics: ExpansionDimensionlessMetric[] = [
    { id: 't0', label: 'Characteristic time', value: characteristicTime, unit: 's', note: 'sqrt(length / gravity)' },
    { id: 'dt-star', label: 'dt / t0', value: dt / characteristicTime, unit: '1', note: 'time-step resolution' },
    { id: 'horizon-star', label: 'T / t0', value: horizon / characteristicTime, unit: '1', note: 'dimensionless experiment horizon' }
  ];
  if (damping > 0) metrics.push({ id: 'damping-star', label: 'gamma t0', value: damping * characteristicTime, unit: '1', note: 'dimensionless damping' });
  if (driveFrequency > 0) metrics.push({ id: 'drive-frequency-star', label: 'Omega t0', value: driveFrequency * characteristicTime, unit: '1', note: 'drive frequency ratio' });
  if (driveAmplitude !== 0) metrics.push({ id: 'forcing-star', label: 'forcing ratio', value: Math.abs(driveAmplitude) / Math.max(1e-9, g / length), unit: '1', note: 'forcing versus gravity scale' });
  if (force !== 0) metrics.push({ id: 'force-star', label: 'F / mg', value: force / (primaryMass(parameters) * g), unit: '1', note: 'cart-pole open-loop force ratio' });
  if (coupling !== 0) metrics.push({ id: 'coupling-star', label: 'k / (g/l)', value: coupling / (g / length), unit: '1', note: 'coupling versus pendulum frequency squared' });
  if (config.model === 'cartpole') {
    const cart = finiteParam(parameters, 'cartMass', 1);
    const pole = finiteParam(parameters, 'poleMass', 0.16);
    metrics.push({ id: 'mass-ratio', label: 'pole/cart mass', value: pole / Math.max(1e-9, cart), unit: '1', note: 'underactuated mass ratio' });
  }
  return metrics.map((metric) => ({ ...metric, value: rounded(metric.value, 6) }));
}

function poincareSection(config: ExpansionSuiteConfig, method: IntegratorId): ExpansionPoincarePoint[] {
  const definition = expansionModelDefinition(config.model);
  const dt = config.dt ?? definition.defaultDt;
  const horizon = Math.min(config.horizon ?? definition.defaultHorizon, 20);
  const steps = Math.max(10, Math.min(45_000, Math.round(horizon / dt)));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const state = cloneState(system.initialState);
  const out = new Float64Array(state.length);
  const points: ExpansionPoincarePoint[] = [];
  let previousDriveTurn = Math.floor(numberAt(state, 2) / (Math.PI * 2));
  let previousPhase = system.phasePoint(state);
  for (let i = 0; i < steps && points.length < 180; i += 1) {
    step(method, state, dt, system.rhs, out);
    state.set(out);
    const phase = system.phasePoint(state);
    const time = (i + 1) * dt;
    let hit = false;
    if (config.model === 'driven' || config.model === 'parametric') {
      const turn = Math.floor(numberAt(state, 2) / (Math.PI * 2));
      hit = turn > previousDriveTurn;
      previousDriveTurn = turn;
    } else {
      hit = previousPhase.x < 0 && phase.x >= 0 && phase.y > 0;
    }
    if (hit) points.push({ x: phase.x, y: phase.y, time });
    previousPhase = phase;
  }
  return points;
}

/** Kaplan–Yorke (Lyapunov) dimension from a spectrum (descending or not). */
function kaplanYorke(spectrumInput: readonly number[]): number {
  const spectrum = [...spectrumInput].sort((a, b) => b - a);
  let partial = 0;
  let j = 0;
  for (; j < spectrum.length; j += 1) {
    const next = partial + (spectrum[j] ?? 0);
    if (next < 0) break;
    partial = next;
  }
  if (j === 0) return 0;
  if (j >= spectrum.length) return spectrum.length;
  const nextExp = spectrum[j] ?? 0;
  return nextExp === 0 ? j : j + partial / Math.abs(nextExp);
}

const LYAPUNOV_SEED = 0x5eed_1357;

/**
 * Batched-means ("non-overlapping block bootstrap") standard error over the
 * converged tail of a per-interval local-exponent series. The per-interval
 * exponents are strongly autocorrelated, so the naive standard error is an
 * optimistic lower bound; splitting the converged tail into `numBlocks`
 * contiguous blocks and taking the standard error of the block means
 * decorrelates the estimate. Falls back to the naive tail SE when there are too
 * few samples to form blocks. Mirrors `batchedStandardError` (chaos/lyapunov).
 */
function blockStandardError(samples: readonly number[], numBlocks = 10): number {
  const start = Math.floor(samples.length / 2);
  const tail = samples.slice(start);
  const m = tail.length;
  const naive = (): number => {
    if (m < 2) return 0;
    let mean = 0;
    for (const value of tail) mean += value;
    mean /= m;
    let variance = 0;
    for (const value of tail) variance += (value - mean) ** 2;
    variance /= m - 1;
    return Math.sqrt(variance / m);
  };
  if (numBlocks < 2 || m < 2 * numBlocks) return naive();
  const blockLen = Math.floor(m / numBlocks);
  const means: number[] = [];
  for (let b = 0; b < numBlocks; b += 1) {
    let s = 0;
    for (let i = 0; i < blockLen; i += 1) s += tail[b * blockLen + i] ?? 0;
    means.push(s / blockLen);
  }
  let mean = 0;
  for (const value of means) mean += value;
  mean /= numBlocks;
  let variance = 0;
  for (const value of means) variance += (value - mean) ** 2;
  variance /= numBlocks - 1;
  return Math.sqrt(variance / numBlocks);
}

/**
 * Exact analytic Jacobian for the expansion models that have one — the driven
 * pendulum (closed form) and the planar N-link chain (autodiff) — built from
 * the same parameters as the exact RHS `createExpansionSystem` integrates.
 * Returns `undefined` for the models without a closed-form/autodiff Jacobian
 * (coupled, inverted, cart-pole, parametric, spherical), which keep the O(h²)
 * central-difference Jacobian.
 */
function exactJacobianFor(model: ExpansionModelId, parameters: ExpansionParameterMap): Jacobian | undefined {
  if (model === 'driven') {
    const params = drivenParams(parameters);
    return (state, jac) => {
      jacobianDriven(state, params, jac);
    };
  }
  if (model === 'chain') {
    const params = chainParams(parameters);
    const gamma = finiteParam(parameters, 'damping', 0);
    const workspace = createChainJacobianWorkspace(chainLength(params));
    return (state, jac) => {
      jacobianChain(state, params, gamma, jac, workspace);
    };
  }
  return undefined;
}

/**
 * The true Lyapunov profile of an expansion model: integrate the model together
 * with `count` deviation vectors under the variational equation v' = J(x)·v,
 * reorthonormalize with Gram-Schmidt at a fixed cadence, and accumulate the log
 * growth of each direction. This is the standard Benettin–Shimada–Nagashima /
 * Wolf QR algorithm, so every exponent is a genuine Lyapunov exponent — unlike
 * the ghost divergence, which saturates once the trajectories decorrelate and
 * can only ever probe the leading direction. The driven pendulum and the planar
 * chain use their exact analytic Jacobian; the other models use an O(h²)
 * central-difference Jacobian. A reliable fixed-step RK4 advances the tangent
 * flow regardless of which integrator the comparison table is exercising. Each
 * exponent carries a block-bootstrap standard error, and the whole spectrum is
 * checked for Hamiltonian self-consistency (Σλ ≈ 0, symplectic pairing).
 */
export function expansionLyapunovProfile(
  config: ExpansionSuiteConfig,
  options: { maxTimelinePoints?: number; horizonCap?: number; forceNumericalJacobian?: boolean } = {}
): ExpansionLyapunovProfile {
  const definition = expansionModelDefinition(config.model);
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const n = definition.dimension;
  const k = n;
  const dt = Math.max(1e-4, Math.min(config.dt ?? definition.defaultDt, 0.02));
  const horizon = Math.max(4, Math.min(config.horizon ?? definition.defaultHorizon, options.horizonCap ?? 24));
  const steps = Math.max(200, Math.min(60_000, Math.round(horizon / dt)));
  const renormEvery = Math.max(1, Math.round(0.05 / dt));
  const transientSteps = Math.min(steps >> 1, Math.max(0, Math.round(steps * 0.1)));
  const jacobian = options.forceNumericalJacobian ? undefined : exactJacobianFor(definition.id, system.parameters);
  const varRhs = makeVariationalRhs(system.rhs, n, k, jacobian);

  // Burn the transient on the reference alone before attaching the tangent frame.
  const refState = cloneState(system.initialState);
  const refOut = new Float64Array(n);
  for (let i = 0; i < transientSteps; i += 1) {
    rk4Step(refState, dt, system.rhs, refOut);
    refState.set(refOut);
  }
  const aug = new Float64Array(n * (k + 1));
  aug.set(refState, 0);
  seedTangentFrame(aug, n, k, LYAPUNOV_SEED);
  const augOut = new Float64Array(aug.length);
  const views: StateVector[] = [];
  for (let j = 0; j < k; j += 1) views.push(aug.subarray(n + j * n, n + (j + 1) * n));

  const accum = new Array<number>(k).fill(0);
  const localSeries: number[][] = Array.from({ length: k }, () => []);
  const intervalTime = renormEvery * dt;
  const renormIntervals = Math.floor((steps - transientSteps) / renormEvery);
  const timeline: ExpansionLyapunovTimelinePoint[] = [];
  const maxPoints = Math.max(8, options.maxTimelinePoints ?? 140);
  const recordStride = Math.max(1, Math.floor(renormIntervals / maxPoints));
  let elapsed = 0;
  for (let interval = 0; interval < renormIntervals; interval += 1) {
    for (let s = 0; s < renormEvery; s += 1) {
      rk4Step(aug, dt, varRhs, augOut);
      aug.set(augOut);
    }
    const norms = gramSchmidt(views, n);
    for (let j = 0; j < k; j += 1) {
      const growth = Math.log(Math.max(norms[j] ?? 1e-300, 1e-300));
      accum[j] = (accum[j] ?? 0) + growth;
      localSeries[j]!.push(growth / intervalTime);
    }
    elapsed += intervalTime;
    if (interval % recordStride === 0 || interval === renormIntervals - 1) {
      // Each GS direction yields one exponent; at finite time their running
      // estimates can cross, so the *leading* and *secondary* curves are the two
      // largest running exponents (which converge onto spectrum[0]/spectrum[1]).
      const running = accum.map((value) => (value ?? 0) / elapsed).sort((a, b) => b - a);
      const leading = running[0] ?? 0;
      const secondary = k > 1 ? running[1] ?? 0 : 0;
      if (Number.isFinite(leading) && Number.isFinite(secondary)) {
        timeline.push({ time: rounded(elapsed, 4), leading: rounded(leading, 6), secondary: rounded(secondary, 6) });
      }
    }
  }

  // Pair each exponent with its block standard error before sorting so the
  // error bars stay aligned with the descending-sorted exponents.
  const paired = accum.map((value, j) => ({
    lambda: elapsed > 0 ? value / elapsed : 0,
    blockSe: blockStandardError(localSeries[j] ?? [])
  }));
  paired.sort((a, b) => b.lambda - a.lambda);
  const spectrum = paired.map((p) => p.lambda);
  const sum = spectrum.reduce((acc, value) => acc + value, 0);
  return {
    spectrum: spectrum.map((value) => rounded(value, 6)),
    blockStdError: paired.map((p) => rounded(p.blockSe, 6)),
    sum: rounded(sum, 8),
    kaplanYorkeDimension: rounded(kaplanYorke(spectrum), 4),
    leadingExponent: rounded(spectrum[0] ?? 0, 6),
    consistency: analyzeSpectrumConsistency(spectrum),
    timeline,
    settings: { dt, steps, renormEvery, transientSteps, count: k, jacobian: jacobian ? 'exact' : 'central-difference' }
  };
}

function basinGrid(config: ExpansionSuiteConfig, gridSize: number): ExpansionResearchMatrixResult['diagnostics']['basin'] {
  const definition = expansionModelDefinition(config.model);
  const size = Math.max(5, Math.min(13, Math.round(gridSize)));
  const state0 = [...(config.initialState ?? definition.defaultState)];
  const indexes = phaseIndexes(config.model, state0.length);
  const xAxis = modelAxis(config.model, 'initial position', 'initial phase coordinate', -Math.PI, Math.PI);
  const yAxis = modelAxis(config.model, 'initial velocity', 'initial phase velocity', -4, 4);
  const cells: ExpansionBasinCell[] = [];
  for (let yi = 0; yi < size; yi += 1) {
    const y = interpolate(yAxis.min, yAxis.max, yi, size);
    for (let xi = 0; xi < size; xi += 1) {
      const x = interpolate(xAxis.min, xAxis.max, xi, size);
      const state = [...state0];
      state[indexes.position] = x;
      state[indexes.velocity] = y;
      const { row, finalPhase } = quickProbe({ ...config, initialState: state, methods: ['rk4'], sampleLimit: 24, bifurcationColumns: 4 }, 'rk4', 3);
      const basin = !row.stable ? 3 : finalPhase.x < -0.35 ? 0 : finalPhase.x > 0.35 ? 1 : 2;
      cells.push({ x, y, basin, stable: row.stable });
    }
  }
  return { xAxis, yAxis, size, cells };
}

function energyLandscape(config: ExpansionSuiteConfig, gridSize: number): ExpansionResearchMatrixResult['diagnostics']['energyLandscape'] {
  const definition = expansionModelDefinition(config.model);
  const size = Math.max(9, Math.min(31, Math.round(gridSize * 2 + 3)));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const state0 = [...system.initialState];
  const indexes = phaseIndexes(config.model, state0.length);
  const referenceEnergy = system.energy(system.initialState);
  const xAxis = modelAxis(config.model, 'phase position', 'phase coordinate', -Math.PI, Math.PI);
  const yAxis = modelAxis(config.model, 'phase velocity', 'phase velocity', -6, 6);
  const cells: ExpansionEnergyCell[] = [];
  const scale = Math.max(1e-9, Math.abs(referenceEnergy));
  for (let yi = 0; yi < size; yi += 1) {
    const y = interpolate(yAxis.min, yAxis.max, yi, size);
    for (let xi = 0; xi < size; xi += 1) {
      const x = interpolate(xAxis.min, xAxis.max, xi, size);
      const state = [...state0];
      state[indexes.position] = x;
      state[indexes.velocity] = y;
      const energy = system.energy(state);
      cells.push({ x, y, energy, separatrix: Math.abs(energy - referenceEnergy) / scale < 0.06 });
    }
  }
  return { xAxis, yAxis, size, cells, referenceEnergy };
}

function comparisonSuiteConfig(config: ExpansionSuiteConfig, parameter: string, value: number): ExpansionSuiteConfig {
  const definition = expansionModelDefinition(config.model);
  return {
    ...config,
    parameterOverrides: { ...(config.parameterOverrides ?? {}), [parameter]: value },
    methods: ['rk4', 'dopri5', 'symplectic'],
    horizon: Math.min(config.horizon ?? definition.defaultHorizon, 8),
    sampleLimit: 80,
    bifurcationColumns: 5
  };
}

export function runResearchMatrixStudy(config: ExpansionSuiteConfig, options: { gridSize?: number } = {}): ExpansionResearchMatrixResult {
  const definition = expansionModelDefinition(config.model);
  const gridSize = options.gridSize ?? 8;
  const base = runExpansionSuite({
    ...config,
    methods: config.methods?.length ? config.methods : DEFAULT_EXPANSION_METHODS,
    sampleLimit: config.sampleLimit ?? 160,
    bifurcationColumns: config.bifurcationColumns ?? 8
  });
  const comparison: ResearchComparisonRun[] = [];
  for (const row of base.rows) {
    comparison.push(comparisonRow(base, row, `same condition / ${row.method}`, 'integrator', definition.sweep.parameter, base.parameters[definition.sweep.parameter] ?? 0));
  }

  const current = base.parameters[definition.sweep.parameter] ?? (definition.sweep.min + definition.sweep.max) / 2;
  const parameterValues = [
    definition.sweep.min,
    Math.max(definition.sweep.min, Math.min(definition.sweep.max, current)),
    definition.sweep.max
  ];
  for (const value of parameterValues) {
    const suite = runExpansionSuite(comparisonSuiteConfig(config, definition.sweep.parameter, value));
    const best = suite.rows.reduce((acc, row) => (scoreRow(row, suite.conservative) > scoreRow(acc, suite.conservative) ? row : acc), suite.rows[0]!);
    comparison.push(comparisonRow(suite, best, `${definition.sweep.label} ${value.toPrecision(3)}`, 'parameter', definition.sweep.parameter, value));
  }

  const sweep2d = build2dSweep(config, gridSize);
  const method = base.summary.bestMethod;
  const poincare = poincareSection(config, method);
  const lyapunov = expansionLyapunovProfile(config);
  const timeline = lyapunov.timeline;
  const basin = basinGrid(config, gridSize);
  const landscape = energyLandscape(config, gridSize);
  const stableComparisons = comparison.filter((row) => row.stable).length;
  const bestComparison = comparison.reduce((acc, row) => (row.stabilityScore > acc.stabilityScore ? row : acc), comparison[0]!);
  const maxLyapunovEstimate = lyapunov.leadingExponent;
  const createdAt = new Date().toISOString();
  const summary = {
    bestComparison: bestComparison.label,
    bestScore: bestComparison.stabilityScore,
    stableComparisons,
    sweepStableRatio: sweep2d.cells.filter((cell) => cell.stable).length / Math.max(1, sweep2d.cells.length),
    maxLyapunovEstimate: Number.isFinite(maxLyapunovEstimate) ? rounded(maxLyapunovEstimate, 6) : 0
  };
  const hash = stableExperimentHash({
    schema: 'pendulum-research-matrix/v1',
    model: config.model,
    parameters: base.parameters,
    initialState: base.initialState,
    dt: base.dt,
    horizon: base.horizon,
    comparison: comparison.map((row) => ({ id: row.id, score: row.stabilityScore, stable: row.stable, hash: row.hash })),
    sweep: sweep2d.cells.map((cell) => ({ x: rounded(cell.x, 4), y: rounded(cell.y, 4), score: rounded(cell.score, 2), stable: cell.stable })),
    summary
  });
  return {
    schemaVersion: 'pendulum-research-matrix/v1',
    generatedAt: createdAt,
    base,
    comparison,
    sweep2d,
    physicalMetrics: physicalMetricsFor(config, base),
    diagnostics: {
      poincare,
      lyapunovTimeline: timeline,
      lyapunovSpectrum: lyapunov.spectrum,
      kaplanYorkeDimension: lyapunov.kaplanYorkeDimension,
      lyapunovConsistency: lyapunov.consistency,
      basin,
      energyLandscape: landscape
    },
    summary,
    manifest: {
      schemaVersion: 'pendulum-research-matrix-manifest/v1',
      hash,
      createdAt
    }
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0;
}

export function runGoldenExpansionCenter(
  presetIds: readonly string[] = GOLDEN_EXPANSION_PRESET_IDS,
  methods: readonly IntegratorId[] = ['rk4', 'dopri5', 'leapfrog', 'symplectic', 'euler']
): GoldenCenterResult {
  const generatedAt = new Date().toISOString();
  const presets = presetIds.map((presetId) => {
    const preset = expansionPreset(presetId);
    const result = runExpansionSuite({
      ...configFromPreset(presetId),
      methods,
      sampleLimit: 80,
      bifurcationColumns: 5
    });
    const driftLimit = result.conservative ? 8e-2 : 1.2;
    const runtimeLimit = 2_000;
    const rows = result.rows.map((row) => {
      const stabilityScore = Number(scoreRow(row, result.conservative).toFixed(2));
      const driftPass = row.energyDrift <= driftLimit;
      const runtimePass = row.elapsedMs <= runtimeLimit;
      const regressionHash = stableExperimentHash({
        presetId,
        method: row.method,
        stable: row.stable,
        energyDrift: rounded(row.energyDrift, 8),
        referenceDivergence: rounded(row.referenceDivergence, 8),
        finalState: row.finalState.map((value) => rounded(value, 6))
      });
      const regressionPass = row.stable && Number.isFinite(row.energyDrift) && /^exp-[0-9a-f]{8}$/.test(regressionHash);
      return {
        presetId,
        presetLabel: preset.label,
        method: row.method,
        pass: row.stable && driftPass && runtimePass && regressionPass,
        driftPass,
        runtimePass,
        regressionPass,
        energyDrift: row.energyDrift,
        runtimeMs: row.elapsedMs,
        stabilityScore,
        regressionHash,
        threshold: `drift <= ${driftLimit.toExponential(1)}, runtime <= ${runtimeLimit} ms`
      };
    });
    return { presetId, label: preset.label, pass: rows.every((row) => row.pass), methods: rows };
  });
  const flat = presets.flatMap((preset) => preset.methods);
  const summary = {
    passed: flat.filter((row) => row.pass).length,
    failed: flat.filter((row) => !row.pass).length,
    totalMethods: flat.length,
    medianRuntimeMs: median(flat.map((row) => row.runtimeMs))
  };
  const hash = stableExperimentHash({
    schema: 'pendulum-golden-center/v1',
    presets: presets.map((preset) => ({
      id: preset.presetId,
      pass: preset.pass,
      rows: preset.methods.map((row) => ({ method: row.method, pass: row.pass, hash: row.regressionHash }))
    })),
    summary
  });
  return {
    schemaVersion: 'pendulum-golden-center/v1',
    generatedAt,
    presets,
    summary,
    manifest: { hash, createdAt: generatedAt }
  };
}
