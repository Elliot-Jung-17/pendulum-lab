/**
 * **General (non-symmetric) real eigensolver** — the complex eigenvalues of a
 * dense real matrix of *arbitrary* size, via the textbook stable pipeline:
 *
 *   1. **balance** (Parlett–Reinsch): a diagonal similarity that equalises row
 *      and column norms, improving the accuracy of badly-scaled matrices
 *      (eigenvalues unchanged);
 *   2. **Hessenberg reduction** (Householder): an orthogonal similarity to upper
 *      Hessenberg form (one non-zero subdiagonal), the staging form for QR;
 *   3. **Francis double-shift QR** (the `hqr` algorithm): implicit shifted QR
 *      iteration with deflation that peels real eigenvalues and 2×2 blocks
 *      (complex-conjugate pairs) off the bottom-right corner.
 *
 * This complements `complexEig.ts`, whose Faddeev–LeVerrier + Durand–Kerner route
 * is exact only for small n (≲ 15): the QR route here is O(n³), backward-stable,
 * and handles the large non-symmetric matrices the spectral applications need —
 * the **subdominant spectrum of the Perron–Frobenius / Ulam transfer operator**
 * (mixing rate, almost-invariant sets) and **Floquet multipliers / quasi-energy
 * bands**. It self-validates against closed-form spectra (diagonal, triangular,
 * rotation, circulant DFT spectrum, companion-matrix polynomial roots), against
 * the trace/determinant invariants (Σλ = tr, Πλ = det), and by agreeing with both
 * `complexEig` (small n) and the symmetric Jacobi solver (symmetric matrices).
 *
 * Matrices are passed as an array of equal-length rows (`number[][]`).
 */
import type { Complex } from './complexEig';

const EPS = Number.EPSILON; // ≈ 2.22e-16

/** |a| with the sign of b (Fortran SIGN(a, b); sign of 0 is +). */
const withSign = (a: number, b: number): number => (b >= 0 ? Math.abs(a) : -Math.abs(a));

function assertSquare(matrix: readonly (readonly number[])[], who: string): number {
  const n = matrix.length;
  if (n === 0) throw new Error(`${who}: matrix must be non-empty.`);
  for (let i = 0; i < n; i += 1) {
    if ((matrix[i] ?? []).length !== n) throw new Error(`${who}: matrix must be square.`);
  }
  return n;
}

const cloneMatrix = (matrix: readonly (readonly number[])[]): number[][] => matrix.map((row) => row.slice());

/**
 * Parlett–Reinsch balancing (EISPACK `balanc`): a diagonal similarity
 * D⁻¹AD that scales each row/column by a power of 2 until their norms are within
 * a factor of 2, reducing the eigenvalue sensitivity of badly-scaled matrices.
 * Eigenvalues are preserved exactly (in exact arithmetic). Returns a new matrix.
 */
export function balanceMatrix(matrix: readonly (readonly number[])[]): number[][] {
  const n = assertSquare(matrix, 'balanceMatrix');
  const a = cloneMatrix(matrix);
  const RADIX = 2;
  const RADIX2 = RADIX * RADIX;
  let converged = false;
  let guard = 0;
  while (!converged && guard < 1000) {
    converged = true;
    guard += 1;
    for (let i = 0; i < n; i += 1) {
      let c = 0; // off-diagonal column-i 1-norm
      let r = 0; // off-diagonal row-i 1-norm
      for (let j = 0; j < n; j += 1) {
        if (j === i) continue;
        c += Math.abs(a[j]![i] ?? 0);
        r += Math.abs(a[i]![j] ?? 0);
      }
      if (c === 0 || r === 0) continue;
      let g = r / RADIX;
      let f = 1;
      const s0 = c + r;
      while (c < g) {
        f *= RADIX;
        c *= RADIX2;
      }
      g = r * RADIX;
      while (c >= g) {
        f /= RADIX;
        c /= RADIX2;
      }
      if ((c + r) / f < 0.95 * s0) {
        converged = false;
        const gInv = 1 / f;
        const rowI = a[i]!;
        for (let j = 0; j < n; j += 1) rowI[j] = (rowI[j] ?? 0) * gInv;
        for (let j = 0; j < n; j += 1) a[j]![i] = (a[j]![i] ?? 0) * f;
      }
    }
  }
  return a;
}

/**
 * Householder reduction of a real matrix to upper Hessenberg form via orthogonal
 * similarity QᵀAQ (eigenvalues preserved). Sub-subdiagonal entries are zeroed
 * exactly. Returns a new matrix.
 */
export function hessenbergReduce(matrix: readonly (readonly number[])[]): number[][] {
  const n = assertSquare(matrix, 'hessenbergReduce');
  const h = cloneMatrix(matrix);
  for (let k = 0; k < n - 2; k += 1) {
    let scale = 0;
    for (let i = k + 1; i < n; i += 1) scale += Math.abs(h[i]![k] ?? 0);
    if (scale === 0) continue;
    // Householder vector v over rows k+1..n-1, reflecting the sub-column onto e₁.
    const v = new Array<number>(n).fill(0);
    let normX2 = 0;
    for (let i = k + 1; i < n; i += 1) {
      const val = h[i]![k] ?? 0;
      v[i] = val;
      normX2 += val * val;
    }
    let alpha = Math.sqrt(normX2);
    if (alpha === 0) continue;
    if ((h[k + 1]![k] ?? 0) > 0) alpha = -alpha; // choose sign to avoid cancellation
    v[k + 1] = (v[k + 1] ?? 0) - alpha;
    let vNorm2 = 0;
    for (let i = k + 1; i < n; i += 1) vNorm2 += (v[i] ?? 0) * (v[i] ?? 0);
    if (vNorm2 === 0) continue;
    const beta = 2 / vNorm2; // P = I − β v vᵀ

    // Left: H ← P H.
    for (let j = 0; j < n; j += 1) {
      let tau = 0;
      for (let i = k + 1; i < n; i += 1) tau += (v[i] ?? 0) * (h[i]![j] ?? 0);
      tau *= beta;
      for (let i = k + 1; i < n; i += 1) h[i]![j] = (h[i]![j] ?? 0) - (v[i] ?? 0) * tau;
    }
    // Right: H ← H P.
    for (let i = 0; i < n; i += 1) {
      let tau = 0;
      for (let j = k + 1; j < n; j += 1) tau += (h[i]![j] ?? 0) * (v[j] ?? 0);
      tau *= beta;
      for (let j = k + 1; j < n; j += 1) h[i]![j] = (h[i]![j] ?? 0) - tau * (v[j] ?? 0);
    }
  }
  // Zero the sub-subdiagonal dust the reflectors leave behind (exact Hessenberg).
  for (let i = 0; i < n; i += 1) for (let j = 0; j < i - 1; j += 1) h[i]![j] = 0;
  return h;
}

/**
 * Complex eigenvalues of a real **upper Hessenberg** matrix via the Francis
 * implicit double-shift QR algorithm with deflation (the EISPACK `hqr`). The
 * input is assumed upper Hessenberg (e.g. the output of `hessenbergReduce`); it
 * is copied internally and not mutated. Returns n eigenvalues (real entries have
 * `im = 0`; complex eigenvalues appear in conjugate pairs).
 */
export function francisEigenvalues(matrix: readonly (readonly number[])[], maxIterationsPerRoot = 100): Complex[] {
  const n = assertSquare(matrix, 'francisEigenvalues');
  const h = cloneMatrix(matrix);
  const eig: Complex[] = new Array<Complex>(n);
  const maxIts = maxIterationsPerRoot;

  // Matrix 1-norm over the Hessenberg band (convergence scale).
  let anorm = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = Math.max(i - 1, 0); j < n; j += 1) anorm += Math.abs(h[i]![j] ?? 0);
  }

  let nn = n - 1;
  let t = 0; // accumulated shift
  while (nn >= 0) {
    let its = 0;
    let l = 0;
    do {
      // Find a negligible subdiagonal element to split off at row l.
      for (l = nn; l >= 1; l -= 1) {
        let s0 = Math.abs(h[l - 1]![l - 1] ?? 0) + Math.abs(h[l]![l] ?? 0);
        if (s0 === 0) s0 = anorm;
        if (Math.abs(h[l]![l - 1] ?? 0) <= EPS * s0) {
          h[l]![l - 1] = 0;
          break;
        }
      }
      let x = h[nn]![nn] ?? 0;
      let y = 0;
      let w = 0;
      let p = 0;
      let q = 0;
      let r = 0;
      let s = 0;
      let z = 0;
      if (l === nn) {
        // One real root.
        eig[nn] = { re: x + t, im: 0 };
        nn -= 1;
      } else {
        y = h[nn - 1]![nn - 1] ?? 0;
        w = (h[nn]![nn - 1] ?? 0) * (h[nn - 1]![nn] ?? 0);
        if (l === nn - 1) {
          // Two roots from the trailing 2×2 block.
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + withSign(z, p);
            eig[nn - 1] = { re: x + z, im: 0 };
            eig[nn] = { re: z !== 0 ? x - w / z : x + z, im: 0 };
          } else {
            eig[nn - 1] = { re: x + p, im: z };
            eig[nn] = { re: x + p, im: -z };
          }
          nn -= 2;
        } else {
          if (its >= maxIts) throw new Error('francisEigenvalues: QR iteration failed to converge.');
          if (its === 10 || its === 20) {
            // Exceptional (ad-hoc) shift to break out of a cycle.
            t += x;
            for (let i = 0; i <= nn; i += 1) h[i]![i] = (h[i]![i] ?? 0) - x;
            s = Math.abs(h[nn]![nn - 1] ?? 0) + Math.abs(h[nn - 1]![nn - 2] ?? 0);
            x = 0.75 * s;
            y = x;
            w = -0.4375 * s * s;
          }
          its += 1;
          // Look for two consecutive small subdiagonals; sets the implicit shift (p, q, r).
          let m = nn - 2;
          for (; m >= l; m -= 1) {
            z = h[m]![m] ?? 0;
            r = x - z;
            s = y - z;
            p = (r * s - w) / (h[m + 1]![m] ?? 0) + (h[m]![m + 1] ?? 0);
            q = (h[m + 1]![m + 1] ?? 0) - z - r - s;
            r = h[m + 2]![m + 1] ?? 0;
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(h[m]![m - 1] ?? 0) * (Math.abs(q) + Math.abs(r));
            const vv = Math.abs(p) * (Math.abs(h[m - 1]![m - 1] ?? 0) + Math.abs(z) + Math.abs(h[m + 1]![m + 1] ?? 0));
            if (u <= EPS * vv) break;
          }
          for (let i = m + 2; i <= nn; i += 1) {
            h[i]![i - 2] = 0;
            if (i !== m + 2) h[i]![i - 3] = 0;
          }
          // Double QR sweep across rows/columns m..nn.
          for (let k = m; k <= nn - 1; k += 1) {
            if (k !== m) {
              p = h[k]![k - 1] ?? 0;
              q = h[k + 1]![k - 1] ?? 0;
              r = k !== nn - 1 ? (h[k + 2]![k - 1] ?? 0) : 0;
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            s = withSign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) h[k]![k - 1] = -(h[k]![k - 1] ?? 0);
              } else {
                h[k]![k - 1] = -s * x;
              }
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              // Row transformation.
              for (let j = k; j <= nn; j += 1) {
                p = (h[k]![j] ?? 0) + q * (h[k + 1]![j] ?? 0);
                if (k !== nn - 1) {
                  p += r * (h[k + 2]![j] ?? 0);
                  h[k + 2]![j] = (h[k + 2]![j] ?? 0) - p * z;
                }
                h[k + 1]![j] = (h[k + 1]![j] ?? 0) - p * y;
                h[k]![j] = (h[k]![j] ?? 0) - p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              // Column transformation.
              for (let i = l; i <= mmin; i += 1) {
                p = x * (h[i]![k] ?? 0) + y * (h[i]![k + 1] ?? 0);
                if (k !== nn - 1) {
                  p += z * (h[i]![k + 2] ?? 0);
                  h[i]![k + 2] = (h[i]![k + 2] ?? 0) - p * r;
                }
                h[i]![k + 1] = (h[i]![k + 1] ?? 0) - p * q;
                h[i]![k] = (h[i]![k] ?? 0) - p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return eig;
}

/**
 * Complex eigenvalues of an arbitrary dense real matrix (array of rows), via
 * balance → Hessenberg → Francis QR. Pass `{ balance: false }` to skip balancing
 * (useful when a matrix is already well-scaled and exact reproducibility of the
 * un-balanced path is wanted). Returns n eigenvalues.
 */
export function eigenvaluesGeneral(
  matrix: readonly (readonly number[])[],
  options: { balance?: boolean; maxIterationsPerRoot?: number } = {}
): Complex[] {
  assertSquare(matrix, 'eigenvaluesGeneral');
  const balanced = options.balance === false ? cloneMatrix(matrix) : balanceMatrix(matrix);
  const hess = hessenbergReduce(balanced);
  return francisEigenvalues(hess, options.maxIterationsPerRoot ?? 100);
}
