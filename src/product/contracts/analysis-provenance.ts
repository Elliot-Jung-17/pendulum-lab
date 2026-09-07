import { inspectSafeData } from '../persistence/safe-data';
import { fields, invalid, token } from './contract-checks';
import type { AnalysisArtifactProvenanceV1 } from './experiment';
import { checkAnalysis } from './experiment-validation';
import { issue, success, type ContractIssue, type ContractResult } from './validation';

export function validateAnalysisArtifactProvenance(input: unknown): ContractResult<AnalysisArtifactProvenanceV1> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const value = safe.value;
  const issues: ContractIssue[] = [];
  if (!fields(value, ['schema', 'artifactId', 'inputRunId', 'analysis', 'createdAt'], [], '$', issues))
    return { ok: false, issues };
  if (value.schema !== 'pendulum-analysis-provenance/v1')
    issues.push(
      issue('unsupported-version', '$.schema', 'Unsupported analysis provenance schema.', 'use-supported-version')
    );
  token(value.artifactId, '$.artifactId', issues);
  token(value.inputRunId, '$.inputRunId', issues);
  checkAnalysis(value.analysis, '$.analysis', issues);
  if (
    typeof value.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  )
    invalid(issues, '$.createdAt', 'Expected a valid UTC ISO timestamp with milliseconds.');
  return issues.length ? { ok: false, issues } : success(value as unknown as AnalysisArtifactProvenanceV1);
}
