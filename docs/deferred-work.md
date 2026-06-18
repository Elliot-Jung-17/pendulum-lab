# Deferred work — what is intentionally *not* done here, and why

This project gates every change on `npm run verify` (lint → strict typecheck →
module-size audit → full test suite → docs sync) and only claims a feature done
once it is test-pinned. The items below are deliberately deferred because they
need a resource this environment cannot exercise, or a decision that is the
maintainer's to make. Deferring with a clear rationale is preferred over
shipping something unverified.

The expansion work that *was* completed (canonical oscillators, escape-rate and
phonon analysis, correlation/multifractal dimensions, UPO/OGY control, the
Newton-instrumented implicit midpoint) is documented in the CHANGELOG and is
fully covered by the headless test suite.

## Needs production GPU kernels

- **Production GPU CLV/full-spectrum/FTLE kernels.** The CPU f64 oracle,
  GPU-side ensemble reduction gate, and executable CLV/full-spectrum/FTLE
  acceleration contracts are implemented and reported by
  `npm run validate:gpu-scale`. What remains is a hardware candidate kernel for
  each high-dimensional diagnostic that passes those contracts before it can
  become a publication path.

## Needs an external toolchain or license

- **MATLAB / Julia pinning + promotion to required cross-validation gates.** The
  Julia cross-check (`npm run validate:julia`) exists as an opt-in reference. Making
  MATLAB/Julia comparisons *required* CI gates needs a pinned, reproducible toolchain
  (Julia project manifest, MATLAB license/runner) wired into the workflow — an
  infrastructure/licensing decision, not a code change verifiable here.

## Needs browser baselines or an e2e display

- **Visual-regression golden snapshots + local browser review.** Golden images are
  platform-dependent (font/AA/GPU rasterisation); baselines must be captured on the
  designated reference platform and reviewed by eye. Generating them in this
  environment would bake in machine-specific artifacts and produce flaky diffs.
- **Full Playwright e2e across all browsers.** Needs the browser binaries and a
  display/headful context; it is usage-limited here. The CI matrix is already
  configured for it — what remains is a full local cross-browser run.
- **UI exposures verifiable only by e2e.** These are interactive wirings whose
  correctness is a rendering/interaction fact, not a numerical one, so they belong
  with the browser-driven tests rather than the headless suite:
  - `EmbeddedSphericalChain` pole-free chart surfaced in the 3D-lab UI (the solver
    and its conservation guarantees are already unit-tested headlessly);
  - selectable Poincaré section conditions in the analysis UI;
  - energy-drift persistence + its UI panel;
  - adaptive-step history plot;
  - streaming sweep UI;
  - provenance-DAG SVG rendering.
  - General higher-dimensional Floquet spectrum is partly numerical (the monodromy
    machinery exists) but its *surfacing* is UI-bound; the headless spectrum can be
    added independently when prioritised.

## Needs an external account or a release decision

- **npm publish**, **GitHub Pages activation**, **Binder/Colab launch configs**, and
  **Zenodo DOI minting**. These require credentials and a "cut a release"
  decision that is the maintainer's to make. The publish workflow, Pages deploy,
  one-page PDF, walkthrough GIF/storyboard, and release-readiness manifest are
  generated or wired; what remains is pulling the external release trigger.

## Deferred on correctness-risk grounds

- **DOP853 (8th-order Dormand–Prince) integrator.** Its only advantage over the
  existing high-order adaptive options (GBS extrapolation, DoPri5) is matching
  SciPy's `solve_ivp` default for cross-validation, which requires the *exact*
  Hairer 8(5,3) Butcher tableau. Hand-transcribing a 12-stage tableau risks subtle
  coefficient errors that headless convergence tests would not catch against SciPy's
  internals — defeating the purpose. Best added in a focused session with the
  coefficients checked against Hairer's reference source.

## Long-running, not executed this session

- **Full `npm run mutation` (Stryker).** The mutation scope was extended in config
  (numerical core: `lyapunov`, `melnikov`, `rqa`, `ftle`); a full run is long and
  was not executed here. The new modules are designed to be mutation-friendly
  (closed-form assertions), and can be folded into the Stryker scope when a full
  run is scheduled.
