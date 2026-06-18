# Release Readiness Manifest

Generated: 2026-06-18T17:08:15.236Z

Status: **ready-for-owner-publish**

| Required | Available | Artifact | Note |
|---:|---:|---|---|
| yes | yes | `.zenodo.json` | Zenodo metadata and authenticated deposition command are present. |
| yes | yes | `.github/workflows/pages.yml` | GitHub Pages deploy workflow is present. |
| yes | yes | `reviewer.html` | Pages reviewer console reads report JSON directly. |
| yes | yes | `.github/workflows/publish-npm.yml` | Manual npm workflow uses OIDC trusted publishing and automatic provenance. |
| yes | yes | `.github/workflows/release.yml` | Release workflow emits SLSA/in-toto provenance plus a CycloneDX SBOM attestation. |
| yes | yes | `paper/paper.pdf` | Flagship paper PDF exists. |
| yes | yes | `reports/reviewer-kit-manifest.json` | Reviewer kit manifest exists. |
| no | yes | `reports/webgpu-hardware-validation.md` | Real WebGPU adapter validation report exists when run on a hardware target. |
| yes | yes | `reports/gpu-benchmark-ladder.md` | Hardware GPU benchmark ladder records adapter metadata, f32/f64 drift, and CPU-oracle promotion metrics. |
| yes | yes | `reports/gpu-benchmark-ladder.json` | Machine-readable GPU benchmark ladder for release artifacts. |
| yes | yes | `reports/gpu-adapter-matrix.json` | Physical Intel/NVIDIA/AMD evidence matrix; missing hardware remains explicit. |
| yes | yes | `reports/publication-status.json` | Public registry, DOI, release, and Pages resolution audit. |
| yes | yes | `reports/npm-pack-dry-run.json` | Exact npm tarball integrity, size, and included-file inventory from a successful dry run. |
| yes | yes | `reports/release-one-page.pdf` | One-page reviewer PDF generated locally. |
| yes | yes | `reports/walkthrough-30s.gif` | Thirty-second GIF walkthrough generated locally. |
| no | yes | `reports/walkthrough-storyboard.svg` | Editable storyboard companion for the GIF. |

## Owner Publish Steps

- Deploy reviewer.html through GitHub Pages and verify reports/publication-status.json.
- Configure the npm trusted publisher for publish-npm.yml and environment npm, then dispatch dry-run=false.
- Run npm run zenodo:publish with ZENODO_TOKEN, then npm run doi:sync.
- Verify the GitHub SLSA/SBOM attestations with gh attestation verify.

