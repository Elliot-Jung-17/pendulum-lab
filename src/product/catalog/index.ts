import type { CapabilityCatalog, CapabilityId } from '../contracts/catalog';
import { systems } from './systems';
import { analyses } from './analyses';
import { integrators } from './integrators';
import { auxiliary } from './auxiliary';
import { allDefinitions, createCatalog } from './validation';

export const catalog: CapabilityCatalog = createCatalog({ systems, analyses, integrators, auxiliary });

export function getDefinition(id: CapabilityId | string) {
  return allDefinitions(catalog).find((definition) => definition.id === id);
}

export { allDefinitions, assertValidCatalog, createCatalog, validateCatalog } from './validation';
export {
  capabilityRejections,
  compatibleAnalyses,
  compatibleIntegrators,
  matchesCapability,
  supportsSystem
} from './predicates';
export type * from '../contracts/catalog';
