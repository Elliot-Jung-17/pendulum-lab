/**
 * The Lyapunov-spectrum self-consistency diagnostics (sum-to-zero, symplectic
 * pairing, zero-exponent count) now live in `physics/` since they are pure
 * functions of a spectrum and are shared by the physics-layer expansion
 * spectrum as well as the chaos pipeline. This module re-exports them so the
 * established `chaos/spectrumConsistency` import path keeps working unchanged.
 */
export {
  analyzeSpectrumConsistency,
  type SpectrumConsistency,
  type SpectrumConsistencyOptions
} from '../physics/spectrumConsistency';
