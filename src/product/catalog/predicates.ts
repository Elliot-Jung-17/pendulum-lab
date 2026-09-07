import type { CapabilityCatalog, CapabilityPredicate, InputKind, SystemDefinition } from '../contracts/catalog';

export interface CapabilityContext {
  readonly system: SystemDefinition;
  /** Validated data available for this run. Catalog discovery alone does not produce these inputs. */
  readonly availableInputs: readonly InputKind[];
}

export function supportsSystem(predicate: CapabilityPredicate, system: SystemDefinition): boolean {
  return (
    (predicate.systemIds === undefined || predicate.systemIds.includes(system.id)) &&
    (predicate.evolutions === undefined || predicate.evolutions.includes(system.evolution))
  );
}

export function capabilityRejections(predicate: CapabilityPredicate, context: CapabilityContext): string[] {
  const reasons: string[] = [];
  if (!supportsSystem(predicate, context.system)) reasons.push(`unsupported-system:${context.system.id}`);
  for (const input of predicate.requiredInputs) {
    if (!context.availableInputs.includes(input)) reasons.push(`missing-input:${input}`);
  }
  return reasons;
}

export function matchesCapability(predicate: CapabilityPredicate, context: CapabilityContext): boolean {
  return capabilityRejections(predicate, context).length === 0;
}

export function compatibleAnalyses(catalog: CapabilityCatalog, context: CapabilityContext) {
  return catalog.analyses.filter((definition) => matchesCapability(definition.compatibility, context));
}

/** Internal event/projection/map solvers never appear as interchangeable generic steppers. */
export function compatibleIntegrators(catalog: CapabilityCatalog, context: CapabilityContext) {
  const stepping = context.system.stepping;
  if (stepping.kind !== 'selectable') return [];
  return catalog.integrators.filter(
    (definition) =>
      stepping.integratorIds.includes(definition.id) && matchesCapability(definition.compatibility, context)
  );
}
