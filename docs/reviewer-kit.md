# Reviewer Kit

The reviewer kit is the shortest path from a clean clone to the flagship
result. It bundles the study JSON, rendered paper, deterministic manifest,
external validation reports, flagship certification, GPU/scale contract, memory
baseline, and notebook hooks into one checklist.

Generate the checklist:

```bash
npm run reviewer:kit
```

The command writes:

- `reports/reviewer-kit-manifest.json`
- `reports/reviewer-kit-manifest.md`

## Fast Review Path

```bash
npm install
npm run reproduce
npm run flagship:certify
npm run flagship:external
npm run validate:gpu-scale
npm run release:package
npm run reviewer:kit
```

This confirms the deterministic library backbone and tells the reviewer which
paper/browser/external artifacts are already present.

## Full Review Path

```bash
npm run paper:study
npm run flagship:certify
npm run flagship:external
npm run paper:build
npm run validate:cross
npm run validate:sympy
npm run validate:literature
npm run validate:gpu-scale
npm run notebook
npm run release:package
npm run reviewer:kit
```

The full path is intentionally heavier. It separates:

- deterministic library reproduction,
- browser-rendered figures and PDF,
- external SciPy/SymPy validation,
- GPU/scale acceptance contract,
- notebook artifact generation.

## GPU/Scale Rule

Acceleration is never treated as the oracle. The CPU f64 path is the reference.
WebGPU outputs are acceptable only when they pass their CPU probe contract; a
failed GPU validation must return the CPU result instead.

The current validation command is:

```bash
npm run validate:gpu-scale
npm run validate:webgpu-hardware
```

It writes `reports/gpu-scale-validation.md`. The report includes an f32-candidate
ensemble reduction comparison against the CPU f64 oracle, a hardware-GPU
reduction gate, and executable CLV/full-spectrum/FTLE acceleration promotion
checks. `npm run validate:webgpu-hardware` writes
`reports/webgpu-hardware-validation.md` when a Chrome/WebGPU-capable runner is
available, using the same CPU reference rules as the self-hosted CI workflow.

## Release Packaging

The external publication wrapper lives in `docs/release-packaging.md`. Run:

```bash
npm run release:package
```

It regenerates the one-page PDF, 30-second walkthrough GIF/storyboard, and
release-readiness report. Zenodo DOI minting, GitHub Pages activation, and npm
publication still need maintainer credentials and a release decision.
