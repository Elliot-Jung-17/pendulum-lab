# Reviewer Kit

The reviewer kit is the shortest path from a clean clone to the flagship
result. It bundles the study JSON, rendered paper, deterministic manifest,
external validation reports, GPU/scale contract, and notebook hooks into one
checklist.

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
npm run reviewer:kit
```

This confirms the deterministic library backbone and tells the reviewer which
paper/browser/external artifacts are already present.

## Full Review Path

```bash
npm run paper:study
npm run paper:build
npm run validate:cross
npm run validate:sympy
npm run validate:literature
npm run validate:gpu-scale
npm run notebook
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
```

It runs the mocked-WebGPU contract tests and writes
`reports/gpu-scale-validation.md`. Real hardware WebGPU remains an environment
capability: when available, the same Trust Inspector caveats and CPU reference
rules apply.
