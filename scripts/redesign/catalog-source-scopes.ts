import type { CapabilityCatalog, InputKind } from '../../src/product/contracts/catalog';
import { supportsSystem } from '../../src/product/catalog/predicates';

interface SourceScope {
  readonly systems: readonly string[];
  readonly requiredInputs: readonly InputKind[];
}

const doubleOnly = ['system:double'];
const drivenOnly = ['system:driven'];

/**
 * Narrow restrictions established by existing API implementations, not a second product catalog.
 * Unknown APIs remain subject to shape/source checks; this table does not certify scientific validity.
 */
const sourceScopes: Readonly<Record<string, SourceScope>> = {
  // DoublePendulumFitSpec requires known initialState, base parameters and fixed gamma (parameterEstimation.ts).
  'src/research/parameterEstimation.ts#fitDoublePendulum': {
    systems: doubleOnly,
    requiredInputs: ['observations', 'state', 'parameters']
  },
  // The primary runner explicitly calls doublePendulumFlipBasin; the secondary precomputed-grid API is broader.
  'src/chaos/wadaConvergence.ts#wadaResolutionConvergence': {
    systems: doubleOnly,
    requiredInputs: ['parameters']
  },
  // These primary functions accept DrivenParameters and directly use the driven-pendulum equations.
  'src/chaos/melnikov.ts#melnikovFunction': { systems: drivenOnly, requiredInputs: ['parameters'] },
  'src/chaos/continuation.ts#continueDrivenPeriodicOrbit': { systems: drivenOnly, requiredInputs: ['parameters'] },
  'src/chaos/branchSwitching.ts#switchPeriodDoubling': {
    systems: drivenOnly,
    requiredInputs: ['parameters', 'periodic-orbit']
  },
  // codimTwoDiagram calls buildRhs(SystemSpec) then continuous maximalLyapunov. Exclude hybrid double-string.
  'src/chaos/codimTwo.ts#codimTwoDiagram': {
    systems: [
      'system:double',
      'system:compound-double',
      'system:triple',
      'system:chain',
      'system:driven',
      'system:spring',
      'system:spherical-chain'
    ],
    requiredInputs: ['parameterized-model', 'state']
  },
  // The seven EXPANSION_MODEL_IDS in expandedModels-types.ts are the runner's concrete model domain.
  'src/physics/expandedModels-runners.ts#runExpansionSuite': {
    systems: [
      'system:driven',
      'system:coupled',
      'system:inverted',
      'system:cartpole',
      'system:parametric',
      'system:spherical',
      'system:chain'
    ],
    requiredInputs: ['parameters']
  },
  // floquetAnalysis fixes stateDim=2 and calls eigenvalues2x2. These models use the first two physical states,
  // optionally followed by independent drive phase; multi-DOF models need the separate floquetSpectrum API.
  'src/chaos/floquet.ts#floquetAnalysis': {
    systems: [
      'system:driven',
      'system:inverted',
      'system:parametric',
      'system:duffing',
      'system:van-der-pol',
      'system:kapitza'
    ],
    requiredInputs: ['periodic-orbit', 'vector-field']
  }
};

/** Check compatibility against known source-domain restrictions without evaluating any physics module. */
export function validateSourceScopes(catalog: CapabilityCatalog): string[] {
  const errors: string[] = [];
  for (const analysis of catalog.analyses) {
    const matches = catalog.systems.filter((system) => supportsSystem(analysis.compatibility, system));
    if (analysis.compatibility.requiredInputs.includes('vector-field')) {
      for (const system of matches) {
        if (system.evolution !== 'ode') {
          errors.push(
            `${analysis.id}: continuous vector-field analysis cannot match ${system.id} (${system.evolution})`
          );
        }
      }
    }
    const primary = analysis.legacyBindings[0];
    if (!primary) continue; // The independent catalog shape validator reports missing bindings.
    const key = `${primary.module}#${primary.exportName}`;
    const scope = sourceScopes[key];
    if (!scope) continue;
    if (matches.length === 0) errors.push(`${analysis.id}: source API ${key} must match at least one supported system`);
    for (const system of matches) {
      if (!scope.systems.includes(system.id) || system.evolution !== 'ode') {
        errors.push(`${analysis.id}: source API ${key} excludes ${system.id} (${system.evolution})`);
      }
    }
    for (const input of scope.requiredInputs) {
      if (
        !analysis.compatibility.requiredInputs.includes(input) ||
        !analysis.inputs.some((entry) => entry.kind === input)
      ) {
        errors.push(`${analysis.id}: source API ${key} requires input ${input}`);
      }
    }
  }
  return errors;
}
