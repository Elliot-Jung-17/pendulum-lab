/**
 * Global API surfaces, split by audience:
 *
 * - `window.PendulumLab` — the **public** scripting API. Stable, versioned,
 *   frozen. Safe for user scripts, notebooks, and documentation examples.
 * - `window.PendulumLabDebug` — the **debug** surface. Unstable internals for
 *   tooling, e2e tests, and diagnostics panels. No compatibility guarantees.
 *
 * Legacy names (`PendulumLabIndex`, `PendulumRuntime`, `PendulumFeatureIntegrity`,
 * `PendulumLabAPlus`, `PendulumResearchWorkspace`) remain as deprecated aliases
 * pointing into the two namespaces so existing tests and scripts keep working.
 */

interface MutableNamespace {
  [key: string]: unknown;
}

const publicApi: MutableNamespace = {};
const debugApi: MutableNamespace = {};

function defineGlobal(name: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  Object.defineProperty(window, name, { configurable: true, value });
}

/** Merge entries into `window.PendulumLab` (public, stable surface). */
export function publishPublicApi(entries: Record<string, unknown>, aliases: Record<string, unknown> = {}): void {
  Object.assign(publicApi, entries);
  defineGlobal('PendulumLab', Object.freeze({ ...publicApi }));
  for (const [name, value] of Object.entries(aliases)) defineGlobal(name, value);
}

/** Merge entries into `window.PendulumLabDebug` (internal, unstable surface). */
export function publishDebugApi(entries: Record<string, unknown>, aliases: Record<string, unknown> = {}): void {
  Object.assign(debugApi, entries);
  defineGlobal('PendulumLabDebug', Object.freeze({ ...debugApi }));
  for (const [name, value] of Object.entries(aliases)) defineGlobal(name, value);
}
