# Long-Term Energy Benchmark

Generated: 2026-06-09T07:08:47.111Z

Conservative double pendulum, IC = [1.2, -0.6, 0, 0], dt = 0.002, steps = 100000 (T = 200 s).

Relative energy drift |ΔE / E₀|. Lower is better for conservation; note that
TR-BDF2 is L-stable and intentionally dissipative, so its drift reflects
numerical damping rather than instability.

| Integrator | Order | Max rel. drift | Final rel. drift | Wall ms |
|---|---|---:|---:|---:|
| Gragg-Bulirsch-Stoer (`gbs`) | adaptive | 8.974e-13 | 3.710e-13 | 384 |
| Dormand-Prince 5(4) (`dopri5`) | 5 | 3.793e-10 | 3.815e-10 | 99 |
| Gauss-Legendre 4 (2-stage) (`gauss2`) | implicit | 9.344e-10 | 4.619e-10 | 119 |
| RKF45 Adaptive (`rkf45`) | adaptive | 8.293e-9 | 8.351e-9 | 76 |
| Runge-Kutta 4 (`rk4`) | 4 | 5.447e-8 | 5.435e-8 | 54 |
| Implicit Midpoint (`hmidpoint`) | implicit | 4.337e-5 | 1.306e-7 | 65 |
| TR-BDF2 (stiff, L-stable) (`bdf2`) | implicit | 6.551e-5 | 7.584e-7 | 255 |
| Midpoint RK2 (`rk2`) | 2 | 3.348e-4 | 2.645e-4 | 45 |
| Yoshida 4 Composition (`yoshida4`) | 4 | 5.391e-1 | 3.465e-1 | 207 |
| Leapfrog Approximation (`leapfrog`) | 2 | 5.448e-1 | 5.448e-1 | 53 |
| Semi-Implicit Euler (`symplectic`) | 1 | 5.778e-1 | 5.732e-1 | 44 |
| Explicit Euler (`euler`) | 1 | 9.922e+0 | 9.759e+0 | 43 |
