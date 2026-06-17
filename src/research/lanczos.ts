/**
 * **Restarted Lanczos** — a few extremal eigenpairs of a *large* symmetric
 * linear operator accessed only through a matrix–vector product `apply(x)=Ax`,
 * with no dense matrix ever formed. This is the symmetric specialisation of a
 * restarted Arnoldi method (for a symmetric A the Arnoldi/Hessenberg reduction
 * collapses to the Lanczos tridiagonal), and it is the matrix-free scale-up path
 * for the project's dense symmetric solvers: where `jacobiEigenSymmetric`
 * (`research/svd`) diagonalises a small dense matrix in full, this returns just
 * the wanted few eigenpairs of an operator far too large to store — e.g. the
 * acoustic/optical band edges of a big coupled-pendulum / Frenkel–Kontorova
 * lattice (`physics/pendulumNetwork`), whose coupling matrix is symmetric.
 *
 * Algorithm: an m-step Lanczos factorisation A V_m = V_m T_m + β_m v_{m+1} e_mᵀ
 * with **full reorthogonalisation** (so the basis stays orthonormal to round-off
 * — the classic Lanczos loss-of-orthogonality failure mode is avoided) builds a
 * symmetric tridiagonal T_m. Its eigenpairs (θ_i, s_i) come from the trusted
 * dense symmetric solver, the Ritz vectors are x_i = V_m s_i, and each Ritz
 * residual is known *exactly* without another mat–vec from the Lanczos identity
 * ‖A x_i − θ_i x_i‖ = β_m·|e_mᵀ s_i|. When the wanted residuals exceed the
 * tolerance the method **explicitly restarts** from the normalised sum of the
 * wanted Ritz vectors (a polynomial filter toward the wanted invariant
 * subspace), repeating until they converge. Deterministic: the start vector is a
 * fixed pattern, so a given problem yields the same spectrum every run.
 *
 * Self-validation: the eigenvalues match the dense Jacobi solver on small
 * symmetric matrices and the closed-form spectrum 2 − 2cos(kπ/(n+1)) of the 1-D
 * discrete Laplacian, and the returned eigenvectors satisfy Ax = θx to the
 * tolerance. Scope: symmetric (self-adjoint) operators with real spectra; a
 * non-symmetric Arnoldi–Schur restart (building on the complex Krylov projection
 * in `research/unitaryFloquet`) is the documented next step.
 */
import { jacobiEigenSymmetric } from './svd';

export type SymmetricOperator = (vector: readonly number[]) => number[];

/** Which end of the spectrum to target. */
export type SpectralTarget = 'LA' | 'SA' | 'LM';

export interface LanczosOptions {
  /** Operator dimension n (≥ 1). */
  dimension: number;
  /** Number of wanted eigenpairs k (≥ 1). Default 4. */
  numEigenvalues?: number;
  /** Largest-algebraic 'LA', smallest-algebraic 'SA', or largest-magnitude 'LM'. Default 'LA'. */
  which?: SpectralTarget;
  /** Krylov subspace size m per restart. Default min(n, max(2k+20, 30)). */
  krylovDim?: number;
  /** Maximum explicit restarts. Default 100. */
  maxRestarts?: number;
  /** Residual tolerance ‖Ax − θx‖. Default 1e-9. */
  tolerance?: number;
  /** Start vector (length n). Default a fixed deterministic pattern. */
  seed?: readonly number[];
}

export interface LanczosEigenpair {
  /** Ritz value θ_i (eigenvalue estimate). */
  value: number;
  /** Ritz vector x_i (unit norm), length n. */
  vector: number[];
  /** Exact Lanczos residual ‖A x_i − θ_i x_i‖ = β_m·|e_mᵀ s_i|. */
  residual: number;
}

export interface LanczosResult {
  /** The k wanted eigenpairs, ordered per `which`. */
  eigenpairs: LanczosEigenpair[];
  /** True iff every wanted residual is below the tolerance. */
  converged: boolean;
  /** Explicit restarts performed. */
  restarts: number;
  /** Total operator applications (mat–vec products) used. */
  matVecs: number;
}

function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(a: readonly number[]): number {
  return Math.sqrt(dot(a, a));
}

function defaultSeed(n: number): number[] {
  // A varied deterministic pattern with broad eigenvector overlap (a constant
  // vector would be orthogonal to antisymmetric modes and stall on them).
  const v = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) v[i] = Math.sin(0.7 * i + 1) + 0.3 * Math.cos(0.31 * i);
  return v;
}

function orderKey(value: number, which: SpectralTarget): number {
  if (which === 'LA') return -value; // ascending sort → largest first
  if (which === 'SA') return value;
  return -Math.abs(value); // 'LM'
}

/** Project `w` off the span of the orthonormal `basis` (two MGS passes) and
 * normalise; returns null if `w` collapses into the existing span. */
function orthonormalize(w: number[], basis: readonly number[][]): number[] | null {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const b of basis) {
      const c = dot(b, w);
      for (let i = 0; i < w.length; i += 1) w[i] = (w[i] ?? 0) - c * (b[i] ?? 0);
    }
  }
  const nw = norm(w);
  if (!(nw > 1e-12)) return null;
  return w.map((x) => x / nw);
}

/**
 * Compute a few extremal eigenpairs of a symmetric matrix-free operator by
 * **thick-restart** Lanczos: each cycle locks the wanted Ritz vectors, extends
 * the Krylov subspace from the unconverged residual, and applies Rayleigh–Ritz
 * to the explicit projected matrix M = VᵀAV (V fully reorthonormalised). Locking
 * retains the wanted invariant subspace across restarts, so clustered eigenvalues
 * — the band edges of a large lattice, for instance — still converge.
 */
export function restartedLanczos(apply: SymmetricOperator, options: LanczosOptions): LanczosResult {
  const n = Math.trunc(options.dimension);
  if (!(n >= 1)) throw new Error('restartedLanczos: dimension must be a positive integer.');
  const k = Math.max(1, Math.trunc(options.numEigenvalues ?? 4));
  if (k > n) throw new Error('restartedLanczos: numEigenvalues cannot exceed dimension.');
  const which = options.which ?? 'LA';
  const m = Math.max(k + 1, Math.min(n, Math.trunc(options.krylovDim ?? Math.max(2 * k + 20, 30))));
  const maxRestarts = Math.max(1, Math.trunc(options.maxRestarts ?? 100));
  const tol = options.tolerance ?? 1e-9;

  let seed = options.seed ? Array.from(options.seed) : defaultSeed(n);
  if (seed.length !== n) throw new Error('restartedLanczos: seed length must equal dimension.');
  if (!(norm(seed) > 0)) seed = defaultSeed(n);

  const matVec = (x: readonly number[]): number[] => {
    const y = apply(x);
    if (y.length !== n) throw new Error('restartedLanczos: operator returned wrong-length vector.');
    return y;
  };

  let matVecs = 0;
  let locked: number[][] = []; // orthonormal wanted Ritz vectors carried across restarts
  let best: LanczosEigenpair[] = [];
  let converged = false;
  let restart = 0;

  for (; restart < maxRestarts; restart += 1) {
    // --- assemble the orthonormal basis: locked vectors + a fresh Krylov tail
    const basis: number[][] = locked.map((v) => v.slice());
    const first = orthonormalize(seed.slice(), basis) ?? orthonormalize(defaultSeed(n), basis);
    if (!first) break; // the locked subspace already spans everything reachable
    basis.push(first);
    while (basis.length < m) {
      const w = matVec(basis[basis.length - 1]!);
      matVecs += 1;
      const next = orthonormalize(w, basis);
      if (!next) break; // invariant subspace reached
      basis.push(next);
    }

    // --- Rayleigh–Ritz: explicit projected matrix M = VᵀAV ---------------
    const size = basis.length;
    const aBasis: number[][] = [];
    for (let j = 0; j < size; j += 1) {
      aBasis.push(matVec(basis[j]!));
      matVecs += 1;
    }
    const mMatrix = new Array<number>(size * size).fill(0);
    for (let i = 0; i < size; i += 1) {
      for (let j = i; j < size; j += 1) {
        const value = dot(basis[i]!, aBasis[j]!);
        mMatrix[i * size + j] = value;
        mMatrix[j * size + i] = value;
      }
    }
    const { values, vectors } = jacobiEigenSymmetric(mMatrix, size);

    const order = Array.from({ length: size }, (_, col) => col).sort(
      (a, b) => orderKey(values[a] ?? 0, which) - orderKey(values[b] ?? 0, which)
    );
    const wantCount = Math.min(k, size);

    // Materialise wanted Ritz pairs and their exact residuals A x − θ x.
    const pairs: LanczosEigenpair[] = [];
    const nextLocked: number[][] = [];
    let worstResidualVec: number[] | null = null;
    let worstResidual = -1;
    for (let w = 0; w < wantCount; w += 1) {
      const col = order[w]!;
      const theta = values[col] ?? 0;
      const x = new Array<number>(n).fill(0);
      const ax = new Array<number>(n).fill(0);
      for (let j = 0; j < size; j += 1) {
        const s = vectors[j * size + col] ?? 0;
        const bj = basis[j]!;
        const abj = aBasis[j]!;
        for (let i = 0; i < n; i += 1) {
          x[i] = (x[i] ?? 0) + s * (bj[i] ?? 0);
          ax[i] = (ax[i] ?? 0) + s * (abj[i] ?? 0);
        }
      }
      const resVec = new Array<number>(n).fill(0);
      for (let i = 0; i < n; i += 1) resVec[i] = (ax[i] ?? 0) - theta * (x[i] ?? 0);
      const residual = norm(resVec);
      pairs.push({ value: theta, vector: x, residual });
      nextLocked.push(x);
      if (residual > worstResidual) {
        worstResidual = residual;
        worstResidualVec = resVec;
      }
    }
    best = pairs;
    converged = pairs.every((p) => p.residual <= tol);
    if (converged || size < m || !worstResidualVec) break;

    // --- thick restart: lock the wanted vectors, grow from the residual --
    locked = nextLocked;
    seed = worstResidualVec;
  }

  return { eigenpairs: best, converged, restarts: restart + 1, matVecs };
}
