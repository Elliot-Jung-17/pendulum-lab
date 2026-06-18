# Release Packaging Checklist

This file is the publication wrapper around the reviewer kit. The code can
generate the scientific artifacts; external release steps still need maintainer
credentials or a release decision.

## Ten-Minute Reviewer Path

```bash
npm install
npm run reproduce
npm run flagship:certify
npm run flagship:external
npm run validate:gpu-scale
npm run validate:webgpu-hardware
npm run benchmark:gpu-ladder
npm run release:package
npm run reviewer:kit
```

Required outputs:

- `reports/reproduce/manifest.json`
- `reports/flagship-certification.json`
- `reports/flagship-figure1.svg`
- `reports/flagship-external-check.json`
- `reports/gpu-scale-validation.md`
- `reports/webgpu-hardware-validation.md`
- `reports/gpu-benchmark-ladder.md`
- `reports/release-readiness.md`
- `reports/release-one-page.pdf`
- `reports/walkthrough-30s.gif`
- `reports/reviewer-kit-manifest.md`

## Release Bundle

- Generated locally by `npm run release:package`: one-page PDF summary,
  30-second walkthrough GIF, SVG storyboard, and release-readiness manifest.
- Wired for owner-authenticated release: GitHub release archive with the exact
  commit SHA, Zenodo DOI linked to that release, GitHub Pages build serving
  `paper/index.html` plus docs/reviewer reports, and npm package release for
  the headless `core` / `analysis` / `research` / `experimental` API groups.

## Promotion Gates

- `npm run verify`
- `npm run flagship:certify`
- `npm run flagship:external`
- `npm run validate:gpu-scale`
- `npm run validate:webgpu-hardware`
- `npm run benchmark:gpu-ladder`
- `npm run benchmark:memory`
- `npm run release:package`
- `npm run reviewer:kit`
- `npm run audit:worldclass`

The release is not research-grade until the generated reports are committed or
attached to the release, and the DOI/Pages/npm targets point at the same commit.
