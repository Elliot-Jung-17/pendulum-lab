/** S02 discovery contracts. These describe existing APIs; they do not execute or migrate them. */
export type LocalizedText = Readonly<{ ko: string; en: string }>;
export type CapabilityCategory =
  'system' | 'analysis' | 'integrator' | 'control' | 'importer' | 'exporter' | 'storage-schema' | 'route' | 'runtime';
export type CapabilityId = `${CapabilityCategory}:${string}`;

/** Source export checked statically at build time, without evaluating legacy modules. */
export interface LegacyBinding {
  readonly module: string;
  readonly exportName: string;
  readonly member?: string;
}

export type EvolutionKind =
  'ode' | 'hybrid' | 'constrained' | 'delay' | 'sde' | 'field' | 'map' | 'quantum' | 'spectral' | 'diagnostic';
export type InputKind =
  | 'state'
  | 'trajectory'
  | 'scalar-series'
  | 'uniform-series'
  | 'energy-series'
  | 'vector-field'
  | 'tangent-model'
  | 'flow-map'
  | 'map-function'
  | 'jacobian'
  | 'phase-series'
  | 'ensemble'
  | 'parameter-grid'
  | 'observations'
  | 'training-data'
  | 'matrix'
  | 'symmetric-matrix'
  | 'complex-matrix'
  | 'linear-operator'
  | 'periodic-orbit'
  | 'continuation-branch'
  | 'basin-grid'
  | 'ftle-grid'
  | 'point-cloud'
  | 'lattice'
  | 'field'
  | 'model-evaluator'
  | 'potential'
  | 'multipliers'
  | 'energy-function'
  | 'parameterized-model'
  | 'residual-function'
  | 'symmetric-operator'
  | 'parameters';

/** All specified clauses must match. Missing clauses impose no condition; empty lists match nothing. */
export interface CapabilityPredicate {
  readonly systemIds?: readonly `system:${string}`[];
  readonly evolutions?: readonly EvolutionKind[];
  readonly requiredInputs: readonly InputKind[];
}

export interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly category: CapabilityCategory;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly tags: readonly string[];
  /** For analyses/integrators the first binding is the callable computation API; later bindings may be metadata. */
  readonly legacyBindings: readonly LegacyBinding[];
  /** Frozen S01 semantic or observed integrator IDs; no filename-derived product IDs. */
  readonly baselineIds: readonly string[];
  readonly integrationStage: number;
  readonly limitations: readonly LocalizedText[];
}

export interface LegacySchemaReference {
  readonly kind: 'legacy-api';
  readonly version: 'unversioned';
  readonly bindings: readonly LegacyBinding[];
  readonly description: LocalizedText;
}

export interface SystemDefinition extends CapabilityDefinition {
  readonly id: `system:${string}`;
  readonly category: 'system';
  readonly family:
    | 'classical'
    | 'flexible'
    | 'spatial'
    | 'driven-control'
    | 'nonlinear'
    | 'network'
    | 'stochastic-field'
    | 'discrete-quantum';
  readonly evolution: EvolutionKind;
  /** Existing callable entry points, not newly implemented product runtime adapters. */
  readonly engineAdapters: readonly LegacyBinding[];
  readonly state: LegacySchemaReference;
  readonly parameters: LegacySchemaReference;
  readonly coordinates: LocalizedText;
  readonly degreesOfFreedom:
    | { readonly kind: 'fixed'; readonly value: number }
    | { readonly kind: 'variable'; readonly description: LocalizedText };
  readonly stepping:
    | { readonly kind: 'selectable'; readonly integratorIds: readonly `integrator:${string}`[] }
    | { readonly kind: 'internal'; readonly binding: LegacyBinding; readonly description: LocalizedText };
}

export interface AnalysisDefinition extends CapabilityDefinition {
  readonly id: `analysis:${string}`;
  readonly category: 'analysis';
  readonly compatibility: CapabilityPredicate;
  readonly inputs: readonly { readonly kind: InputKind; readonly description: LocalizedText }[];
  readonly parameters: LegacySchemaReference;
  readonly computation: {
    readonly location: 'main' | 'worker' | 'wasm';
    readonly cancellable: boolean;
    readonly cost: LocalizedText;
  };
  readonly outputs: readonly { readonly kind: string; readonly description: LocalizedText }[];
}

export interface IntegratorDefinition extends CapabilityDefinition {
  readonly id: `integrator:${string}`;
  readonly category: 'integrator';
  readonly compatibility: CapabilityPredicate;
  readonly method: 'explicit' | 'implicit' | 'split' | 'adaptive-controller' | 'canonical-transform' | 'stochastic';
  readonly order: number | null;
  readonly legacyId?: string;
}

export interface AuxiliaryDefinition extends CapabilityDefinition {
  readonly category: Exclude<CapabilityCategory, 'system' | 'analysis' | 'integrator'>;
}
export type CatalogDefinition = SystemDefinition | AnalysisDefinition | IntegratorDefinition | AuxiliaryDefinition;
export interface CapabilityCatalog {
  readonly systems: readonly SystemDefinition[];
  readonly analyses: readonly AnalysisDefinition[];
  readonly integrators: readonly IntegratorDefinition[];
  readonly auxiliary: readonly AuxiliaryDefinition[];
}
