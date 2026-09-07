import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import { parseExperiment, serializeExperiment } from '../../../src/product/persistence/serialization';
import { decodeShareToken, encodeShareToken } from '../../../src/product/persistence/share';
import type { ContractResult } from '../../../src/product/contracts/validation';

function value<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

const fixture = (): ExperimentStateV1 => ({
  schema: 'pendulum-experiment/v1',
  systemId: 'system:double',
  modelVersion: '10.36.0',
  parameters: {
    L1: { kind: 'scalar', value: 1.2, unit: 'm' },
    gamma: { kind: 'scalar', value: 0.04, unit: 'kg*m^2/s' }
  },
  initialConditions: {
    theta1: { kind: 'scalar', value: 4 * Math.PI, unit: 'rad' },
    omega1: { kind: 'scalar', value: -0.5, unit: 'rad/s' }
  },
  integrator: { kind: 'selectable', id: 'integrator:rk4', version: '10.36.0', settings: {} },
  runtime: {
    domain: 'time',
    start: { value: 2, unit: 's' },
    duration: { value: 10, unit: 's' },
    step: { value: 0.01, unit: 's' },
    sampleEvery: 2
  },
  analyses: [],
  seed: { value: '9007199254740993', generator: 'portable-fixture-rng', generatorVersion: '1' },
  provenance: {
    createdByVersion: '10.36.0',
    source: { kind: 'preset', id: 'chaotic-double' },
    parentExperimentIds: ['run-42'],
    sourceUnits: { 'initialConditions.theta1': 'deg' }
  }
});

function envelopeToken(envelope: unknown): string {
  return 'pe1.' + Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

describe('canonical experiment serialization and sharing', () => {
  it('preserves explicit units, winding angles, textual seed, versions, runtime and provenance without UI', () => {
    const state = fixture();
    expect(value(parseExperiment(value(serializeExperiment(state))))).toEqual(state);
    const token = value(encodeShareToken(state));
    expect(token).toMatch(/^pe1\.[A-Za-z0-9_-]+$/);
    expect(value(decodeShareToken(token))).toEqual(state);
    expect(state.initialConditions.theta1).toEqual({ kind: 'scalar', value: 4 * Math.PI, unit: 'rad' });
    expect(value(decodeShareToken(token))).not.toHaveProperty('layout');
  });

  it('is deterministic across insertion order and does not return shared mutable references', () => {
    const first = fixture();
    const reverse = Object.fromEntries(Object.entries(first).reverse());
    expect(encodeShareToken(reverse)).toEqual(encodeShareToken(first));
    expect(serializeExperiment(reverse)).toEqual(serializeExperiment(first));
    const restored = value(parseExperiment(value(serializeExperiment(first))));
    expect(restored).not.toBe(first);
    expect(restored.initialConditions).not.toBe(first.initialConditions);
    expect(restored.runtime).not.toBe(first.runtime);
  });

  it('round trips randomized finite SI magnitudes and large textual seeds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }).filter((n) => !Object.is(n, -0)),
        fc.bigInt({ min: 0n, max: 2n ** 128n }),
        (angle, seed) => {
          const state: ExperimentStateV1 = {
            ...fixture(),
            initialConditions: { theta1: { kind: 'scalar', value: angle, unit: 'rad' } },
            seed: { value: seed.toString(), generator: 'portable-rng', generatorVersion: '1' }
          };
          const json = value(serializeExperiment(state));
          expect(value(parseExperiment(json))).toEqual(state);
          expect(value(decodeShareToken(value(encodeShareToken(state))))).toEqual(state);
          expect(value(serializeExperiment(value(parseExperiment(json))))).toBe(json);
        }
      ),
      { seed: 3030, numRuns: 200 }
    );
  });

  it('rejects future schemas, nested unknown fields and UI layout without dropping source data', () => {
    for (const bad of [
      { ...fixture(), schema: 'pendulum-experiment/v2' },
      { ...fixture(), layout: { panels: [] } },
      { ...fixture(), integrator: { ...fixture().integrator, secret: 'local' } },
      { ...fixture(), initialConditions: { angle: { kind: 'scalar', value: 90, unit: 'deg' } } }
    ]) {
      const original = JSON.stringify(bad);
      expect(serializeExperiment(bad).ok).toBe(false);
      expect(parseExperiment(original).ok).toBe(false);
      expect(encodeShareToken(bad).ok).toBe(false);
      expect(JSON.stringify(bad)).toBe(original);
    }
  });

  it('rejects malformed, padded, alternate-base64, invalid UTF-8 and unknown share versions', () => {
    for (const token of [
      'pe2.AA',
      'pe1.',
      'pe1.A',
      'pe1.e30=',
      'pe1.!!!!',
      'pe1._w',
      'pe1.e31',
      'pe1.AA+_',
      'pe1.' + 'x'.repeat(33 * 1024)
    ])
      expect(decodeShareToken(token).ok).toBe(false);
    expect(decodeShareToken(undefined).ok).toBe(false);
    expect(decodeShareToken(envelopeToken({ v: 2, e: {}, c: '00000000' })).ok).toBe(false);
    expect(decodeShareToken(envelopeToken({ v: 1, e: {}, c: '00000000', extra: 1 })).ok).toBe(false);
  });

  it('detects accidental payload mutation and duplicate envelope keys', () => {
    const token = value(encodeShareToken(fixture()));
    const json = Buffer.from(token.slice(4), 'base64url').toString('utf8');
    const envelope = JSON.parse(json) as { e: { modelVersion: string } };
    envelope.e.modelVersion = '10.36.1';
    const damaged = decodeShareToken(envelopeToken(envelope));
    expect(damaged.ok).toBe(false);
    if (!damaged.ok) expect(damaged.issues[0]?.code).toBe('damaged-share');
    expect(decodeShareToken('pe1.' + Buffer.from(json.replace('"v":1', '"v":1,"v":1')).toString('base64url')).ok).toBe(
      false
    );
  });

  it('keeps larger experiments exportable but rejects oversize links with file recovery', () => {
    const state = {
      ...fixture(),
      initialConditions: {
        theta1: { kind: 'vector', values: Array.from({ length: 4096 }, (_, i) => i + 0.1234567890123), unit: 'rad' }
      }
    };
    expect(serializeExperiment(state).ok).toBe(true);
    const token = encodeShareToken(state);
    expect(token.ok).toBe(false);
    if (!token.ok) expect(token.issues[0]?.recovery).toBe('export-file');
  });

  it('allows safe option tokens but rejects private fields and local path strings in sharing', () => {
    expect(encodeShareToken({ ...fixture(), modelOptions: { boundary: 'periodic', enabled: true } }).ok).toBe(true);
    expect(encodeShareToken({ ...fixture(), modelOptions: { apiKey: 'private-key' } }).ok).toBe(false);
    for (const id of ['C:/Users/person/file', '/home/person/file', 'file:///local', 'person@example.test']) {
      expect(
        encodeShareToken({
          ...fixture(),
          provenance: { createdByVersion: '1', source: { kind: 'import', id }, parentExperimentIds: [] }
        }).ok
      ).toBe(false);
    }
  });
});
