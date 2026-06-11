# Releasing & Publishing

## GitHub push + Pages

The repository ships two workflows under `.github/workflows/`:

- `ci.yml` — lint, typecheck, unit tests, audits, build, Playwright E2E,
  Python cross-validation, plus `npm run notebook:validate` and the long-run
  performance spec (part of `npm run test:e2e`).
- `pages.yml` — builds `dist/` and deploys it to GitHub Pages on every push to
  `main`/`master`.

To publish from this machine:

```bash
git remote add origin https://github.com/<you>/pendulum-lab.git
git push -u origin master
```

Pages must be enabled once in the repository settings (Build and deployment →
GitHub Actions). After that every push deploys automatically.

## Zenodo DOI

1. Log in to Zenodo with GitHub and enable the repository in
   <https://zenodo.org/account/settings/github/>.
2. `.zenodo.json` (repo root) supplies the deposit metadata; `CITATION.cff`
   gives the citation text shown by GitHub.
3. Create a GitHub release (`git tag v10.29.0 && git push --tags`, then draft
   the release). Zenodo archives the release and mints a DOI.
4. Paste the minted DOI back into `CITATION.cff` (`doi:` field) and into the
   Research Workbench experiment citations where relevant.

## npm library

`npm run build:lib` emits `dist-lib/pendulum-lab-core.js` (ESM) plus type
declarations under `dist-lib/types/`. `npm run docs:api` generates TypeDoc API
documentation in `docs/api/`. To publish the core as a package, copy
`dist-lib/` into a `pendulum-lab-core` package directory with its own
`package.json` (`"main": "pendulum-lab-core.js"`, `"types": "types/lib.d.ts"`)
and `npm publish` from there.

## External Julia reference

`npm run validate:julia` regenerates `reports/julia-vern9-reference.json` via
`scripts/julia_reference.jl` (requires Julia + OrdinaryDiffEq + JSON) and
compares the TypeScript GBS integrator against the Vern9 solution. Without
Julia the step reports SKIPPED and exits 0, so CI stays green on plain runners.
