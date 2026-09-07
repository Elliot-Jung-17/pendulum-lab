import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { catalog } from '../../../src/product/catalog';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import { validateAnalysisArtifactProvenance } from '../../../src/product/contracts/analysis-provenance';
import { experimentFixture, mapFixture, quantumFixture, stochasticFixture } from './fixtures';

type Data = Record<string, any>; // Deliberately malformed transport input for validator tests.
const data = (): Data => structuredClone(experimentFixture());
const codes = (value: unknown) => {
  const result = validateExperimentState(value);
  return result.ok ? [] : result.issues.map((entry) => entry.code);
};

describe('S03 versioned experiment configuration', () => {
  it.each([experimentFixture, mapFixture, quantumFixture, stochasticFixture])(
    'restores numerical meaning without a UI layout (%#)',
    (factory) => {
      const source = factory();
      const result = validateExperimentState(JSON.parse(JSON.stringify(source)));
      expect(result).toEqual({ ok: true, value: source });
      expect(Object.hasOwn(source, 'layout')).toBe(false);
      expect(Object.hasOwn(source, 'ui')).toBe(false);
    }
  );

  it('returns isolated nested copies and never wraps angles or changes seeds', () => {
    const source = data();
    source.initialConditions.theta.values = [20 * Math.PI, -17 * Math.PI];
    source.seed.value = '-987';
    const result = validateExperimentState(source);
    expect(result).toEqual({ ok: true, value: source });
    source.initialConditions.theta.values[0] = 0;
    source.seed.value = 'changed';
    if (result.ok) {
      expect(result.value.initialConditions.theta).toEqual({
        kind: 'vector',
        values: [20 * Math.PI, -17 * Math.PI],
        unit: 'rad'
      });
      expect(result.value.seed?.value).toBe('-987');
    }
  });

  it('preserves large textual seeds and randomized quantity edits through independent round trips', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(2n ** 100n), max: 2n ** 100n }),
        fc.integer({ min: -100000, max: 100000 }),
        (seed, winding) => {
          const source = data();
          source.seed.value = seed.toString();
          source.initialConditions.theta.values[0] = winding * Math.PI || 0;
          expect(validateExperimentState(JSON.parse(JSON.stringify(source)))).toEqual({ ok: true, value: source });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('keeps the S02 distinction among time, iteration and direct evaluation for every system', () => {
    for (const system of catalog.systems) {
      const source = data();
      source.systemId = system.id;
      source.integrator =
        system.stepping.kind === 'internal'
          ? { kind: 'internal', version: 'v1', settings: {} }
          : { kind: 'selectable', id: system.stepping.integratorIds[0], version: 'v1', settings: {} };
      if (system.evolution === 'map' || system.evolution === 'quantum')
        source.runtime = { domain: 'iteration', start: 0, iterations: 10, sampleEvery: 1 };
      if (system.evolution === 'spectral' || system.evolution === 'diagnostic')
        source.runtime = { domain: 'evaluation' };
      expect(codes(source), system.id).toEqual([]);
    }
  });

  it.each([
    (value: Data) => {
      value.schema = 'pendulum-experiment/v2';
    },
    (value: Data) => {
      value.layout = {};
    },
    (value: Data) => {
      value.integrator.tolerance = 0.001;
    },
    (value: Data) => {
      value.runtime.paused = true;
    },
    (value: Data) => {
      value.provenance.source.filename = 'data.csv';
    },
    (value: Data) => {
      value.seed.generatorState = [];
    }
  ])('rejects unknown versions/fields with recovery guidance and preserves the source (%#)', (mutate) => {
    const source = data();
    mutate(source);
    const before = structuredClone(source);
    const result = validateExperimentState(source);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((entry) => ['keep-original', 'use-supported-version'].includes(entry.recovery))).toBe(
        true
      );
    expect(source).toEqual(before);
  });

  it('rejects unknown catalog IDs and incompatible integrator ownership, methods and analyses', () => {
    expect(codes({ ...experimentFixture(), systemId: 'system:unknown' })).toContain('unknown-id');
    expect(
      codes({
        ...experimentFixture(),
        integrator: { kind: 'selectable', id: 'integrator:unknown', version: '1', settings: {} }
      })
    ).toContain('unknown-id');
    expect(codes({ ...mapFixture(), integrator: experimentFixture().integrator })).toContain('incompatible-capability');
    expect(codes({ ...experimentFixture(), integrator: { kind: 'internal', version: '1', settings: {} } })).toContain(
      'incompatible-capability'
    );
    expect(codes({ ...mapFixture(), runtime: experimentFixture().runtime })).toContain('incompatible-capability');
    expect(
      codes({ ...experimentFixture(), analyses: [{ id: 'analysis:unknown', algorithmVersion: '1', settings: {} }] })
    ).toContain('unknown-id');
    const drivenAnalysis = catalog.analyses.find(
      (entry) =>
        entry.compatibility.systemIds?.includes('system:driven') &&
        !entry.compatibility.systemIds?.includes('system:double')
    )!;
    expect(
      codes({ ...experimentFixture(), analyses: [{ id: drivenAnalysis.id, algorithmVersion: '1', settings: {} }] })
    ).toContain('incompatible-capability');
  });

  it.each([
    (value: Data) => {
      value.runtime.step.value = 0;
    },
    (value: Data) => {
      value.runtime.duration.unit = 'ms';
    },
    (value: Data) => {
      value.runtime.step.value = 100;
    },
    (value: Data) => {
      value.runtime.step.value = Number.MIN_VALUE;
    },
    (value: Data) => {
      value.runtime.start.value = 1e20;
      value.runtime.duration.value = 1e10;
    },
    (value: Data) => {
      value.runtime.sampleEvery = 1.5;
    },
    (value: Data) => {
      value.modelOptions = { boundary: 'file:///secret' };
    },
    (value: Data) => {
      value.provenance.source.id = 'C:\\Users\\private.csv';
    },
    (value: Data) => {
      value.provenance.sourceUnits['parameters.length1'] = 'deg';
    },
    (value: Data) => {
      value.provenance.sourceUnits['parameters.unknown'] = 'm';
    },
    (value: Data) => {
      value.seed.value = 'seed with spaces';
    },
    (value: Data) => {
      delete value.seed.generatorVersion;
    }
  ])('rejects invalid execution or provenance without normalization (%#)', (mutate) => {
    const source = data();
    mutate(source);
    expect(validateExperimentState(source).ok).toBe(false);
  });

  it('requires reproducible seed metadata for SDE and bounds iteration arithmetic', () => {
    const { seed: _seed, ...unseeded } = stochasticFixture();
    expect(validateExperimentState(unseeded).ok).toBe(false);
    expect(
      validateExperimentState({
        ...mapFixture(),
        runtime: { domain: 'iteration', start: Number.MAX_SAFE_INTEGER, iterations: 1, sampleEvery: 1 }
      }).ok
    ).toBe(false);
  });

  it.each([{ kind: ['manual'] }, { kind: null }, { kind: { toString: 1 } }])(
    'does not coerce invalid provenance kind (%j)',
    ({ kind }) => {
      const source = data();
      source.provenance.source = { kind, id: 'source:01' };
      expect(validateExperimentState(source).ok).toBe(false);
    }
  );

  it('rejects unsafe transport data without invoking getters', () => {
    let reads = 0;
    const source = Object.defineProperty(data(), 'modelVersion', {
      get() {
        reads++;
        return '1';
      },
      enumerable: true
    });
    expect(validateExperimentState(source).ok).toBe(false);
    expect(reads).toBe(0);
    expect(
      validateExperimentState(JSON.parse('{"schema":"pendulum-experiment/v1","__proto__":{"polluted":true}}')).ok
    ).toBe(false);
    const cyclic = data();
    cyclic.parameters.loop = cyclic;
    expect(validateExperimentState(cyclic).ok).toBe(false);
  });

  it('records artifact input run, algorithm, configuration and creation time in its own version', () => {
    const source = {
      schema: 'pendulum-analysis-provenance/v1',
      artifactId: 'artifact:01',
      inputRunId: 'run:01',
      analysis: {
        id: catalog.analyses[0]!.id,
        algorithmVersion: 'v1',
        settings: { sampleCount: { kind: 'scalar', value: 100, unit: '1' } }
      },
      createdAt: '2026-09-07T00:00:00.000Z'
    };
    expect(validateAnalysisArtifactProvenance(source)).toEqual({ ok: true, value: source });
    expect(validateAnalysisArtifactProvenance({ ...source, createdAt: '2026-02-30T00:00:00.000Z' }).ok).toBe(false);
    expect(validateAnalysisArtifactProvenance({ ...source, inputRunId: '/private/run' }).ok).toBe(false);
    expect(validateAnalysisArtifactProvenance({ ...source, schema: 'pendulum-analysis-provenance/v2' }).ok).toBe(false);
  });
});
