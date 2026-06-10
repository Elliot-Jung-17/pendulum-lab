import { step, integratorRegistry } from '../physics/integrators';
import { buildRhs, energyForSpec, type SystemSpec } from '../physics/systemSpec';
import { maximalLyapunov } from '../chaos';
import type { IntegratorId } from '../types/domain';

/**
 * Reproducibility-package exporter. A package is a self-contained JSON manifest
 * describing a deterministic run (system spec, integrator, dt, steps, initial
 * state, seed) plus a content hash of those inputs and the resulting final
 * state and key diagnostics. `verifyReproPackage` re-runs from the manifest and
 * confirms the final state reproduces — a machine-checkable provenance record.
 */

export const REPRO_SCHEMA_VERSION = '1.0.0';

export interface ReproRun {
  spec: SystemSpec;
  method: IntegratorId;
  dt: number;
  steps: number;
  state0: number[];
  /** Recorded for provenance; the core integration is deterministic regardless. */
  seed: number | null;
}

export interface ReproResult {
  finalState: number[];
  energyInitial: number;
  energyFinal: number;
  energyDrift: number;
  lambdaMax: number | null;
  integratorName: string;
}

export interface ReproPackage {
  schemaVersion: string;
  generatedAt: string;
  library: { name: string; version: string };
  run: ReproRun;
  inputHash: string;
  result: ReproResult;
}

export interface BuildOptions {
  libraryVersion?: string;
  generatedAt?: string;
  /** Include a maximal-Lyapunov estimate (default true). */
  includeLyapunov?: boolean;
  lyapunovSteps?: number;
}

// ---- deterministic content hashing ---------------------------------------

/** Stable JSON: object keys sorted recursively so the string is canonical. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/** cyrb53 — a fast, dependency-free 53-bit content hash (not cryptographic). */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(14, '0');
}

/** Hash of the run inputs only (not timestamp/version), so it is reproducible. */
export function hashRunInputs(run: ReproRun): string {
  return cyrb53(canonicalJson(run));
}

// ---- integration ----------------------------------------------------------

function integrate(run: ReproRun): Float64Array {
  const rhs = buildRhs(run.spec);
  const state = new Float64Array(run.state0);
  const out = new Float64Array(run.state0.length);
  const previousError = { value: 0 };
  for (let i = 0; i < run.steps; i += 1) {
    step(run.method, state, run.dt, rhs, out, { previousError });
    state.set(out);
  }
  return state;
}

export function buildReproPackage(run: ReproRun, options: BuildOptions = {}): ReproPackage {
  const finalState = integrate(run);
  const energyInitial = energyForSpec(run.spec, new Float64Array(run.state0)).total;
  const energyFinal = energyForSpec(run.spec, finalState).total;
  const energyDrift = Math.abs((energyFinal - energyInitial) / (Math.abs(energyInitial) || 1));

  let lambdaMax: number | null = null;
  if (options.includeLyapunov ?? true) {
    const rhs = buildRhs(run.spec);
    lambdaMax = maximalLyapunov(new Float64Array(run.state0), rhs, { steps: options.lyapunovSteps ?? 6000 }).lambdaMax;
  }

  return {
    schemaVersion: REPRO_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    library: { name: 'pendulum-lab', version: options.libraryVersion ?? 'dev' },
    run,
    inputHash: hashRunInputs(run),
    result: {
      finalState: Array.from(finalState),
      energyInitial,
      energyFinal,
      energyDrift,
      lambdaMax,
      integratorName: integratorRegistry[run.method].name
    }
  };
}

export interface VerifyResult {
  ok: boolean;
  /** Max absolute difference between recomputed and recorded final state. */
  maxStateDiff: number;
  tolerance: number;
  hashMatches: boolean;
  recomputedHash: string;
}

/** Re-run the manifest and confirm the final state and input hash reproduce. */
export function verifyReproPackage(pkg: ReproPackage, tolerance = 1e-9): VerifyResult {
  const recomputed = integrate(pkg.run);
  const recorded = pkg.result.finalState;
  let maxStateDiff = 0;
  for (let i = 0; i < recomputed.length; i += 1) {
    maxStateDiff = Math.max(maxStateDiff, Math.abs((recomputed[i] ?? 0) - (recorded[i] ?? 0)));
  }
  const recomputedHash = hashRunInputs(pkg.run);
  const hashMatches = recomputedHash === pkg.inputHash;
  return {
    ok: maxStateDiff <= tolerance && hashMatches,
    maxStateDiff,
    tolerance,
    hashMatches,
    recomputedHash
  };
}

// ---- human-readable methods / citation -----------------------------------

/** A Markdown "methods" paragraph plus a citation line for the run. */
export function reproMethodsText(pkg: ReproPackage): string {
  const { run, result } = pkg;
  const T = (run.dt * run.steps).toPrecision(4);
  const lam = result.lambdaMax === null ? 'not computed' : result.lambdaMax.toFixed(4);
  const methods =
    `The ${run.spec.kind} system was integrated with the ${result.integratorName} ` +
    `(\`${run.method}\`) method at a fixed step dt = ${run.dt} for ${run.steps} steps ` +
    `(t = ${T}), from initial state [${run.state0.join(', ')}] (seed ${run.seed ?? 'none'}). ` +
    `Relative energy drift was ${result.energyDrift.toExponential(2)} and the maximal ` +
    `Lyapunov exponent estimate was ${lam}. Reproduced with pendulum-lab ` +
    `${pkg.library.version} (repro schema ${pkg.schemaVersion}); input fingerprint ${pkg.inputHash}.`;
  const citation =
    `pendulum-lab (${pkg.library.version}). Reproducibility package ${pkg.inputHash}, ` +
    `generated ${pkg.generatedAt}.`;
  return `## Methods\n\n${methods}\n\n## Citation\n\n${citation}\n`;
}
