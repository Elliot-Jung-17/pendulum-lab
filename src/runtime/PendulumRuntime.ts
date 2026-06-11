import { ServiceContainer } from './ServiceContainer';
import { publishDebugApi } from './globalApi';
import { eventBus, EventBus, type PendulumEvents } from './EventBus';
import { commandRegistry, CommandRegistry } from './CommandRegistry';
import { stateStore } from '../state/StateStore';
import { physicsAdapter } from '../physics';
import { workerBridge } from './WorkerBridge';
import type { PendulumLegacyApp, PendulumLegacyPhysics } from '../types/globals';

/**
 * Typed service map for the application container. Modern services are always
 * present; the two `legacy*` entries are adopted from the classic runtime and
 * are absent under `file://` (use `tryResolve`).
 */
export interface PendulumServiceMap {
  events: EventBus<PendulumEvents>;
  commands: CommandRegistry;
  state: typeof stateStore;
  physics: typeof physicsAdapter;
  worker: typeof workerBridge;
  legacyApp: PendulumLegacyApp;
  legacyPhysics: PendulumLegacyPhysics;
}

const container = new ServiceContainer<PendulumServiceMap>();

/** Read the single legacy namespace object published by `js/01-core-app.js`. */
function legacyNamespace(): { App?: PendulumLegacyApp; Physics?: PendulumLegacyPhysics } | undefined {
  return (window as Window & { PendulumLabLegacyRuntime?: { App?: PendulumLegacyApp; Physics?: PendulumLegacyPhysics } })
    .PendulumLabLegacyRuntime;
}

let installed = false;

/**
 * Build the application container and publish the single canonical runtime
 * surface on `window.PendulumRuntime`. Idempotent.
 */
export function installPendulumRuntime(): ServiceContainer<PendulumServiceMap> {
  if (installed) return container;

  container.registerValue('events', eventBus);
  container.registerValue('commands', commandRegistry);
  container.registerValue('state', stateStore);
  container.registerValue('physics', physicsAdapter);
  container.registerValue('worker', workerBridge);

  // The legacy app/physics are owned by the classic scripts. We resolve them
  // lazily from the single legacy namespace (falling back to the deprecated
  // `window.App`/`window.Physics` compatibility accessors) so the modern layer
  // never writes a bare global of its own.
  container.register('legacyApp', () => {
    const app = legacyNamespace()?.App ?? window.App;
    if (!app) throw new Error('PendulumRuntime: legacy App is not available (file:// or pre-boot)');
    return app;
  }, { singleton: false });
  container.register('legacyPhysics', () => {
    const physics = legacyNamespace()?.Physics ?? window.Physics;
    if (!physics) throw new Error('PendulumRuntime: legacy Physics is not available');
    return physics;
  }, { singleton: false });

  const surface = Object.freeze({
    version: '10.12.0',
    container,
    resolve: <K extends keyof PendulumServiceMap>(token: K) => container.resolve(token),
    tryResolve: <K extends keyof PendulumServiceMap>(token: K) => container.tryResolve(token),
    has: <K extends keyof PendulumServiceMap>(token: K) => container.has(token),
    /** Convenience typed accessors for the most-used services. */
    get events() {
      return eventBus;
    },
    get commands() {
      return commandRegistry;
    },
    get state() {
      return stateStore;
    },
    /** Lightweight description for diagnostics panels. */
    describe: () => ({
      version: '10.12.0',
      services: container.tokens().map((token) => String(token)),
      legacyAdopted: Boolean(legacyNamespace()?.App ?? window.App)
    })
  });

  // The DI surface is an internal/debug concern: publish it on the debug
  // namespace, keeping `window.PendulumRuntime` as a deprecated alias.
  publishDebugApi({ runtime: surface }, { PendulumRuntime: surface });
  installed = true;
  return container;
}

/** The application container (for modern modules that prefer direct access). */
export function getContainer(): ServiceContainer<PendulumServiceMap> {
  return container;
}
