import { describe, expect, test } from 'vitest';
import { catalog } from '../../../src/product/catalog';
import { validateSourceScopes } from '../../../scripts/redesign/catalog-source-scopes';
import type {
  AnalysisDefinition,
  CapabilityCatalog,
  CapabilityPredicate,
  InputKind
} from '../../../src/product/contracts/catalog';

function withPredicate(id: string, compatibility: CapabilityPredicate): CapabilityCatalog {
  return {
    ...catalog,
    analyses: catalog.analyses.map((analysis) =>
      analysis.id === `analysis:${id}` ? { ...analysis, compatibility } : analysis
    )
  };
}

function find(id: string): AnalysisDefinition {
  const analysis = catalog.analyses.find((entry) => entry.id === `analysis:${id}`);
  if (!analysis) throw new Error(`Missing fixture analysis: ${id}`);
  return analysis;
}

describe('source-backed scientific API scope guard', () => {
  test('accepts the catalog with all currently documented source limitations', () => {
    expect(validateSourceScopes(catalog)).toEqual([]);
  });

  test.each([
    'parameter-estimation',
    'wada',
    'melnikov',
    'continuation',
    'branch-switch',
    'codimension-two',
    'integrator-comparison',
    'floquet'
  ])('rejects omitted or quantum-expanded scope for %s', (id) => {
    const original = find(id).compatibility;
    const omitted = withPredicate(id, { requiredInputs: original.requiredInputs });
    expect(
      validateSourceScopes(omitted).some(
        (error) => error.includes(`analysis:${id}: source API`) && error.includes('excludes')
      )
    ).toBe(true);
    const quantum = withPredicate(id, {
      systemIds: ['system:quantum-kicked-rotor'],
      evolutions: ['quantum'],
      requiredInputs: original.requiredInputs
    });
    expect(
      validateSourceScopes(quantum).some(
        (error) =>
          error.includes(`analysis:${id}: source API`) && error.includes('excludes system:quantum-kicked-rotor')
      )
    ).toBe(true);
  });

  test('does not let conflicting clauses or an empty system list hide a restricted API', () => {
    const original = find('parameter-estimation').compatibility;
    const conflicting = withPredicate('parameter-estimation', {
      ...original,
      systemIds: ['system:double'],
      evolutions: ['quantum']
    });
    expect(validateSourceScopes(conflicting).join('\n')).toContain('must match at least one supported system');
    const empty = withPredicate('parameter-estimation', { ...original, systemIds: [] });
    expect(validateSourceScopes(empty).join('\n')).toContain('must match at least one supported system');
  });

  test('permits a supported subset while retaining evolution restrictions', () => {
    const original = find('codimension-two').compatibility;
    expect(
      validateSourceScopes(withPredicate('codimension-two', { ...original, systemIds: ['system:double'] }))
    ).toEqual([]);
    const changedEvolution: CapabilityCatalog = {
      ...catalog,
      systems: catalog.systems.map((system) =>
        system.id === 'system:double' ? { ...system, evolution: 'quantum' } : system
      ),
      analyses: [
        {
          ...find('parameter-estimation'),
          compatibility: { ...find('parameter-estimation').compatibility, evolutions: ['quantum'] }
        }
      ]
    };
    expect(validateSourceScopes(changedEvolution).join('\n')).toContain('excludes system:double (quantum)');
  });

  test.each(['observations', 'state', 'parameters'] as const)(
    'requires the fitter input %s in predicate and input schema',
    (input) => {
      const original = find('parameter-estimation');
      const without = (items: readonly InputKind[]) => items.filter((kind) => kind !== input);
      const missingPredicate = withPredicate('parameter-estimation', {
        ...original.compatibility,
        requiredInputs: without(original.compatibility.requiredInputs)
      });
      expect(validateSourceScopes(missingPredicate).join('\n')).toContain(`requires input ${input}`);
      const missingDescription: CapabilityCatalog = {
        ...catalog,
        analyses: [{ ...original, inputs: original.inputs.filter((entry) => entry.kind !== input) }]
      };
      expect(validateSourceScopes(missingDescription).join('\n')).toContain(`requires input ${input}`);
    }
  );

  test('keeps generic vector-field analysis on continuous ODE systems', () => {
    const original = find('lyapunov');
    const data = withPredicate('lyapunov', { requiredInputs: original.compatibility.requiredInputs });
    const errors = validateSourceScopes(data).join('\n');
    expect(errors).toContain('continuous vector-field analysis cannot match system:standard-map (map)');
    expect(errors).toContain('continuous vector-field analysis cannot match system:quantum-kicked-rotor (quantum)');
    expect(errors).toContain('continuous vector-field analysis cannot match system:rope (hybrid)');
  });

  test('does not invent system restrictions for prepared matrices or unknown non-vector-field APIs', () => {
    const eigen = find('general-eigensolver');
    expect(
      validateSourceScopes({
        ...catalog,
        analyses: [
          {
            ...eigen,
            legacyBindings: [{ module: 'src/research/future.ts', exportName: 'futureEigenvalues' }],
            compatibility: {
              systemIds: ['system:quantum-kicked-rotor'],
              requiredInputs: eigen.compatibility.requiredInputs
            }
          }
        ]
      })
    ).toEqual([]);
  });
});
