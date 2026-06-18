/**
 * @packageDocumentation
 *
 * `experimental` - APIs that work but whose shape may still change between
 * minor versions. Pin an exact version if you depend on these.
 *
 * Currently: the WebGPU/CPU double-pendulum ensemble runner, WebGPU-accelerated
 * field scans (flip basin, sweep lambda_max, finite-difference FTLE), and the
 * 4D double-pendulum full-spectrum Lyapunov promotion path.
 */

export { runComputeKernel, runDoublePendulumEnsemble, ensembleGrid, ensembleStatistics, webgpuEnsembleStatistics, compareEnsembleStatistics } from '../runtime/gpuEnsemble';
export type { EnsembleOptions, EnsembleResult, EnsembleStatistics, EnsembleStatisticsComparison, EnsembleStatisticsTolerances } from '../runtime/gpuEnsemble';
export { promotedDoublePendulumLyapunovSpectrum, webgpuDoublePendulumLyapunovSpectrumCandidate } from '../runtime/gpuLyapunov';
export type { WebgpuLyapunovSpectrumCandidate, WebgpuLyapunovSpectrumOptions, WebgpuLyapunovSpectrumPromotion } from '../runtime/gpuLyapunov';
export { flipBasinField, sweepLambdaField, ftleFieldFiniteDifference } from '../runtime/gpuFields';
export type {
  FlipBasinFieldOptions,
  FlipBasinFieldResult,
  FtleFdFieldOptions,
  FtleFdFieldResult,
  GpuFieldMeta,
  GpuFieldValidation,
  SweepFieldOptions,
  SweepFieldResult
} from '../runtime/gpuFields';
