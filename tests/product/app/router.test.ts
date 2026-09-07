import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../../../src/product/app/router';
import type { ProductSpace, RouteModule, RoutePort, RouteView } from '../../../src/product/app/types';
import { createExperimentRoute } from '../../../src/product/persistence/share-route';
import { experimentFixture } from '../contracts/fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeView(title: string): RouteView {
  return { element: {} as HTMLElement, title, dispose: vi.fn() };
}

function setup(initialHash = '#/learn', loader?: (space: ProductSpace) => Promise<RouteModule>) {
  let hash = initialHash;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const port: RoutePort = {
    readHash: vi.fn(() => hash),
    replaceHash: vi.fn((next: string) => {
      hash = next;
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        unsubscribe();
        listeners.delete(listener);
      };
    })
  };
  const presentation = {
    loading: vi.fn(),
    cancelled: vi.fn(),
    ready: vi.fn(),
    error: vi.fn()
  };
  const document = {} as Document;
  const view = makeView('Learn');
  const createView = vi.fn(() => view);
  const load = vi.fn(loader ?? (async () => ({ createView })));
  const router = createRouter({ port, presentation, document, load });
  return {
    router,
    port,
    presentation,
    document,
    view,
    createView,
    load,
    unsubscribe,
    readHash: () => hash,
    async visit(next: string) {
      hash = next;
      for (const listener of listeners) listener();
      // Navigation performs one asynchronous module load before presenting a view.
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

describe('product router', () => {
  it.each(['', '#'])('replaces only the absent fragment %j with the Learn default', async (hash) => {
    const app = setup(hash);
    await app.router.start();

    expect(app.port.replaceHash).toHaveBeenCalledExactlyOnceWith('#/learn');
    expect(app.readHash()).toBe('#/learn');
    expect(app.load).toHaveBeenCalledExactlyOnceWith('learn');
    expect(app.createView).toHaveBeenCalledExactlyOnceWith({ route: { kind: 'learn' } }, app.document);
    expect(app.presentation.ready).toHaveBeenCalledExactlyOnceWith(app.view, 'learn');
  });

  it.each(['#/unknown', '#/learn/course-9', '#/learn/course-1/2.1', '#/lab/missing', '#/learn?state=pe1.e30'])(
    'preserves an invalid route %s and avoids loading a view',
    async (hash) => {
      const app = setup(hash);
      await app.router.start();

      expect(app.readHash()).toBe(hash);
      expect(app.port.replaceHash).not.toHaveBeenCalled();
      expect(app.load).not.toHaveBeenCalled();
      expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('invalid-route', null);
      expect(app.presentation.ready).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['#/learn', 'learn', { kind: 'learn' }],
    ['#/learn/course-8', 'learn', { kind: 'learn-course', courseId: 'course-8' }],
    ['#/learn/course-8/8.12', 'learn', { kind: 'learn-unit', courseId: 'course-8', unitId: '8.12' }],
    ['#/lab', 'lab', { kind: 'lab' }],
    ['#/lab/double', 'lab', { kind: 'lab-system', systemId: 'system:double' }]
  ] as const)('loads only the selected space for reserved route %s', async (hash, space, route) => {
    const app = setup(hash);
    await app.router.start();

    expect(app.load).toHaveBeenCalledExactlyOnceWith(space);
    expect(app.createView).toHaveBeenCalledExactlyOnceWith({ route }, app.document);
    expect(app.presentation.loading).toHaveBeenCalledExactlyOnceWith(space);
    expect(app.presentation.ready).toHaveBeenCalledExactlyOnceWith(app.view, space);
    expect(app.port.replaceHash).not.toHaveBeenCalled();
  });

  it('passes a validated shared experiment to its matching system view', async () => {
    const experiment = experimentFixture();
    const route = createExperimentRoute(experiment);
    if (!route.ok) throw new Error('The experiment fixture must produce a share route.');
    const app = setup(route.value);
    await app.router.start();

    expect(app.load).toHaveBeenCalledExactlyOnceWith('lab');
    expect(app.createView).toHaveBeenCalledExactlyOnceWith(
      {
        route: { kind: 'lab-system', systemId: 'system:double', stateToken: route.value.split('state=')[1] },
        experiment
      },
      app.document
    );
    expect(app.readHash()).toBe(route.value);
  });

  it('rejects a valid share token attached to a different system before loading', async () => {
    const route = createExperimentRoute(experimentFixture());
    if (!route.ok) throw new Error('The experiment fixture must produce a share route.');
    const mismatch = route.value.replace('/lab/double?', '/lab/standard-map?');
    const app = setup(mismatch);
    await app.router.start();

    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('invalid-route', null);
    expect(app.load).not.toHaveBeenCalled();
    expect(app.readHash()).toBe(mismatch);
    expect(app.port.replaceHash).not.toHaveBeenCalled();
  });

  it('rejects a syntactically valid token with an invalid share envelope', async () => {
    const hash = '#/lab/double?state=pe1.e30';
    const app = setup(hash);
    await app.router.start();

    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('invalid-route', null);
    expect(app.load).not.toHaveBeenCalled();
    expect(app.readHash()).toBe(hash);
  });

  it('releases the outgoing view once before presenting the next space', async () => {
    const learnView = makeView('Learn');
    const labView = makeView('Lab');
    const app = setup('#/learn', async (space) => ({ createView: () => (space === 'learn' ? learnView : labView) }));
    await app.router.start();
    await app.visit('#/lab');

    expect(app.load.mock.calls).toEqual([['learn'], ['lab']]);
    expect(learnView.dispose).toHaveBeenCalledTimes(1);
    expect(labView.dispose).not.toHaveBeenCalled();
    expect(app.presentation.ready.mock.calls).toEqual([
      [learnView, 'learn'],
      [labView, 'lab']
    ]);
    app.router.dispose();
    expect(learnView.dispose).toHaveBeenCalledTimes(1);
    expect(labView.dispose).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('ignores an older load that later %ss after navigation', async (outcome) => {
    const pending = deferred<RouteModule>();
    const staleCreateView = vi.fn(() => makeView('Stale Learn'));
    const labView = makeView('Lab');
    const app = setup('#/learn', (space) =>
      space === 'learn' ? pending.promise : Promise.resolve({ createView: () => labView })
    );
    const firstNavigation = app.router.start();
    await app.visit('#/lab');
    if (outcome === 'resolve') pending.resolve({ createView: staleCreateView });
    else pending.reject(new Error('Old chunk failed'));
    await firstNavigation;

    expect(staleCreateView).not.toHaveBeenCalled();
    expect(app.presentation.ready).toHaveBeenCalledExactlyOnceWith(labView, 'lab');
    expect(app.presentation.error).not.toHaveBeenCalled();
  });

  it('does not let a pending view overwrite a newer invalid-route error', async () => {
    const pending = deferred<RouteModule>();
    const createView = vi.fn(() => makeView('Stale Learn'));
    const app = setup('#/learn', () => pending.promise);
    const firstNavigation = app.router.start();
    await app.visit('#/unknown');
    pending.resolve({ createView });
    await firstNavigation;

    expect(createView).not.toHaveBeenCalled();
    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('invalid-route', null);
    expect(app.presentation.ready).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('cancels a pending load that subsequently %ss', async (outcome) => {
    const pending = deferred<RouteModule>();
    const createView = vi.fn(() => makeView('Cancelled'));
    const app = setup('#/lab', () => pending.promise);
    const navigation = app.router.start();
    app.router.cancel();
    if (outcome === 'resolve') pending.resolve({ createView });
    else pending.reject(new Error('Cancelled chunk failed'));
    await navigation;

    expect(app.presentation.cancelled).toHaveBeenCalledExactlyOnceWith('lab');
    expect(createView).not.toHaveBeenCalled();
    expect(app.presentation.ready).not.toHaveBeenCalled();
    expect(app.presentation.error).not.toHaveBeenCalled();
  });

  it('can navigate again after cancellation', async () => {
    const pending = deferred<RouteModule>();
    const labView = makeView('Lab');
    const app = setup('#/learn', (space) =>
      space === 'learn' ? pending.promise : Promise.resolve({ createView: () => labView })
    );
    const navigation = app.router.start();
    app.router.cancel();
    await app.visit('#/lab');
    pending.resolve({ createView: () => makeView('Old Learn') });
    await navigation;

    expect(app.presentation.ready).toHaveBeenCalledExactlyOnceWith(labView, 'lab');
  });

  it('presents a chunk error for the current failed load', async () => {
    const app = setup('#/lab', async () => {
      throw new Error('Chunk unavailable');
    });
    await app.router.start();

    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('chunk-error', 'lab');
    expect(app.presentation.ready).not.toHaveBeenCalled();
  });

  it('contains a view creation failure in the render error boundary', async () => {
    const app = setup('#/learn', async () => ({
      createView: () => {
        throw new Error('View failed');
      }
    }));
    await expect(app.router.start()).resolves.toBeUndefined();

    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('render-error', 'learn');
    expect(app.presentation.ready).not.toHaveBeenCalled();
  });

  it('releases a created view when presenting it fails', async () => {
    const app = setup();
    app.presentation.ready.mockImplementation(() => {
      throw new Error('Presentation failed');
    });
    await expect(app.router.start()).resolves.toBeUndefined();

    expect(app.view.dispose).toHaveBeenCalledTimes(1);
    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('render-error', 'learn');
    app.router.dispose();
    expect(app.view.dispose).toHaveBeenCalledTimes(1);
  });

  it('contains an outgoing view cleanup failure and can recover on later navigation', async () => {
    const app = setup();
    await app.router.start();
    vi.mocked(app.view.dispose!).mockImplementationOnce(() => {
      throw new Error('Cleanup failed');
    });
    await app.visit('#/lab');

    expect(app.view.dispose).toHaveBeenCalledTimes(1);
    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('render-error', 'learn');
    expect(app.load).toHaveBeenCalledTimes(1);
    await app.visit('#/lab');
    expect(app.load).toHaveBeenLastCalledWith('lab');
    expect(app.presentation.ready).toHaveBeenLastCalledWith(app.view, 'lab');
  });

  it('contains cleanup failures when an external render error enters the boundary', async () => {
    const app = setup();
    await app.router.start();
    vi.mocked(app.view.dispose!).mockImplementation(() => {
      throw new Error('Cleanup failed');
    });

    expect(() => app.router.fail()).not.toThrow();
    expect(app.presentation.error).toHaveBeenCalledExactlyOnceWith('render-error', 'learn');
    expect(() => app.router.dispose()).not.toThrow();
    expect(app.view.dispose).toHaveBeenCalledTimes(1);
  });

  it('subscribes once and makes start and disposal idempotent', async () => {
    const app = setup();
    await Promise.all([app.router.start(), app.router.start()]);
    expect(app.port.subscribe).toHaveBeenCalledTimes(1);
    expect(app.load).toHaveBeenCalledTimes(1);

    app.router.dispose();
    app.router.dispose();
    await app.router.start();
    await app.visit('#/lab');
    app.router.cancel();
    app.router.fail();

    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(app.view.dispose).toHaveBeenCalledTimes(1);
    expect(app.load).toHaveBeenCalledTimes(1);
    expect(app.port.subscribe).toHaveBeenCalledTimes(1);
    expect(app.presentation.cancelled).not.toHaveBeenCalled();
    expect(app.presentation.error).not.toHaveBeenCalled();
  });

  it('removes its listener and contains an active view cleanup failure during disposal', async () => {
    const app = setup();
    await app.router.start();
    vi.mocked(app.view.dispose!).mockImplementation(() => {
      throw new Error('Cleanup failed');
    });

    expect(() => app.router.dispose()).not.toThrow();
    expect(() => app.router.dispose()).not.toThrow();
    await app.visit('#/lab');

    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(app.view.dispose).toHaveBeenCalledTimes(1);
    expect(app.load).toHaveBeenCalledTimes(1);
    expect(app.presentation.error).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('ignores a load that %ss after disposal', async (outcome) => {
    const pending = deferred<RouteModule>();
    const createView = vi.fn(() => makeView('Disposed'));
    const app = setup('#/learn', () => pending.promise);
    const navigation = app.router.start();
    app.router.dispose();
    if (outcome === 'resolve') pending.resolve({ createView });
    else pending.reject(new Error('Disposed chunk failed'));
    await navigation;

    expect(app.unsubscribe).toHaveBeenCalledTimes(1);
    expect(createView).not.toHaveBeenCalled();
    expect(app.presentation.ready).not.toHaveBeenCalled();
    expect(app.presentation.error).not.toHaveBeenCalled();
  });
});
