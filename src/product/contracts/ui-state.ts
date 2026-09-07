import { inspectSafeData } from '../persistence/safe-data';
import { fields, invalid, isFieldName, isRecord } from './contract-checks';
import { SOURCE_UNITS, type SourceUnit } from './quantities';
import { issue, success, type ContractIssue, type ContractResult } from './validation';

export const UI_STATE_SCHEMA = 'pendulum-ui/v1' as const;
export const PANEL_IDS = ['configuration', 'simulation', 'plots', 'analysis', 'notes'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** Persisted separately: removing this object never changes experiment execution or numerical meaning. */
export interface UiStateV1 {
  readonly schema: typeof UI_STATE_SCHEMA;
  readonly locale: 'ko' | 'en';
  readonly theme: 'system' | 'light' | 'dark';
  readonly layout: { readonly panels: readonly PanelId[]; readonly activePanel: PanelId };
  readonly displayUnits: Readonly<Record<string, SourceUnit>>;
}

export function validateUiState(input: unknown): ContractResult<UiStateV1> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const value = safe.value;
  const issues: ContractIssue[] = [];
  if (!fields(value, ['schema', 'locale', 'theme', 'layout', 'displayUnits'], [], '$', issues))
    return { ok: false, issues };
  if (value.schema !== UI_STATE_SCHEMA)
    issues.push(issue('unsupported-version', '$.schema', 'Unsupported UI schema.', 'use-supported-version'));
  if (value.locale !== 'ko' && value.locale !== 'en') invalid(issues, '$.locale', 'Expected ko or en locale.');
  if (typeof value.theme !== 'string' || !['system', 'light', 'dark'].includes(value.theme))
    invalid(issues, '$.theme', 'Expected system, light, or dark theme.');
  if (fields(value.layout, ['panels', 'activePanel'], [], '$.layout', issues)) {
    const panels = value.layout.panels;
    if (
      !Array.isArray(panels) ||
      panels.length < 1 ||
      panels.length > PANEL_IDS.length ||
      panels.some((panel) => !(PANEL_IDS as readonly unknown[]).includes(panel)) ||
      new Set(panels).size !== panels.length
    )
      invalid(issues, '$.layout.panels', 'Expected unique known panel IDs.');
    if (
      !(PANEL_IDS as readonly unknown[]).includes(value.layout.activePanel) ||
      !Array.isArray(panels) ||
      !(panels as readonly unknown[]).includes(value.layout.activePanel)
    )
      invalid(issues, '$.layout.activePanel', 'Active panel must be present in the layout.');
  }
  if (!isRecord(value.displayUnits) || Object.keys(value.displayUnits).length > 256)
    invalid(issues, '$.displayUnits', 'Expected a bounded display-unit map.');
  else
    for (const [key, unit] of Object.entries(value.displayUnits)) {
      if (!isFieldName(key)) invalid(issues, `$.displayUnits.${key}`, 'Expected a quantity display key.');
      if (!(SOURCE_UNITS as readonly unknown[]).includes(unit))
        invalid(issues, `$.displayUnits.${key}`, 'Unknown display unit.');
    }
  return issues.length ? { ok: false, issues } : success(value as unknown as UiStateV1);
}
