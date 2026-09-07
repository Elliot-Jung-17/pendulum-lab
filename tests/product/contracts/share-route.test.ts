import { crc32 } from 'node:zlib';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import { MAX_SHARE_TOKEN_LENGTH, parseProductRoute } from '../../../src/product/contracts/routes';
import type { ContractResult } from '../../../src/product/contracts/validation';
import { canonicalJson, type JsonValue } from '../../../src/product/persistence/safe-data';
import { serializeExperiment } from '../../../src/product/persistence/serialization';
import { createExperimentRoute, resolveProductRoute } from '../../../src/product/persistence/share-route';
import { experimentFixture, mapFixture, quantumFixture, stochasticFixture, uiFixture } from './fixtures';

function value<T>(result: ContractResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

const tokenFromText = (text: string) => `pe1.${Buffer.from(text, 'utf8').toString('base64url')}`;

/** Forge a checksum-valid envelope with an independent native CRC implementation to test its trust boundary. */
function tokenForUntrustedExperiment(experiment: unknown): string {
  const snapshot = JSON.parse(JSON.stringify(experiment)) as JsonValue;
  const checksum = crc32(Buffer.from(canonicalJson(snapshot), 'utf8'))
    .toString(16)
    .padStart(8, '0');
  return tokenFromText(JSON.stringify({ v: 1, e: snapshot, c: checksum }));
}

function sharedRoute(token: string, slug = 'double'): string {
  return `#/lab/${slug}?state=${token}`;
}

describe('S03 shared experiment route resolution', () => {
  it.each([
    ['double', experimentFixture],
    ['standard-map', mapFixture],
    ['quantum-kicked-rotor', quantumFixture],
    ['langevin', stochasticFixture]
  ] as const)('restores %s with exact values, units and seeds using no UI state', (slug, fixture) => {
    const experiment = fixture();
    const original = structuredClone(experiment);
    const route = value(createExperimentRoute(experiment));
    expect(route.startsWith(`#/lab/${slug}?state=pe1.`)).toBe(true);
    const restored = value(resolveProductRoute(`/next.html${route}`));
    expect(restored.experiment).toEqual(experiment);
    expect(restored.experiment).not.toBe(experiment);
    expect(restored.experiment).not.toHaveProperty('layout');
    expect(restored.experiment).not.toHaveProperty('ui');
    expect(experiment).toEqual(original);
    expect(value(createExperimentRoute(restored.experiment))).toBe(route);
  });

  it('never silently discards UI state placed inside the experiment', () => {
    for (const extra of [{ ui: uiFixture() }, { layout: uiFixture().layout }]) {
      const result = createExperimentRoute({ ...experimentFixture(), ...extra });
      expect(result).toMatchObject({ ok: false, issues: [{ code: 'unknown-field', recovery: 'keep-original' }] });
    }
  });

  it.each(['#/learn', '#/learn/course-1', '#/learn/course-1/1.8', '#/lab', '#/lab/double'])(
    'returns navigation without inventing an experiment for %s',
    (route) => {
      expect(value(resolveProductRoute(route))).toEqual({ route: value(parseProductRoute(route)) });
      expect(value(resolveProductRoute(route))).not.toHaveProperty('experiment');
    }
  );

  it('rejects a checksum-valid experiment for a different known system without a partial restoration', () => {
    const route = value(createExperimentRoute(experimentFixture())).replace('#/lab/double?', '#/lab/compound-double?');
    expect(parseProductRoute(route).ok).toBe(true);
    const result = resolveProductRoute(route);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'route-state-mismatch', path: '$.systemId', recovery: 'keep-original' }]
    });
    expect(result).not.toHaveProperty('value');
  });

  it.each([
    'pe1.bm90LWpzb24', // valid base64url, not JSON
    'pe1.A', // impossible base64url length
    'pe1.Zh', // noncanonical unused padding bits
    'pe1._w', // invalid UTF-8
    tokenFromText('null'),
    tokenFromText('[]'),
    tokenFromText('{"v":1,"e":{},"c":"00000000"}'),
    tokenFromText('{"v":1,"v":1,"e":{},"c":"00000000"}'),
    tokenFromText('\ufeff{"v":1}'),
    tokenFromText('{"v":1,"e":{},"c":"00000000","extra":true}')
  ])('rejects a syntactically valid route with a damaged or malformed semantic token (%s)', (token) => {
    const route = sharedRoute(token);
    expect(parseProductRoute(route).ok).toBe(true);
    expect(resolveProductRoute(route).ok).toBe(false);
    expect(resolveProductRoute(route)).not.toHaveProperty('value');
  });

  it('detects a changed quantity even when the payload remains valid JSON and base64url', () => {
    const route = value(createExperimentRoute(experimentFixture()));
    const token = route.split('state=')[1]!;
    const envelope = JSON.parse(Buffer.from(token.slice(4), 'base64url').toString('utf8'));
    envelope.e.parameters.mass1.value = 2;
    expect(resolveProductRoute(sharedRoute(tokenFromText(JSON.stringify(envelope))))).toMatchObject({
      ok: false,
      issues: [{ code: 'damaged-share', recovery: 'keep-original' }]
    });
  });

  it('rejects unsupported versions at both the envelope and canonical experiment boundary', () => {
    const envelope = tokenFromText(JSON.stringify({ v: 2, e: {}, c: '00000000' }));
    const experiment = tokenForUntrustedExperiment({ ...experimentFixture(), schema: 'pendulum-experiment/v2' });
    for (const token of [envelope, experiment]) {
      expect(resolveProductRoute(sharedRoute(token))).toMatchObject({
        ok: false,
        issues: [{ code: 'unsupported-version', recovery: 'use-supported-version' }]
      });
    }
  });

  it('rejects unknown experiment fields even when a sender supplies a correct checksum', () => {
    const token = tokenForUntrustedExperiment({ ...experimentFixture(), surprise: true });
    expect(resolveProductRoute(sharedRoute(token))).toMatchObject({
      ok: false,
      issues: [{ code: 'unknown-field', recovery: 'keep-original' }]
    });
  });

  it.each([
    'password',
    'secret',
    'apiKey',
    'authorization',
    'cookie',
    'email',
    'username',
    'localPath',
    'filePath',
    'accessToken',
    'token',
    'refreshToken',
    'authToken',
    'privateKey',
    'credentials'
  ])('excludes private field %s from both created and externally supplied shares', (name) => {
    const experiment = { ...experimentFixture(), modelOptions: { [name]: 'synthetic-fixture' } };
    // A local experiment may carry an adapter option that must never reach a public share URL.
    expect(serializeExperiment(experiment).ok).toBe(true);
    expect(createExperimentRoute(experiment)).toMatchObject({
      ok: false,
      issues: [{ code: 'private-share-data', recovery: 'keep-original' }]
    });
    expect(resolveProductRoute(sharedRoute(tokenForUntrustedExperiment(experiment)))).toMatchObject({
      ok: false,
      issues: [{ code: 'private-share-data', recovery: 'keep-original' }]
    });
  });

  it.each([
    'C:\\Users\\someone\\private.json',
    '/home/someone/private.json',
    '\\\\server\\private\\state.json',
    'file:///home/private.json',
    'file:private.json',
    'https://private.example.test/state',
    'person@example.test'
  ])('rejects local paths or contact values on creation and on a checksum-valid public import (%s)', (text) => {
    const experiment = { ...experimentFixture(), modelOptions: { source: text } };
    expect(createExperimentRoute(experiment).ok).toBe(false);
    const result = resolveProductRoute(sharedRoute(tokenForUntrustedExperiment(experiment)));
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'private-share-data' }] });
    expect(JSON.stringify(result)).not.toContain(text);
  });

  it('offers file export for a valid experiment whose exact data cannot fit into the share limit', () => {
    const experiment: ExperimentStateV1 = {
      ...experimentFixture(),
      initialConditions: {
        theta: { kind: 'vector', values: Array.from({ length: 4096 }, (_, index) => index + 0.123456789), unit: 'rad' }
      }
    };
    const original = structuredClone(experiment);
    expect(serializeExperiment(experiment).ok).toBe(true);
    expect(createExperimentRoute(experiment)).toMatchObject({
      ok: false,
      issues: [{ code: 'share-too-large', recovery: 'export-file' }]
    });
    expect(experiment).toEqual(original);
    expect(resolveProductRoute(sharedRoute(`pe1.${'A'.repeat(MAX_SHARE_TOKEN_LENGTH)}`))).toMatchObject({
      ok: false,
      issues: [{ code: 'payload-too-large', recovery: 'export-file' }]
    });
  });

  it('preserves randomized experiment meaning through a deterministic route without UI defaults', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 1000, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }).filter((number) => !Object.is(number, -0)),
        fc.uint8Array({ minLength: 1, maxLength: 32 }),
        (mass, angle, bytes) => {
          const original = experimentFixture();
          const experiment: ExperimentStateV1 = {
            ...original,
            parameters: { ...original.parameters, mass1: { kind: 'scalar', value: mass, unit: 'kg' } },
            initialConditions: { ...original.initialConditions, theta: { kind: 'scalar', value: angle, unit: 'rad' } },
            seed: {
              value: Buffer.from(bytes).toString('base64url'),
              generator: 'fixture-generator',
              generatorVersion: '1'
            }
          };
          const route = value(createExperimentRoute(experiment));
          expect(value(resolveProductRoute(route)).experiment).toEqual(experiment);
          expect(value(createExperimentRoute(Object.fromEntries(Object.entries(experiment).reverse())))).toBe(route);
        }
      ),
      { seed: 0x5306, numRuns: 150 }
    );
  });
});
