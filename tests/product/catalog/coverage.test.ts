import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../src/product/catalog';
import { validateBaselineCoverage, type CatalogBaseline } from '../../../scripts/redesign/catalog-coverage';

const baseline = JSON.parse(readFileSync('documents/redesign/baseline/inventory.json', 'utf8')) as CatalogBaseline;

describe('independent S01 to S02 coverage', () => {
  it('keeps the documented counts, local links and code fences consistent', () => {
    const path = 'documents/redesign/catalog-contract-ko.md';
    const document = readFileSync(path, 'utf8');
    for (const [label, count] of [
      ['시스템', catalog.systems.length],
      ['분석', catalog.analyses.length],
      ['적분기', catalog.integrators.length],
      ['보조 기능', catalog.auxiliary.length],
      ['합계', catalog.systems.length + catalog.analyses.length + catalog.integrators.length + catalog.auxiliary.length]
    ] as const)
      expect(document).toContain(`| ${label} | ${count} |`);
    expect((document.match(/^```/gm) ?? []).length % 2).toBe(0);
    for (const match of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      expect(existsSync(resolve(dirname(path), match[1]!)), match[1]).toBe(true);
    }
  });

  it('covers all 118 semantic capabilities and 16 registered methods in both directions', () => {
    expect(baseline.capabilities).toHaveLength(118);
    expect(baseline.facts.filter((item) => item.category === 'integrator')).toHaveLength(16);
    expect(validateBaselineCoverage(catalog, baseline)).toEqual([]);
  });

  it('fails on deleted, invented, duplicated and renamed registrations', () => {
    const missing = { ...catalog, systems: catalog.systems.slice(1) };
    expect(validateBaselineCoverage(missing, baseline).join('\n')).toMatch(/missing catalog registration/);
    const invented = {
      ...catalog,
      systems: [{ ...catalog.systems[0]!, baselineIds: ['system:invented'] }, ...catalog.systems.slice(1)]
    };
    expect(validateBaselineCoverage(invented, baseline).join('\n')).toMatch(/unknown baseline reference/);
    const duplicate = { ...catalog, systems: [...catalog.systems, catalog.systems[0]!] };
    expect(validateBaselineCoverage(duplicate, baseline).join('\n')).toMatch(/covered more than once/);
    const renamed = {
      ...catalog,
      systems: [{ ...catalog.systems[0]!, id: 'system:renamed' as const }, ...catalog.systems.slice(1)]
    };
    expect(validateBaselineCoverage(renamed, baseline).join('\n')).toMatch(/stable semantic id changed/);
  });

  it('rejects silently reassigned source owners and future integration stages', () => {
    const reassigned = {
      ...catalog,
      systems: [
        {
          ...catalog.systems[0]!,
          integrationStage: 30,
          legacyBindings: [{ module: 'src/physics/standardMap.ts', exportName: 'standardMapStep' }]
        },
        ...catalog.systems.slice(1)
      ]
    };
    expect(validateBaselineCoverage(reassigned, baseline).join('\n')).toMatch(/baseline owner not bound/);
    expect(validateBaselineCoverage(reassigned, baseline).join('\n')).toMatch(/integration stage changed/);
  });
});
