# Why a Pendulum Lab? — Mapping to Semiconductor Device Simulation

This project is a chaotic-pendulum laboratory on the surface, but the engineering
problems it solves are the same ones that decide whether a TCAD / device-physics
simulation can be trusted. This page maps each capability onto its device-simulation
counterpart, so the connection is explicit rather than implied.

## The core thesis

A device simulator and a chaos laboratory live or die by the same question:
**how do you know the number the solver printed is physics and not artifact?**
Every validation gate in this project is a small, fully-worked instance of a
discipline that TCAD work demands at much larger scale.

## The mapping

| This project | Device-simulation counterpart |
|---|---|
| **Measured convergence order** — every integrator's order is verified by Richardson self-convergence (`empiricalOrder`), not assumed from the textbook | **Mesh/grid convergence studies** — refining the mesh and verifying the solution converges at the discretization's theoretical order; the standard way to separate physics from discretization error in drift-diffusion / hydrodynamic solvers |
| **Energy-drift accounting** per integrator, with symplectic methods labelled honestly (true symplecticity only in canonical coordinates, γ = 0) | **Conservation-law audits** — current continuity and charge conservation residuals; knowing which scheme conserves what *by construction* vs only approximately |
| **Analytic Jacobians** (`jacobianDouble`, exact closed form) replacing finite differences, removing a ~1e-7 error floor from every tangent-space quantity | **Analytic Jacobians in Newton solvers** — TCAD Newton iterations on the coupled Poisson/continuity system converge robustly only with consistent, exact Jacobians; FD Jacobians produce exactly this kind of hidden error floor |
| **Stiff integrators** (TR-BDF2, implicit midpoint with residual reporting) alongside explicit ones, selected per problem | **Stiff PDE time-stepping** — TR-BDF2 is literally *the* classic device-simulation time integrator (it was invented for power-device transients); knowing when explicit methods fail is daily TCAD reality |
| **Newton on the stroboscopic map + Floquet stability + continuation with branch switching** (`drivenPeriodicOrbit`, `continueArclength`, `switchPeriodDoubling`) | **Steady-state and small-signal analysis** — periodic steady state of driven devices (RF, power converters), pole/stability analysis, and tracing I–V branches through turning points (snapback, latch-up, NDR regions need pseudo-arclength exactly as folds do here) |
| **Predictability horizon from a 31-digit double-double reference** — float64 round-off grows from 1e-14 to decorrelation by t ≈ 20 s, measured not estimated | **Round-off and conditioning budgets** — ill-conditioned mass-matrix solves and near-degenerate meshes amplify machine epsilon the same way; knowing the *horizon* of validity is what separates a result from a plot |
| **External cross-validation against an independently derived SciPy reference** (different language, derivation, integrator family; agreement at the tolerance floor × e^{λt}) | **Simulator-to-simulator benchmarking** — validating an in-house solver against Sentaurus/Silvaco/COMSOL on shared structures before trusting it on new ones; the gold standard of credibility |
| **Uncertainty quantification on every Lyapunov estimate** (batched-means SE that respects autocorrelation, not naive SE) | **Error bars on extracted parameters** — mobility, Vth, leakage extracted from noisy simulated/measured curves need autocorrelation-aware statistics, or the error bars lie |
| **Parameter-study batch queue** (grid/random/symmetric plans, per-point diagnostics, reproducible export) | **Design-of-experiments / corner sweeps** — process-corner and parameter-sensitivity sweeps over device geometry and doping, with provenance for every point |
| **Reproducibility manifests** — hash-stamped run snapshots that re-verify to the bit | **Simulation provenance** — knowing exactly which deck, mesh, model flags and solver tolerances produced a curve; required for any qualification flow |
| **Worker architecture with a transparent main-thread fallback**, one pure job handler shared by UI, worker, CLI and tests | **HPC job orchestration** — the same solve must produce the same answer on a laptop and on the cluster; one code path, many execution contexts |
| **Honest claim boundaries** — "Wada *candidate*", "finite-time estimate", "sufficient (not necessary) fractality condition" documented per result | **Model validity ranges** — every TCAD model card has a domain of validity; over-claiming beyond calibration is the cardinal sin of device modelling |

## Why nonlinear dynamics specifically

Semiconductor devices are themselves nonlinear dynamical systems. Negative
differential resistance, thermal runaway, latch-up, and oscillator circuits are
bifurcation phenomena; the period-doubling cascade traced in this project
(A_PD ≈ 1.066 for the driven pendulum, located by Floquet multipliers crossing −1
and confirmed by switching onto the period-2 branch) is the same mathematics used
to analyse instability onset in power devices and the periodic steady state of
RF circuits. Learning it on a system small enough to *fully* validate — where an
independent reference, an extended-precision ground truth, and closed-form
normal modes all exist — builds the judgment to apply it where no ground truth
is available.

## Summary

The pendulum is the smallest system that exhibits every hard numerical problem a
device simulator faces: stiffness, conservation, chaos-amplified error, stability
analysis, continuation through folds, and the need for independent validation.
This project treats each of those problems at research grade. The domain
knowledge of semiconductor physics is learnable; the validation discipline is
what this portfolio demonstrates.
