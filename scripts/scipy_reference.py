"""Independent double-pendulum reference for cross-validation.

The equations of motion are re-derived here from the Lagrangian (standard
point-mass double pendulum) rather than ported from the TypeScript engine, and
the integration uses SciPy's DOP853 with tight tolerances — a genuinely
independent code path (different language, different derivation, different
integrator family). Reads a JSON job from stdin, writes JSON samples to stdout.

Job: { "m1": .., "m2": .., "l1": .., "l2": .., "g": ..,
       "state0": [th1, th2, w1, w2], "tEnd": .., "sampleEvery": .. }
"""
import json
import sys

import numpy as np
from scipy.integrate import solve_ivp


def main() -> None:
    job = json.load(sys.stdin)
    m1, m2 = job["m1"], job["m2"]
    l1, l2 = job["l1"], job["l2"]
    g = job["g"]

    def rhs(_t, y):
        th1, th2, w1, w2 = y
        d = th1 - th2
        cd, sd = np.cos(d), np.sin(d)
        den = m1 + m2 * sd * sd
        # Lagrangian equations of motion (point masses, massless rods, no damping).
        a1 = (
            -m2 * l1 * w1 * w1 * sd * cd
            - m2 * l2 * w2 * w2 * sd
            - (m1 + m2) * g * np.sin(th1)
            + m2 * g * np.sin(th2) * cd
        ) / (l1 * den)
        a2 = (
            (m1 + m2) * l1 * w1 * w1 * sd
            + (m1 + m2) * g * np.sin(th1) * cd
            - (m1 + m2) * g * np.sin(th2)
            + m2 * l2 * w2 * w2 * sd * cd
        ) / (l2 * den)
        return [w1, w2, a1, a2]

    def energy(y):
        th1, th2, w1, w2 = y
        v1 = l1 * w1
        kinetic = 0.5 * m1 * v1 * v1 + 0.5 * m2 * (
            v1 * v1 + (l2 * w2) ** 2 + 2 * l1 * l2 * w1 * w2 * np.cos(th1 - th2)
        )
        potential = -(m1 + m2) * g * l1 * np.cos(th1) - m2 * g * l2 * np.cos(th2)
        return kinetic + potential

    t_end = job["tEnd"]
    times = np.arange(0.0, t_end + 1e-12, job["sampleEvery"])
    sol = solve_ivp(
        rhs,
        (0.0, t_end),
        job["state0"],
        method="DOP853",
        t_eval=times,
        rtol=1e-13,
        atol=1e-13,
        max_step=0.01,
    )
    if not sol.success:
        raise SystemExit(f"solve_ivp failed: {sol.message}")

    e0 = energy(np.asarray(job["state0"], dtype=float))
    samples = [
        {"t": float(t), "state": [float(v) for v in sol.y[:, k]]}
        for k, t in enumerate(sol.t)
    ]
    json.dump(
        {
            "method": "scipy.solve_ivp DOP853 rtol=atol=1e-13",
            "scipyEnergyDrift": float(abs(energy(sol.y[:, -1]) - e0)),
            "samples": samples,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
