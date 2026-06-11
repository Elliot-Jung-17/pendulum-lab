/**
 * @packageDocumentation
 *
 * `experimental` — APIs that work but whose shape may still change between
 * minor versions. Pin an exact version if you depend on these.
 *
 * Currently: the WebGPU/CPU double-pendulum ensemble runner.
 */

export { runDoublePendulumEnsemble, ensembleGrid } from '../runtime/gpuEnsemble';
export type { EnsembleOptions, EnsembleResult } from '../runtime/gpuEnsemble';
