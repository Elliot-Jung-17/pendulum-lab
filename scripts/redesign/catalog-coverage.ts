import type { CapabilityCatalog } from '../../src/product/contracts/catalog';
import { allDefinitions } from '../../src/product/catalog/validation';

export interface BaselineCatalogItem {
  id: string;
  category: string;
  ownerFile: string;
  futureStage: number | null;
}
export interface CatalogBaseline {
  capabilities: readonly BaselineCatalogItem[];
  facts: readonly BaselineCatalogItem[];
}

/** Independent frozen S01 input: never generates product definitions from the inventory it tests. */
export function validateBaselineCoverage(catalog: CapabilityCatalog, baseline: CatalogBaseline): string[] {
  const errors: string[] = [];
  const expected = [...baseline.capabilities, ...baseline.facts.filter((item) => item.category === 'integrator')];
  const baselineById = new Map(expected.map((item) => [item.id, item]));
  if (baselineById.size !== expected.length) errors.push('baseline: duplicate capability id');
  const owners = new Map<string, string>();
  for (const definition of allDefinitions(catalog)) {
    for (const id of definition.baselineIds) {
      const item = baselineById.get(id);
      if (!item) {
        errors.push(`${definition.id}: unknown baseline reference ${id}`);
        continue;
      }
      if (owners.has(id)) errors.push(`${id}: covered more than once by ${owners.get(id)} and ${definition.id}`);
      owners.set(id, definition.id);
      if (item.category !== definition.category) errors.push(`${id}: category changed`);
      // Semantic anchors may be private helpers; the same owning module must expose the actual callable binding.
      if (!definition.legacyBindings.some((binding) => binding.module === item.ownerFile))
        errors.push(`${id}: baseline owner not bound`);
      if (baseline.capabilities.some((capability) => capability.id === id)) {
        if (definition.id !== id) errors.push(`${id}: stable semantic id changed`);
        if (definition.integrationStage !== item.futureStage) errors.push(`${id}: integration stage changed`);
      }
    }
  }
  for (const id of baselineById.keys()) if (!owners.has(id)) errors.push(`${id}: missing catalog registration`);
  return errors;
}
