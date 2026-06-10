# External Cross-Validation — TypeScript engine vs SciPy DOP853

Generated: 2026-06-10T06:44:04.172Z

The SciPy reference re-derives the double-pendulum equations of motion independently
(different language, different derivation, different integrator family) and integrates
with `solve_ivp` DOP853 at rtol = atol = 1e-13. The TypeScript engine integrates the
same initial conditions with its own `rhsDouble` via RK4 at dt = 2e-5.

| Case | Horizon | Max ‖Δ‖∞ | At end | Bound | Verdict | TS energy drift | SciPy energy drift |
|---|---:|---:|---:|---:|:--:|---:|---:|
| regular small-angle | 20 s | 4.12e-14 | 4.07e-14 | 1.00e-8 | PASS | 2.84e-14 | 7.11e-15 |
| chaotic | 10 s | 6.40e-11 | 6.40e-11 | 1.00e-5 | PASS | 3.48e-12 | 6.82e-12 |

For the chaotic case the divergence grows like e^{λ₁ t} (λ₁ ≈ 1.1 for this orbit) from
the shared tolerance floor, so agreement is only asserted on the predictability horizon;
the regular case must agree essentially to the tolerance floor over the full window.
