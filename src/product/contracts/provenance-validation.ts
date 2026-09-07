import { fields, invalid, isRecord, token, type UnknownRecord } from './contract-checks';
import { SOURCE_UNITS } from './quantities';
import type { ContractIssue } from './validation';

const ORIGINAL_TO_SI: Readonly<Record<string, string>> = {
  deg: 'rad',
  'deg/s': 'rad/s',
  'deg/s^2': 'rad/s^2',
  ms: 's',
  min: 's',
  cm: 'm',
  mm: 'm',
  g: 'kg'
};

export function checkProvenance(value: unknown, experiment: UnknownRecord, issues: ContractIssue[]): void {
  const path = '$.provenance';
  if (!fields(value, ['createdByVersion', 'source', 'parentExperimentIds'], ['sourceUnits'], path, issues)) return;
  token(value.createdByVersion, `${path}.createdByVersion`, issues);
  if (fields(value.source, ['kind'], ['id'], `${path}.source`, issues)) {
    if (typeof value.source.kind !== 'string' || !['manual', 'preset', 'import', 'derived'].includes(value.source.kind))
      invalid(issues, `${path}.source.kind`, 'Unknown provenance source kind.');
    if (Object.hasOwn(value.source, 'id')) token(value.source.id, `${path}.source.id`, issues);
    if (value.source.kind !== 'manual' && !Object.hasOwn(value.source, 'id'))
      invalid(issues, `${path}.source.id`, 'Nonmanual sources require an opaque identifier.');
  }
  if (!Array.isArray(value.parentExperimentIds) || value.parentExperimentIds.length > 32)
    invalid(issues, `${path}.parentExperimentIds`, 'Expected at most 32 parent experiment IDs.');
  else {
    value.parentExperimentIds.forEach((id, index) => token(id, `${path}.parentExperimentIds[${index}]`, issues));
    if (new Set(value.parentExperimentIds).size !== value.parentExperimentIds.length)
      invalid(issues, `${path}.parentExperimentIds`, 'Parent experiment IDs must be unique.');
  }
  if (Object.hasOwn(value, 'sourceUnits')) {
    if (!isRecord(value.sourceUnits) || Object.keys(value.sourceUnits).length > 256) {
      invalid(issues, `${path}.sourceUnits`, 'Expected a bounded source-unit map.');
      return;
    }
    for (const [name, unit] of Object.entries(value.sourceUnits)) {
      const match = /^(parameters|initialConditions)\.([A-Za-z][A-Za-z0-9_]{0,63})$/.exec(name);
      const group = match && experiment[match[1]!];
      const quantity = match && isRecord(group) ? group[match[2]!] : undefined;
      if (!isRecord(quantity))
        invalid(issues, `${path}.sourceUnits.${name}`, 'Source unit must reference an existing experiment quantity.');
      if (typeof unit !== 'string' || !(SOURCE_UNITS as readonly unknown[]).includes(unit))
        invalid(issues, `${path}.sourceUnits.${name}`, 'Unsupported original input unit.');
      else if (isRecord(quantity) && (ORIGINAL_TO_SI[unit] ?? unit) !== quantity.unit)
        invalid(issues, `${path}.sourceUnits.${name}`, 'Original unit must match the canonical quantity dimension.');
    }
  }
}
