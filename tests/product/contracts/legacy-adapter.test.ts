import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { RuntimeSnapshot } from '../../../src/types/domain';
import { SESSION_SCHEMA_VERSION } from '../../../src/state/sessionSchema';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import type { LegacyExperimentAdapter } from '../../../src/product/contracts/legacy-adapter';
import { isRecord } from '../../../src/product/contracts/contract-checks';
import { failure, success, type ContractResult } from '../../../src/product/contracts/validation';
import { inspectSafeData } from '../../../src/product/persistence/safe-data';
import { parseExperiment, serializeExperiment } from '../../../src/product/persistence/serialization';

/**
 * Explicit projection of src/types/domain.ts RuntimeSnapshot, not a complete
 * session migration. StateStore uses [theta1, theta2, omega1, omega2]. Its normal
 * importer wraps angles and aliases verlet; this fixture deliberately does neither.
 * mode, stepsPerFrame and hash are not part of this restart projection.
 */
type LegacyRestart = Pick<
  RuntimeSnapshot,
  | 'schemaVersion'
  | 'systemType'
  | 'method'
  | 'dt'
  | 'tolerance'
  | 'damping'
  | 'parameters'
  | 'state'
  | 'simTime'
  | 'seed'
>;

const fixture: LegacyRestart = {
  schemaVersion: SESSION_SCHEMA_VERSION,
  systemType: 'double',
  method: 'verlet',
  dt: 0.003,
  tolerance: 1e-7,
  damping: 0.15,
  parameters: { m1: 1.25, m2: 0.75, l1: 1.2, l2: 0.8, g: 9.81 },
  state: [9 * Math.PI, -8 * Math.PI, 0.125, -0.25],
  simTime: 42.5,
  seed: -123456789
};
Object.freeze(fixture.state);
Object.freeze(fixture.parameters);
Object.freeze(fixture);

const sourceFields = [
  'schemaVersion',
  'systemType',
  'method',
  'dt',
  'tolerance',
  'damping',
  'parameters',
  'state',
  'simTime',
  'seed'
];
const parameterFields = ['m1', 'm2', 'l1', 'l2', 'g'] as const;
const coordinateFields = ['theta1', 'theta2', 'omega1', 'omega2'] as const;
const exactKeys = (value: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Test-local adapter for this projection only. No production adapter is registered. */
function project(source: unknown): ContractResult<ExperimentStateV1> {
  const safe = inspectSafeData(source);
  if (!safe.ok) return safe;
  const value = safe.value;
  if (
    !isRecord(value) ||
    !exactKeys(value, sourceFields) ||
    value.schemaVersion !== SESSION_SCHEMA_VERSION ||
    value.systemType !== 'double' ||
    (value.method !== 'rk4' && value.method !== 'verlet') ||
    !isRecord(value.parameters) ||
    !exactKeys(value.parameters, parameterFields) ||
    !parameterFields.every((key) => finite(value.parameters && (value.parameters as Record<string, unknown>)[key])) ||
    !Array.isArray(value.state) ||
    value.state.length !== 4 ||
    !value.state.every(finite) ||
    ![value.dt, value.tolerance, value.damping, value.simTime].every(finite) ||
    (value.seed !== null && (typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed)))
  ) {
    return failure(
      'unsupported-fixture',
      '$',
      'Only the declared v11 double restart projection is supported.',
      'keep-original'
    );
  }
  const legacy = value as unknown as LegacyRestart;
  if (
    legacy.dt <= 0 ||
    legacy.tolerance <= 0 ||
    legacy.damping < 0 ||
    legacy.simTime < 0 ||
    (['m1', 'm2', 'l1', 'l2'] as const).some((key) => legacy.parameters[key] <= 0) ||
    legacy.parameters.g < 0
  ) {
    return failure('unsupported-fixture', '$', 'The fixture cannot represent these physical values.', 'keep-original');
  }
  return validateExperimentState({
    schema: EXPERIMENT_SCHEMA,
    systemId: 'system:double',
    modelVersion: 'legacy-session-v11',
    parameters: {
      m1: { kind: 'scalar', value: legacy.parameters.m1, unit: 'kg' },
      m2: { kind: 'scalar', value: legacy.parameters.m2, unit: 'kg' },
      l1: { kind: 'scalar', value: legacy.parameters.l1, unit: 'm' },
      l2: { kind: 'scalar', value: legacy.parameters.l2, unit: 'm' },
      g: { kind: 'scalar', value: legacy.parameters.g, unit: 'm/s^2' },
      // rhsDouble subtracts gamma*omega before inverting the mass matrix.
      damping: { kind: 'scalar', value: legacy.damping, unit: 'kg*m^2/s' }
    },
    initialConditions: Object.fromEntries(
      coordinateFields.map((key, index) => [
        key,
        {
          kind: 'scalar',
          value: legacy.state[index],
          unit: index < 2 ? 'rad' : 'rad/s'
        }
      ])
    ),
    integrator: {
      kind: 'selectable',
      id: `integrator:${legacy.method}`,
      version: 'legacy-session-v11',
      settings: { tolerance: { kind: 'scalar', value: legacy.tolerance, unit: '1' } }
    },
    // Restart from the captured state at simTime; 10 s is the explicit fixture horizon.
    runtime: {
      domain: 'time',
      start: { value: legacy.simTime, unit: 's' },
      duration: { value: 10, unit: 's' },
      step: { value: legacy.dt, unit: 's' },
      sampleEvery: 1
    },
    analyses: [],
    ...(legacy.seed === null
      ? {}
      : {
          seed: {
            value: String(legacy.seed),
            generator: 'legacy-session-seed',
            generatorVersion: 'unversioned'
          }
        })
  });
}

const adapter: LegacyExperimentAdapter<LegacyRestart> = {
  id: 'test-double-restart',
  version: '1',
  sourceSchema: SESSION_SCHEMA_VERSION,
  canonicalSchema: EXPERIMENT_SCHEMA,
  supportedSystemIds: ['system:double'],
  toCanonical: project,
  fromCanonical(source) {
    const checked = validateExperimentState(source);
    if (!checked.ok) return checked;
    const state = checked.value;
    if (state.runtime.domain !== 'time' || state.integrator.kind !== 'selectable') {
      return failure('unsupported-fixture', '$', 'This fixture requires a time-domain restart.', 'keep-original');
    }
    const scalar = (map: ExperimentStateV1['parameters'], name: string): number => {
      const quantity = map[name];
      return quantity?.kind === 'scalar' ? quantity.value : Number.NaN;
    };
    const candidate: LegacyRestart = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      systemType: 'double',
      method: state.integrator.id.slice('integrator:'.length) as RuntimeSnapshot['method'],
      dt: state.runtime.step.value,
      tolerance: scalar(state.integrator.settings, 'tolerance'),
      damping: scalar(state.parameters, 'damping'),
      parameters: {
        m1: scalar(state.parameters, 'm1'),
        m2: scalar(state.parameters, 'm2'),
        l1: scalar(state.parameters, 'l1'),
        l2: scalar(state.parameters, 'l2'),
        g: scalar(state.parameters, 'g')
      },
      state: coordinateFields.map((name) => scalar(state.initialConditions, name)),
      simTime: state.runtime.start.value,
      seed: state.seed ? Number(state.seed.value) : null
    };
    const roundTrip = project(candidate);
    const originalText = serializeExperiment(state);
    const projectedText = roundTrip.ok ? serializeExperiment(roundTrip.value) : roundTrip;
    // Fail on any semantic field/unit/version that this projection would lose.
    if (!originalText.ok || !projectedText.ok || originalText.value !== projectedText.value) {
      return failure(
        'unrepresentable-fixture',
        '$',
        'Keep this canonical file; this fixture cannot preserve all its fields.',
        'keep-original'
      );
    }
    return success(candidate);
  }
};

function unwrap<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

describe('future legacy adapter boundary fixtures', () => {
  it('preserves the actual v11 coordinate order, SI dimensions, winding, method, seed and restart time', () => {
    const before = JSON.stringify(fixture);
    const canonical = unwrap(adapter.toCanonical(fixture));
    expect(canonical.initialConditions).toEqual({
      theta1: { kind: 'scalar', value: 9 * Math.PI, unit: 'rad' },
      theta2: { kind: 'scalar', value: -8 * Math.PI, unit: 'rad' },
      omega1: { kind: 'scalar', value: 0.125, unit: 'rad/s' },
      omega2: { kind: 'scalar', value: -0.25, unit: 'rad/s' }
    });
    expect(canonical.parameters.damping).toEqual({ kind: 'scalar', value: 0.15, unit: 'kg*m^2/s' });
    expect(canonical.seed).toEqual({
      value: '-123456789',
      generator: 'legacy-session-seed',
      generatorVersion: 'unversioned'
    });
    expect(canonical.integrator).toMatchObject({ id: 'integrator:verlet' });
    expect(canonical.runtime).toMatchObject({ start: { value: 42.5, unit: 's' } });
    const restored = unwrap(adapter.fromCanonical(unwrap(parseExperiment(unwrap(serializeExperiment(canonical))))));
    expect(restored).toEqual(fixture);
    expect(restored).not.toBe(fixture);
    expect(restored.parameters).not.toBe(fixture.parameters);
    expect(restored.state).not.toBe(fixture.state);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it('round-trips every signed safe integer seed without uint32 truncation and distinguishes zero from absent', () => {
    for (const seed of [null, 0, -1, 0xffff_ffff, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      const source = { ...fixture, seed };
      const canonical = unwrap(adapter.toCanonical(source));
      expect(canonical.seed?.value).toBe(seed === null ? undefined : String(seed));
      expect(unwrap(adapter.fromCanonical(unwrap(parseExperiment(unwrap(serializeExperiment(canonical))))))).toEqual(
        source
      );
    }
    fc.assert(
      fc.property(fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }), (seed) => {
        const canonical = unwrap(adapter.toCanonical({ ...fixture, seed }));
        const restored = unwrap(adapter.fromCanonical(unwrap(parseExperiment(unwrap(serializeExperiment(canonical))))));
        expect(restored.seed).toBe(seed);
      }),
      { numRuns: 75, seed: 303 }
    );
  });

  it('fails recoverably on unsupported sources without applying migrations or rewriting data', () => {
    for (const source of [
      { ...fixture, schemaVersion: 'pendulum-session/v10-ts' },
      { ...fixture, systemType: 'triple' },
      { ...fixture, mode: 'research' },
      { ...fixture, seed: Number.MAX_SAFE_INTEGER + 1 },
      { ...fixture, method: { toString: 1 } },
      { ...fixture, state: [0, 1, 2] }
    ]) {
      const before = JSON.stringify(source);
      const result = adapter.toCanonical(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues[0]?.recovery).toBe('keep-original');
      expect(JSON.stringify(source)).toBe(before);
    }
  });

  it('rejects reverse translation that would change units, omit metadata or truncate a seed', () => {
    const base = unwrap(adapter.toCanonical(fixture));
    for (const source of [
      { ...base, parameters: { ...base.parameters, damping: { kind: 'scalar', value: 0.15, unit: 's^-1' } } },
      { ...base, provenance: { createdByVersion: '1', source: { kind: 'manual' }, parentExperimentIds: [] } },
      { ...base, seed: { ...base.seed, value: '9007199254740993' } }
    ]) {
      expect(adapter.fromCanonical(source).ok).toBe(false);
    }
  });
});
