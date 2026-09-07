import type { ExperimentStateV1 } from '../contracts/experiment';
import { validateExperimentState } from '../contracts/experiment-validation';
import { validateUiState, type UiStateV1 } from '../contracts/ui-state';
import { failure, success, type ContractResult } from '../contracts/validation';
import { parseContractJson } from './json';
import { canonicalJson, DATA_LIMITS, inspectSafeData } from './safe-data';

function serializeSnapshot(input: unknown): ContractResult<string> {
  const snapshot = inspectSafeData(input);
  if (!snapshot.ok) return snapshot;
  const json = canonicalJson(snapshot.value);
  if (new TextEncoder().encode(json).length > DATA_LIMITS.bytes) {
    return failure(
      'size-limit',
      '$',
      'Serialized JSON exceeds the contract limit; use a separate artifact.',
      'export-file'
    );
  }
  return success(json);
}

/** Validate first, then serialize an isolated snapshot without UI state or implicit defaults. */
export function serializeExperiment(input: unknown): ContractResult<string> {
  const state = validateExperimentState(input);
  if (!state.ok) return state;
  return serializeSnapshot(state.value);
}

export function parseExperiment(text: unknown): ContractResult<ExperimentStateV1> {
  const parsed = parseContractJson(text);
  return parsed.ok ? validateExperimentState(parsed.value) : parsed;
}

/** UI has its own file contract; an experiment can always be restored without this file. */
export function serializeUiState(input: unknown): ContractResult<string> {
  const state = validateUiState(input);
  if (!state.ok) return state;
  return serializeSnapshot(state.value);
}

export function parseUiState(text: unknown): ContractResult<UiStateV1> {
  const parsed = parseContractJson(text);
  return parsed.ok ? validateUiState(parsed.value) : parsed;
}
