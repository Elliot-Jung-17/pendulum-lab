import type { AnalysisDefinition, CapabilityPredicate, InputKind, LocalizedText } from '../contracts/catalog';

type Translation = readonly [ko: string, en: string];
type Input = readonly [kind: InputKind, ko: string, en: string];
interface AnalysisEntry {
  id: `analysis:${string}`;
  name: Translation;
  module: string;
  exports: readonly string[];
  stage: number;
  description: Translation;
  inputs: readonly Input[];
  parameters: Translation;
  output: readonly [kind: string, ko: string, en: string];
  cost: Translation;
  limitation: Translation;
  scope?: Omit<CapabilityPredicate, 'requiredInputs'>;
}

const text = ([ko, en]: Translation): LocalizedText => ({ ko, en });

/** These entries describe direct library calls. Worker routing belongs to a later stage. */
export function analysis(entry: AnalysisEntry): AnalysisDefinition {
  const bindings = entry.exports.map((exportName) => ({ module: entry.module, exportName }));
  return {
    id: entry.id,
    category: 'analysis',
    name: text(entry.name),
    description: text(entry.description),
    tags: ['analysis', 'legacy-api'],
    legacyBindings: bindings,
    baselineIds: [entry.id],
    integrationStage: entry.stage,
    limitations: [text(entry.limitation)],
    compatibility: { ...entry.scope, requiredInputs: entry.inputs.map(([kind]) => kind) },
    inputs: entry.inputs.map(([kind, ko, en]) => ({ kind, description: { ko, en } })),
    parameters: {
      kind: 'legacy-api',
      version: 'unversioned',
      bindings,
      description: text(entry.parameters)
    },
    computation: { location: 'main', cancellable: false, cost: text(entry.cost) },
    outputs: [{ kind: entry.output[0], description: { ko: entry.output[1], en: entry.output[2] } }]
  };
}

export const ode = { evolutions: ['ode'] } as const;
export const driven = { systemIds: ['system:driven'], evolutions: ['ode'] } as const;
export const initialState: Input = [
  'state',
  '기존 API 좌표 순서의 유한 초기 상태.',
  'Finite initial state in the legacy API coordinate order.'
];
export const rhs: Input = [
  'vector-field',
  '기존 Derivative 규약의 연속 벡터장.',
  'Continuous vector field following the legacy Derivative contract.'
];
