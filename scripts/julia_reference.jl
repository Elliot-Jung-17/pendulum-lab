# External high-order reference for the double pendulum using
# DifferentialEquations.jl Vern9 (9th-order Verner) at tight tolerances.
# Produces reports/julia-vern9-reference.json, which
# `npm run validate:julia` compares against the TypeScript integrators.
#
# Setup (once):  julia -e 'using Pkg; Pkg.add(["OrdinaryDiffEq","JSON"])'
# Run:           julia scripts/julia_reference.jl

using OrdinaryDiffEq
using JSON

const m1 = 1.0; const m2 = 1.0
const l1 = 1.2; const l2 = 1.0
const g  = 9.81

function double_pendulum!(du, u, p, t)
    th1, th2, w1, w2 = u
    d  = th1 - th2
    cd = cos(d); sd = sin(d)
    den = m1 + m2 * sd^2
    du[1] = w1
    du[2] = w2
    du[3] = (-m2 * l1 * w1^2 * sd * cd
             + m2 * g * sin(th2) * cd
             - m2 * l2 * w2^2 * sd
             - (m1 + m2) * g * sin(th1)) / (l1 * den)
    du[4] = ((m1 + m2) * (l1 * w1^2 * sd - g * sin(th2) + g * sin(th1) * cd)
             + m2 * l2 * w2^2 * sd * cd) / (l2 * den)
end

function energy(u)
    th1, th2, w1, w2 = u
    v1sq = (l1 * w1)^2
    v2sq = (l1 * w1)^2 + (l2 * w2)^2 + 2 * l1 * l2 * w1 * w2 * cos(th1 - th2)
    ke = 0.5 * m1 * v1sq + 0.5 * m2 * v2sq
    pe = -(m1 + m2) * g * l1 * cos(th1) - m2 * g * l2 * cos(th2)
    return ke + pe
end

# The app's "classic" benchmark state (matches scripts/cross-validate.ts).
u0 = [2.0, 2.5, 0.0, 0.0]
T  = 10.0

prob = ODEProblem(double_pendulum!, u0, (0.0, T))
sol  = solve(prob, Vern9(); abstol = 1e-13, reltol = 1e-13, saveat = 0.5)

samples = [Dict(
    "t"  => t,
    "state" => sol(t),
    "energy" => energy(sol(t))
) for t in 0.0:0.5:T]

out = Dict(
    "schemaVersion" => "pendulum-julia-vern9/v1",
    "solver" => "Vern9 (OrdinaryDiffEq.jl)",
    "abstol" => 1e-13,
    "reltol" => 1e-13,
    "params" => Dict("m1" => m1, "m2" => m2, "l1" => l1, "l2" => l2, "g" => g),
    "state0" => u0,
    "T" => T,
    "energyDrift" => abs(energy(sol(T)) - energy(u0)) / abs(energy(u0)),
    "samples" => samples
)

mkpath("reports")
open("reports/julia-vern9-reference.json", "w") do io
    JSON.print(io, out, 2)
end
println("wrote reports/julia-vern9-reference.json (energy drift $(out["energyDrift"]))")
