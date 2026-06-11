/**
 * @packageDocumentation
 *
 * `research` — reproducible-research tooling: deterministic sampling plans,
 * adaptive experiment design, ZIP bundles with checksums, provenance graphs,
 * notebook/figure pipelines, library UX helpers, the CLI batch spec, and the
 * worker job protocol (pure handlers usable headlessly in Node).
 */

export * from '../research/researchSampling';
export * from '../research/experimentDesign';
export * from '../research/zipBundle';
export * from '../research/provenance';
export * from '../research/notebookBuilder';
export * from '../research/figurePipeline';
export * from '../research/libraryUx';
export * from '../research/cliBatchSpec';
export { hashText, csvCell, dataUrlByteEstimate } from '../research/researchExportUtils';

// Worker job protocol (pure handlers usable headlessly).
export { runChaosJob } from '../workers/chaosProtocol';
export type { ChaosRequest, ChaosResponse } from '../workers/chaosProtocol';
export { JobEngine, jobPhases, JOB_PROTOCOL_V2 } from '../workers/jobProtocol';
export type { JobEventMessage, JobInboundMessage, JobStatus, JobCheckpointState, PhaseRunner } from '../workers/jobProtocol';
