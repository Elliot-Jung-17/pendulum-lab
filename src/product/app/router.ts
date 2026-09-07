import { resolveProductRoute } from '../persistence/share-route';
import type { ProductRoute } from '../contracts/routes';
import type { ProductSpace, RouteModule, RoutePort, RoutePresentation, RouteView } from './types';

export interface RouterOptions {
  readonly port: RoutePort;
  readonly presentation: RoutePresentation;
  readonly document: Document;
  readonly load: (space: ProductSpace, route: ProductRoute) => Promise<RouteModule>;
}

/** Owns navigation generations so an old lazy load can never replace a newer route. */
export function createRouter({ port, presentation, document, load }: RouterOptions) {
  let generation = 0;
  let disposed = false;
  let currentView: RouteView | undefined;
  let activeSpace: ProductSpace | null = null;
  let unsubscribe: (() => void) | undefined;

  function releaseView(): void {
    const previous = currentView;
    currentView = undefined;
    previous?.dispose?.();
  }

  function fail(): void {
    if (disposed) return;
    generation += 1;
    try {
      releaseView();
    } catch {
      // A faulty view cleanup must not recurse through the global error boundary.
    }
    presentation.error('render-error', activeSpace);
  }

  async function navigate(): Promise<void> {
    if (disposed) return;
    const pending = ++generation;
    try {
      releaseView();
      let hash = port.readHash();
      // Only a genuinely absent fragment has a default. Invalid routes remain intact.
      if (hash === '' || hash === '#') {
        hash = '#/learn';
        port.replaceHash(hash);
      }
      const result = resolveProductRoute(hash);
      if (!result.ok) {
        activeSpace = null;
        presentation.error('invalid-route', null);
        return;
      }
      activeSpace = result.value.route.kind.startsWith('learn') ? 'learn' : 'lab';
      const space = activeSpace;
      presentation.loading(space);
      let module: RouteModule;
      try {
        module = await load(space, result.value.route);
      } catch {
        if (!disposed && pending === generation) presentation.error('chunk-error', space);
        return;
      }
      if (disposed || pending !== generation) return;
      currentView = module.createView(result.value, document);
      presentation.ready(currentView, space);
    } catch {
      if (!disposed && pending === generation) fail();
    }
  }

  return {
    start(): Promise<void> {
      if (disposed || unsubscribe !== undefined) return Promise.resolve();
      unsubscribe = port.subscribe(() => {
        void navigate();
      });
      return navigate();
    },
    fail,
    cancel(): void {
      if (disposed) return;
      generation += 1;
      presentation.cancelled(activeSpace);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      generation += 1;
      unsubscribe?.();
      unsubscribe = undefined;
      try {
        releaseView();
      } catch {
        // Disposal still removes the router even if a route's cleanup is faulty.
      }
    }
  };
}
