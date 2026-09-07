/** Product-internal contracts. The existing published library entrypoints remain unchanged. */
export type * from './experiment';
export type * from './legacy-adapter';
export type { QuantityValue, QuantityMap, CanonicalUnit, SourceUnit } from './quantities';
export type { UiStateV1, PanelId } from './ui-state';
export type { ContractIssue, ContractResult } from './validation';
export { EXPERIMENT_SCHEMA } from './experiment';
export { CANONICAL_UNITS, SOURCE_UNITS, validateQuantityValue } from './quantities';
export { validateExperimentState } from './experiment-validation';
export { validateAnalysisArtifactProvenance } from './analysis-provenance';
export { UI_STATE_SCHEMA, validateUiState } from './ui-state';
export { parseProductRoute, serializeProductRoute } from './routes';
export type { ProductRoute, CourseId, UnitId } from './routes';
