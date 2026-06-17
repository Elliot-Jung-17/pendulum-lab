# Roadmap

## Legacy-To-Modern Migration — COMPLETE (v10.22)

The migration is finished: the legacy `js/` runtime (≈8,080 lines) is removed and archived, and the app is 100% TypeScript under `src/`. The legacy-risk audit is **0** (from a 482 baseline). All rendering, simulation, analysis, and shell duties run on the modern stack; 173 unit tests + 13 chromium e2e pass with no legacy runtime present. History of the staged migration is below for reference.

## Stabilize Legacy-To-Modern Migration (history)

- **Done (v10.12):** unified the runtime behind the `PendulumRuntime` DI container; collapsed the five legacy globals into one adopted namespace with read-only accessors; removed dynamic `<script>` injection. The `globalRuntimeExports` and `dynamicScript` legacy-risk metrics are now `0`.
- **Done (v10.15, Stage 2 complete):** the modern Lab (`src/app/`) is the **default** lab tab — sim loop + all five side plots + presets, ensemble, visual FX, drag-to-set, export (CSV/JSON/PNG), and replay/scrubber. `?lab=legacy` is the escape hatch. 157 unit tests + 6 chromium e2e. Audio sonification and interpolated render remain legacy-only.
- **Done (v10.19, Stage 3 tab-ports):** every lab/analysis tab now runs on `src/` — Lab (default) + Lyapunov, Validation, Sweep, Compare, Bifurcation, 3D phase, and density, each gated by unit + e2e coverage and the `?lab=legacy` escape hatch.
- **In progress (v10.21, Stage 4):** a modern shell + modules are retiring the legacy runtime's responsibilities. Done: **tab navigation** (`Shell.ts`) and **audio sonification** (`AudioSonifier.ts`). Remaining shell duties before `js/` can be archived: slider value displays, presets slider-setting, keyboard shortcuts, header/diagnostics chrome, `CanvasMgr` (canvas sizing), `NaNGuard`, the dev-hub flyout; plus the `?lab=legacy` escape-hatch decision and the smoke test's `window.App` dependency. (Interpolated render is cosmetic and can be dropped.) Then delete `js/01`–`js/11`.
- Continue shrinking `js/01-core-app.js` into focused `src/runtime`, `src/ui`, `src/render`, and `src/export` modules.
- Historical note: the legacy-risk audit once centered on `innerHTML` and dynamic script usage; the current audit target is to keep the score at 0 as new UI surfaces are added.
- Move long-running sweep, bifurcation, FFT, and Lyapunov jobs to typed worker messages.

## Numerical Research Upgrades

- Replace finite-difference Hamiltonian gradients with analytic gradients.
- Add full Newton solve for implicit midpoint with Jacobian diagnostics.
- Store long-horizon energy drift curves by integrator.
- Extend Lyapunov output from convergence curves and CPU full-spectrum/CLV reports to broader GPU acceleration.
- Add selectable Poincare section conditions and transient removal for bifurcation analysis.
- **Done (v10.34):** Floquet multipliers are implemented for corrected nonlinear
  periodic orbits, `floquetLinearSpectrum` covers linear T-periodic Floquet/Hill
  systems including Mathieu stability tongues, and finite-dimensional quantum
  Floquet quasi-energies are exposed for the quantum kicked rotor.
- **Done (frontier arc):** five additive self-validating library modules — the
  continuum **sine-Gordon** soliton field + Frenkel–Kontorova Peierls–Nabarro
  barrier (`src/physics/sineGordon.ts`), an **echo state network**
  (`src/research/reservoir.ts`, closed-form ridge readout — the deferred Tier-A
  reservoir item), **Hamiltonian learning** (`src/research/hamiltonianLearning.ts`,
  the closed-form convex cousin of an HNN), **restarted thick-restart Lanczos**
  (`src/research/lanczos.ts`, matrix-free symmetric eigensolver scale-up), and a
  headless **Mathieu stability-diagram** sweep (`src/chaos/mathieuStability.ts`).
  Suite 875 → 907.
- **Remaining spectral frontier:** sparse/large *non-symmetric* (Arnoldi–Schur)
  eigensolvers building on the complex Krylov projection — the restarted Lanczos
  above covers the symmetric case; the unitary-grid scale-up for bigger quantum
  Floquet problems is the next step.
- **Deferred (needs resources this environment can't exercise, kept honest):**
  GPU-execution *validation* of the WebGPU ensemble/field kernels (the kernels +
  feature detection + CPU fallback are in `src/runtime/gpuEnsemble.ts` /
  `gpuFields.ts` and the fallback path is unit-tested; a real GPU run is browser/CI
  only); Hamiltonian/Lagrangian *neural* nets and reservoir variants that require
  iterative gradient training (the closed-form analogues above are shipped instead).

## Performance And UX

- Decouple canvas rendering cadence from physics stepping cadence.
- Add trajectory and Poincare memory caps to user-facing settings.
- Add paper figure export presets and reproducible research bundle export.
- Evaluate OffscreenCanvas and WebGPU ensemble simulation behind feature detection.
- **Done (v10.34):** quick/slow/full unit-test tiers are exposed and wired into
  PR/mainline CI; benchmark output now includes original-vs-candidate deltas,
  and `benchmark:memory` emits a memory-regression baseline/report from the
  browser benchmark.
- Keep expanding cross-platform visual baselines beyond the current Chromium
  snapshots, and decide when memory regression should become a hard CI failure
  instead of a report-only gate.
  - **Decision (recorded):** the Firefox/WebKit/mobile-Chrome Playwright projects
    already exist in `playwright.config.ts`; cross-platform *baselines* must be
    generated on the actual Linux/macOS/Windows runners (snapshots are
    pixel-host-specific), so baseline promotion stays a CI task. The memory-
    regression hard gate (`MEMORY_FAIL_ON_REGRESSION=1`) should flip on only
    **after** a stable `reports/memory-baseline.json` is committed from a Chromium
    CI run — flipping it before a baseline exists makes the gate throw
    "metric missing", so it remains report-only until that baseline lands.

## Architecture - Module Splits

- **Done:** `expandedModels.ts` is now a facade. Its former responsibilities are split into
  `expandedModels-types.ts`, `expandedModels-factory.ts`, `expandedModels-runners.ts`,
  `expandedModels-lyapunov.ts`, and `expandedModels-research.ts`. The largest split file is
  below the default module-size cap, and `src/physics/expandedModels.ts` has left the known-large
  ratchet list. `tests/expanded-models.test.ts` and
  `tests/expansion-lyapunov-injection.test.ts` cover preserved behavior and profiler injection.

- **`research-workbench.ts`**: UI-component helpers extracted to `research-ui-components.ts`;
  analysis superpack extracted to `superpack-panels.ts`. **Render coupling unblocked:**
  `logResearchRun` now persists run-log state and emits
  `pendulum-lab:research-workbench-changed`; the Research tab installs a render bridge for that
  event. Remaining extraction candidates: run-log renderer (`renderResearchRunLog`, ~80 lines),
  comparison matrix builder, design-study state, and batch-runner orchestration.
  The split boundary is now documented in `docs/architecture.md` so the next
  extraction keeps state/storage code in `src/app/parity/storage-sync.ts` and
  pure research helpers in `src/research`.
  - **Deferred deliberately:** the remaining `research-workbench.ts` extractions
    (run-log renderer, comparison matrix, design-study state, batch runner) are
    UI-orchestration code with **no unit-test coverage** — they are verified only by
    the Playwright e2e suite (visual/interaction parity), which can't be exercised
    headlessly here. A pure extraction without a unit safety net risks a silent UI
    regression, so per the project's verify-first rule it waits until either unit
    coverage exists for those renderers or the extraction is done alongside an e2e
    run. The file stays within its 2200-line ratchet in the meantime.

## Portfolio Packaging

- Keep benchmark, validation, architecture, and limitation reports current for each release.
- Add a one-page PDF summary and short GIF capture after the UI is finalized.
- **Done:** npm package metadata (`keywords`, `license`, `author`, `repository`,
  `homepage`, `bugs`) is filled in and the headless core is bundled by `build:lib`
  with `exports`/`types`/`files` set, so the package is **publish-ready**. The repo
  is kept `private: true` on purpose: the final publish is an irreversible,
  outward-facing decision (package name/scope — `pendulum-lab-v10` vs a scoped
  name — version line `10.34.0` vs a `1.0.0` library reset, and npm credentials) that
  is the author's to make. To publish: set `"private": false`, pick the name/version,
  then `npm run build:lib && npm publish --access public`.
- Add GitHub Pages deployment and full English API documentation (TypeDoc is wired via
  `npm run docs:api`).
