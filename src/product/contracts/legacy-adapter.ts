import type { EXPERIMENT_SCHEMA, ExperimentStateV1 } from './experiment';
import type { ContractResult } from './validation';

/**
 * A future, explicitly versioned translation boundary. S03 defines this
 * interface only; it does not register or execute a legacy migration.
 *
 * Both directions validate unknown input and return detached plain-data copies.
 * They must leave the source and live runtime/storage untouched, preserve units,
 * coordinate winding, integrator identity, time and exact seed semantics, and
 * fail with recoverable issues when any field cannot be represented. No silent
 * defaults, clamping, alias substitution, callback evaluation or data dropping.
 *
 * Canonical v1 describes a restart configuration. A successful conversion does
 * not certify bit-for-bit continuation of solver buffers, stochastic streams,
 * arbitrary delay-history functions, or a complete legacy workspace. Those need
 * separately versioned adapters and preservation fixtures in their own stages.
 */
export interface LegacyExperimentAdapter<LegacyState> {
  readonly id: string;
  readonly version: string;
  readonly sourceSchema: string;
  readonly canonicalSchema: typeof EXPERIMENT_SCHEMA;
  readonly supportedSystemIds: readonly ExperimentStateV1['systemId'][];
  toCanonical(source: unknown): ContractResult<ExperimentStateV1>;
  fromCanonical(source: unknown): ContractResult<LegacyState>;
}
