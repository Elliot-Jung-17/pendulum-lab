import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { validateCatalogSources } from '../../../scripts/redesign/validate-catalog-sources';
import type {
  AnalysisDefinition,
  CapabilityCatalog,
  LegacyBinding,
  SystemDefinition
} from '../../../src/product/contracts/catalog';

const text = { ko: '기존 API', en: 'Existing API' };
const binding = (exportName: string, module = 'src/engine.ts', member?: string): LegacyBinding =>
  member === undefined ? { module, exportName } : { module, exportName, member };
const schema = { kind: 'legacy-api', version: 'unversioned', bindings: [binding('State')], description: text } as const;

function system(overrides: Partial<SystemDefinition> = {}): SystemDefinition {
  return {
    id: 'system:fixture',
    category: 'system',
    name: text,
    description: text,
    tags: [],
    legacyBindings: [binding('step')],
    baselineIds: [],
    integrationStage: 3,
    limitations: [],
    family: 'classical',
    evolution: 'ode',
    engineAdapters: [binding('step')],
    state: schema,
    parameters: schema,
    coordinates: text,
    degreesOfFreedom: { kind: 'fixed', value: 1 },
    stepping: { kind: 'internal', binding: binding('step'), description: text },
    ...overrides
  };
}

function catalog(
  overrides: Partial<SystemDefinition> = {},
  analyses: readonly AnalysisDefinition[] = []
): CapabilityCatalog {
  return { systems: [system(overrides)], analyses, integrators: [], auxiliary: [] };
}

describe('catalog static source bindings', () => {
  let root: string;
  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pendulum-catalog-source-')));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src/engine.ts'),
      `
      throw new Error('Legacy modules must never execute during validation');
      export interface State { theta: number }
      export type Callback = () => void;
      export function step(): void {}
      export class Solver { solve(): void {} }
      export const adapters = { step, label: 'display only' };
      export const scalar = 1;
      function privateStep(): void {}
    `
    );
    writeFileSync(
      join(root, 'src/barrel.ts'),
      `
      export { step as run } from './engine';
      export type { State, Callback } from './engine';
    `
    );
    writeFileSync(join(root, 'src/type-only.ts'), `export type { step } from './engine';`);
    writeFileSync(join(root, 'src/type-star.ts'), `export type * from './engine';`);
    writeFileSync(join(root, 'src/value-star.ts'), `export * from './engine';`);
    writeFileSync(join(root, 'src/import-type.ts'), `import type { step } from './engine'; export { step };`);
    writeFileSync(join(root, 'src/ambient.ts'), `export declare function step(): void;`);
    writeFileSync(join(root, 'src/broken.ts'), `export { removed } from './engine';`);
    writeFileSync(join(root, 'src/syntax.ts'), `export function step( {`);
  });

  afterAll(() => {
    // Delete only the fixture directory created above, after checking the resolved containment.
    const temporaryRoot = realpathSync(tmpdir());
    const fixtureRoot = resolve(root);
    const fixtureRelative = relative(temporaryRoot, fixtureRoot);
    if (
      isAbsolute(fixtureRelative) ||
      fixtureRelative.startsWith('..') ||
      !fixtureRelative.startsWith('pendulum-catalog-source-')
    ) {
      throw new Error('Refusing to remove a fixture outside the temporary directory');
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('accepts actual functions, classes, members, type schemas and re-exported bindings without executing modules', () => {
    expect(
      validateCatalogSources(
        root,
        catalog({
          engineAdapters: [
            binding('step'),
            binding('Solver'),
            binding('adapters', 'src/engine.ts', 'step'),
            binding('run', 'src/barrel.ts'),
            binding('step', 'src/value-star.ts')
          ],
          state: { ...schema, bindings: [binding('State', 'src/barrel.ts')] },
          parameters: { ...schema, bindings: [binding('Callback', 'src/barrel.ts')] }
        })
      )
    ).toEqual([]);
  });

  test.each([
    ['removed export', binding('removed'), 'does not export removed'],
    ['private declaration', binding('privateStep'), 'does not export privateStep'],
    ['unresolved re-export', binding('removed', 'src/broken.ts'), 'does not export removed'],
    ['missing module', binding('step', 'src/missing.ts'), 'does not exist'],
    ['directory', binding('step', 'src'), 'source file'],
    ['parent traversal', binding('step', '../engine.ts'), 'without traversal'],
    ['nested traversal', binding('step', 'src/../src/engine.ts'), 'without traversal'],
    ['Windows traversal', binding('step', 'src\\..\\engine.ts'), 'without traversal'],
    ['absolute path', binding('step', '/tmp/engine.ts'), 'repository-relative'],
    ['Windows absolute path', binding('step', 'C:\\engine.ts'), 'repository-relative'],
    ['missing member', binding('adapters', 'src/engine.ts', 'removed'), 'has no member removed'],
    ['syntax error', binding('step', 'src/syntax.ts'), 'cannot be parsed']
  ])('rejects %s', (_name, invalid, message) => {
    const errors = validateCatalogSources(root, catalog({ legacyBindings: [invalid] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });

  test.each([
    binding('State'),
    binding('Callback'),
    binding('scalar'),
    binding('adapters', 'src/engine.ts', 'label'),
    binding('step', 'src/type-only.ts'),
    binding('step', 'src/type-star.ts'),
    binding('step', 'src/import-type.ts'),
    binding('step', 'src/ambient.ts')
  ])('rejects non-runtime engine adapter $module:$exportName', (invalid) => {
    const errors = validateCatalogSources(root, catalog({ engineAdapters: [invalid] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('engineAdapters[0]');
    expect(errors[0]).toContain('runtime callable function or class');
  });

  test('checks state, system parameters, analysis parameters and internal stepping independently', () => {
    const invalid = binding('removed');
    const analysis: AnalysisDefinition = {
      id: 'analysis:fixture',
      category: 'analysis',
      name: text,
      description: text,
      tags: [],
      legacyBindings: [binding('step')],
      baselineIds: [],
      integrationStage: 3,
      limitations: [],
      compatibility: { requiredInputs: [] },
      inputs: [],
      parameters: { ...schema, bindings: [invalid] },
      computation: { location: 'main', cancellable: false, cost: text },
      outputs: []
    };
    const errors = validateCatalogSources(
      root,
      catalog(
        {
          state: { ...schema, bindings: [invalid] },
          parameters: { ...schema, bindings: [invalid] },
          stepping: { kind: 'internal', binding: binding('scalar'), description: text }
        },
        [analysis]
      )
    );
    expect(errors).toHaveLength(4);
    expect(errors.some((error) => error.includes('system:fixture.state.bindings[0]'))).toBe(true);
    expect(errors.some((error) => error.includes('system:fixture.parameters.bindings[0]'))).toBe(true);
    expect(
      errors.some((error) => error.includes('system:fixture.stepping.binding') && error.includes('runtime callable'))
    ).toBe(true);
    expect(errors.some((error) => error.includes('analysis:fixture.parameters.bindings[0]'))).toBe(true);
  });

  test('checks the legacy bindings of every catalog collection', () => {
    const common = {
      name: text,
      description: text,
      tags: [],
      legacyBindings: [binding('removed')],
      baselineIds: [],
      integrationStage: 3,
      limitations: []
    };
    const errors = validateCatalogSources(root, {
      systems: [system(common)],
      analyses: [
        {
          ...common,
          id: 'analysis:fixture',
          category: 'analysis',
          compatibility: { requiredInputs: [] },
          inputs: [],
          parameters: schema,
          computation: { location: 'main', cancellable: false, cost: text },
          outputs: []
        }
      ],
      integrators: [
        {
          ...common,
          id: 'integrator:fixture',
          category: 'integrator',
          compatibility: { requiredInputs: [] },
          method: 'explicit',
          order: 1
        }
      ],
      auxiliary: [{ ...common, id: 'control:fixture', category: 'control' }]
    });
    expect(errors).toHaveLength(4);
    for (const category of ['system', 'analysis', 'integrator', 'control']) {
      expect(errors.some((error) => error.includes(`${category}:fixture.legacyBindings[0]`))).toBe(true);
    }
  });

  test.each(['scalar', 'Callback'])(
    'requires analysis and integrator primary computation %s to remain callable',
    (exportName) => {
      const common = {
        name: text,
        description: text,
        tags: [],
        legacyBindings: [binding(exportName), binding('step')],
        baselineIds: [],
        integrationStage: 3,
        limitations: []
      };
      const errors = validateCatalogSources(root, {
        systems: [],
        analyses: [
          {
            ...common,
            id: 'analysis:fixture',
            category: 'analysis',
            compatibility: { requiredInputs: [] },
            inputs: [],
            parameters: schema,
            computation: { location: 'main', cancellable: false, cost: text },
            outputs: []
          }
        ],
        integrators: [
          {
            ...common,
            id: 'integrator:fixture',
            category: 'integrator',
            compatibility: { requiredInputs: [] },
            method: 'explicit',
            order: 1
          }
        ],
        auxiliary: []
      });
      expect(errors).toHaveLength(2);
      for (const category of ['analysis', 'integrator']) {
        expect(
          errors.some(
            (error) => error.includes(`${category}:fixture.legacyBindings[0]`) && error.includes('runtime callable')
          )
        ).toBe(true);
      }
    }
  );
});
