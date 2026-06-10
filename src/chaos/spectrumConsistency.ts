/**
 * Self-consistency diagnostics for a Lyapunov spectrum. A continuous-time
 * autonomous Hamiltonian flow of N degrees of freedom must produce a spectrum
 * that (a) sums to zero (phase-space volume is conserved) and (b) is symmetric
 * under λ_i ↔ −λ_{n-1-i} (the symplectic pairing rule), with two of the
 * exponents identically zero — one for the flow direction and one for its
 * symplectic conjugate (the energy shell). For the conservative double pendulum
 * the spectrum is therefore {λ, 0, 0, −λ}.
 *
 * These are not assumptions baked into the estimator — they are independent
 * theoretical constraints, so measuring how well a *computed* spectrum honours
 * them is a free, powerful validation of the whole tangent-space pipeline
 * (integrator + Jacobian + Gram-Schmidt). A large pairing or sum error means the
 * numbers are not trustworthy regardless of how confident the point estimate
 * looks.
 */

export interface SpectrumConsistencyOptions {
  /** |Σλ| at or below this counts the volume contraction as consistent with conservation. */
  sumTolerance?: number;
  /** max|λ_i + λ_{n-1-i}| at or below this counts the spectrum as symplectically paired. */
  pairingTolerance?: number;
  /** |λ| at or below this counts an exponent as a (theoretically) zero exponent. */
  zeroTolerance?: number;
}

export interface SpectrumConsistency {
  /** Sum of all exponents; ≈ 0 for a conservative/Hamiltonian flow. */
  sum: number;
  /** Largest |λ_i + λ_{n-1-i}| over symplectic-conjugate pairs (plus the lone middle exponent for odd n). */
  pairingError: number;
  /** Number of exponents within `zeroTolerance` of zero (expected 2 for an autonomous 2-DOF Hamiltonian). */
  zeroExponentCount: number;
  /** True when both |Σλ| ≤ sumTolerance and pairingError ≤ pairingTolerance. */
  symplectic: boolean;
  /** The tolerances the verdict was computed with, so the gate is reproducible. */
  tolerances: Required<SpectrumConsistencyOptions>;
}

const DEFAULTS: Required<SpectrumConsistencyOptions> = {
  sumTolerance: 0.1,
  pairingTolerance: 0.1,
  zeroTolerance: 0.05
};

/**
 * Analyse a Lyapunov spectrum for Hamiltonian self-consistency. The input need
 * not be pre-sorted; a descending copy is taken so the pairing rule lines the
 * largest exponent up with the most negative one.
 */
export function analyzeSpectrumConsistency(
  spectrumInput: readonly number[],
  options: SpectrumConsistencyOptions = {}
): SpectrumConsistency {
  const tolerances: Required<SpectrumConsistencyOptions> = {
    sumTolerance: options.sumTolerance ?? DEFAULTS.sumTolerance,
    pairingTolerance: options.pairingTolerance ?? DEFAULTS.pairingTolerance,
    zeroTolerance: options.zeroTolerance ?? DEFAULTS.zeroTolerance
  };

  const spectrum = [...spectrumInput].sort((a, b) => b - a);
  const n = spectrum.length;

  let sum = 0;
  for (const value of spectrum) sum += value;

  let pairingError = 0;
  for (let i = 0; i < Math.floor(n / 2); i += 1) {
    const pair = (spectrum[i] ?? 0) + (spectrum[n - 1 - i] ?? 0);
    pairingError = Math.max(pairingError, Math.abs(pair));
  }
  // For an odd-dimensional spectrum the unpaired middle exponent is itself
  // expected to vanish, so fold its magnitude into the pairing error.
  if (n % 2 === 1) {
    pairingError = Math.max(pairingError, Math.abs(spectrum[(n - 1) / 2] ?? 0));
  }

  let zeroExponentCount = 0;
  for (const value of spectrum) {
    if (Math.abs(value) <= tolerances.zeroTolerance) zeroExponentCount += 1;
  }

  return {
    sum,
    pairingError,
    zeroExponentCount,
    symplectic: Math.abs(sum) <= tolerances.sumTolerance && pairingError <= tolerances.pairingTolerance,
    tolerances
  };
}
