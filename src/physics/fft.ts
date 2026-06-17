/**
 * Headless radix-2 Cooley–Tukey complex FFT for the quantum solvers (the
 * split-operator quantum kicked rotor in `quantumKickedRotor.ts` switches
 * between the position and momentum bases every kick). Kept in the physics layer
 * — dependency-free and independent of the app's UI FFT panel — so the headless
 * core never reaches up into `src/app`.
 *
 * `fftInPlace` is the forward transform X_k = Σ_j x_j e^{-2πi jk/N}; `ifftInPlace`
 * is its exact inverse x_j = (1/N) Σ_k X_k e^{+2πi jk/N}, so ifft∘fft is the
 * identity to round-off. Length must be a power of two.
 */

/** In-place forward FFT. `re`/`im` (power-of-two length) are overwritten. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('fftInPlace: length must be a power of two');

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm;
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

/** In-place inverse FFT (normalised by 1/N), via conjugation of the forward FFT. */
export function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  for (let i = 0; i < n; i += 1) im[i] = -(im[i] ?? 0);
  fftInPlace(re, im);
  const inv = 1 / n;
  for (let i = 0; i < n; i += 1) {
    re[i] = (re[i] ?? 0) * inv;
    im[i] = -(im[i] ?? 0) * inv;
  }
}
