import { catalog } from './index';
import { compatibleAnalyses, compatibleIntegrators } from './predicates';
import type { InputKind, SystemDefinition } from '../contracts/catalog';

export const SYSTEM_FAMILIES: readonly { id: SystemDefinition['family']; label: string }[] = [
  { id: 'classical', label: '고전 진자' },
  { id: 'flexible', label: '용수철과 줄' },
  { id: 'spatial', label: '공간 진자' },
  { id: 'driven-control', label: '구동과 제어' },
  { id: 'nonlinear', label: '비선형 진동' },
  { id: 'network', label: '네트워크' },
  { id: 'stochastic-field', label: '확률과 장' },
  { id: 'discrete-quantum', label: '이산계와 양자계' }
];

export function getSystem(id: string): SystemDefinition | undefined {
  return catalog.systems.find((system) => system.id === id);
}

export interface SystemSelection {
  readonly query?: string;
  readonly family?: SystemDefinition['family'] | 'all';
  readonly collection?: 'all' | 'recent' | 'favorites';
  readonly recentIds?: readonly string[];
  readonly favoriteIds?: readonly string[];
}

export function selectSystems(selection: SystemSelection = {}): SystemDefinition[] {
  const words = (selection.query ?? '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const collectionIds = selection.collection === 'recent' ? (selection.recentIds ?? []) : (selection.favoriteIds ?? []);
  const systems = catalog.systems.filter((system) => {
    if (selection.family && selection.family !== 'all' && system.family !== selection.family) return false;
    if (selection.collection && selection.collection !== 'all' && !collectionIds.includes(system.id)) return false;
    const family = SYSTEM_FAMILIES.find((entry) => entry.id === system.family)?.label ?? '';
    const searchable = [
      system.id,
      system.name.ko,
      system.name.en,
      system.description.ko,
      system.description.en,
      family,
      ...system.tags
    ]
      .join(' ')
      .normalize('NFKC')
      .toLocaleLowerCase();
    return words.every((word) => searchable.includes(word));
  });
  return selection.collection === 'recent'
    ? systems.sort((a, b) => collectionIds.indexOf(a.id) - collectionIds.indexOf(b.id))
    : systems;
}

/**
 * A narrow fixture profile for S06 configuration rehearsal. These are planned
 * inputs, never claims that catalog discovery or a mock run produced real data.
 * Physics adapters must supply validated availableInputs to the original
 * predicates before actually executing any analysis in later stages.
 */
function plannedMockInputs(system: SystemDefinition): readonly InputKind[] {
  if (['spectral', 'diagnostic', 'quantum'].includes(system.evolution)) return ['state'];
  const inputs: InputKind[] = ['state', 'trajectory', 'scalar-series', 'uniform-series'];
  if (system.evolution === 'ode') inputs.push('vector-field');
  if (['system:double', 'system:compound-double', 'system:triple', 'system:spring'].includes(system.id)) {
    inputs.push('energy-series');
  }
  return inputs;
}

export function selectLabCapabilities(system: SystemDefinition) {
  const plannedInputs = plannedMockInputs(system);
  const context = { system, availableInputs: plannedInputs };
  return {
    plannedInputs,
    analyses: compatibleAnalyses(catalog, context),
    integrators: compatibleIntegrators(catalog, context),
    exports: [
      {
        id: 'mock-settings-json' as const,
        name: '모의 설정 JSON',
        description: '설정과 모의 실행 기록만 포함합니다. 실제 궤적이나 분석 결과는 없습니다.'
      }
    ]
  };
}
