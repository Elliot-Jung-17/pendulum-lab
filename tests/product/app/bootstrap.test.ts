import { describe, expect, it, vi } from 'vitest';
import { bootstrap } from '../../../src/product/app/bootstrap';

describe('product bootstrap boundary', () => {
  const root = {} as HTMLElement;
  const window = {} as Window;

  it('returns the mounted application and forwards its browser context', async () => {
    const application = { dispose: vi.fn() };
    const mountApplication = vi.fn(() => application);
    const load = vi.fn(async () => ({ mountApplication }));
    const showError = vi.fn();

    const result = await bootstrap({ load, showError, root, window });

    expect(result).toBe(application);
    expect(load).toHaveBeenCalledTimes(1);
    expect(mountApplication).toHaveBeenCalledExactlyOnceWith(root, window);
    expect(showError).not.toHaveBeenCalled();
    expect(application.dispose).not.toHaveBeenCalled();
  });

  it('shows the independent fallback when importing the application fails', async () => {
    const showError = vi.fn();
    const result = await bootstrap({
      load: async () => {
        throw new Error('Application chunk unavailable');
      },
      showError,
      root,
      window
    });

    expect(result).toBeUndefined();
    expect(showError).toHaveBeenCalledTimes(1);
  });

  it('shows the independent fallback when application mounting throws', async () => {
    const showError = vi.fn();
    const mountApplication = vi.fn(() => {
      throw new Error('Application mounting failed');
    });
    const result = await bootstrap({ load: async () => ({ mountApplication }), showError, root, window });

    expect(result).toBeUndefined();
    expect(mountApplication).toHaveBeenCalledExactlyOnceWith(root, window);
    expect(showError).toHaveBeenCalledTimes(1);
  });
});
