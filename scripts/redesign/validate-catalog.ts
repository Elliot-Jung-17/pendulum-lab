/** Build gate: declarative shape + frozen inventory coverage + actual source exports, without engine execution. */
import { readFileSync } from 'node:fs';
import { catalog, allDefinitions } from '../../src/product/catalog';
import { validateBaselineCoverage, type CatalogBaseline } from './catalog-coverage';
import { validateCatalogSources } from './validate-catalog-sources';
import { validateSourceScopes } from './catalog-source-scopes';

const baseline = JSON.parse(readFileSync('documents/redesign/baseline/inventory.json', 'utf8')) as CatalogBaseline;
const errors = [
  ...validateBaselineCoverage(catalog, baseline),
  ...validateSourceScopes(catalog),
  ...validateCatalogSources(process.cwd(), catalog)
];
if (errors.length) {
  console.error(`catalog check FAILED:\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `catalog check ok: ${allDefinitions(catalog).length} definitions; ${catalog.systems.length} systems, ${catalog.analyses.length} analyses, ${catalog.integrators.length} integrators, ${catalog.auxiliary.length} auxiliary; bidirectional baseline coverage and source exports verified`
  );
}
