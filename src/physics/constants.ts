/**
 * Shared numerical thresholds and conventions for the physics core. Every
 * threshold that crosses a module boundary lives here so the singularity /
 * regularisation policy is consistent across systems and tunable in exactly
 * one place. Values are unchanged from the historical per-file constants;
 * this module only centralises them.
 */

/**
 * Mass-matrix determinant / pivot threshold below which a configuration is
 * treated as numerically singular. Used by the closed-form double / triple
 * solvers and as the default pivot tolerance of the shared linear solver.
 */
export const MASS_MATRIX_SINGULARITY_THRESHOLD = 1e-14;

/**
 * Pole-chart regularisation clamp for the single spherical pendulum:
 * |sinθ| entering the φ̈ cotangent term is clamped to at least this value.
 * The dynamics is smooth at the poles; only the (θ, φ) chart is singular.
 */
export const SPHERICAL_POLE_EPS = 1e-9;

/**
 * Pole-chart regularisation clamp for the spherical N-chain: the sinθ that
 * scales the azimuthal Jacobian column b_k is clamped to at least this value
 * so the mass matrix stays invertible near the poles. Deliberately looser
 * than the single-pendulum clamp because the clamped quantity enters the
 * 2N×2N mass-matrix solve (documented in user-facing caveats as 1e-6).
 */
export const SPHERICAL_CHAIN_POLE_EPS = 1e-6;

/**
 * Relative perturbation used by forward-difference Jacobians
 * (eps = FD_JACOBIAN_EPS · max(1, |y_j|)): the classic sqrt(machine-eps)
 * compromise between truncation and round-off error, giving a ~1e-7 floor.
 * Supply an analytic Jacobian (see `StepOptions.jacobian`) to remove it.
 */
export const FD_JACOBIAN_EPS = 1e-7;

/** Default Newton / fixed-point residual tolerance of the implicit steppers. */
export const IMPLICIT_SOLVE_TOLERANCE = 1e-10;

/**
 * How linear viscous damping enters a system's equations of motion. The two
 * conventions coincide for a single degree of freedom but differ for coupled
 * systems, so cross-system comparisons must check this first:
 *
 * - `force-level`: −γ·q̇_j is added to the generalised force *before* the
 *   mass-matrix solve (planar double / triple / N-chain). The effective
 *   acceleration damping is then M⁻¹ diag(γ), which couples coordinates.
 * - `rate-level`: q̈_j ← q̈_j − γ·q̇_j is applied *after* the mass-matrix
 *   solve (spherical pendulum & spherical chain), i.e. per-coordinate rate
 *   damping, which keeps the N = 1 spherical case in closed form.
 * - `none`: the system has no damping parameter (conservative by
 *   construction).
 */
export type DampingConvention = 'force-level' | 'rate-level' | 'none';
