import { createErrorView } from './errors';

export interface ApplicationModule {
  mountApplication(root: HTMLElement, window: Window): { dispose(): void };
}

export interface BootstrapOptions {
  readonly load: () => Promise<ApplicationModule>;
  readonly showError: () => void;
  readonly root: HTMLElement;
  readonly window: Window;
}

/** The bootstrap boundary is independent of the application chunk it protects. */
export async function bootstrap({ load, showError, root, window }: BootstrapOptions) {
  try {
    const application = await load();
    return application.mountApplication(root, window);
  } catch {
    showError();
    return undefined;
  }
}

export function showBootstrapError(root: HTMLElement, window: Window): void {
  const document = root.ownerDocument;
  const main = document.createElement('main');
  main.className = 'product-main';
  const view = createErrorView(document, 'bootstrap', () => window.location.reload());
  main.append(view.element);
  root.classList.add('product-app');
  root.dataset.bootstrapState = 'error';
  root.replaceChildren(main);
  document.title = `${view.title} | Pendulum Lab`;
  main.querySelector('h1')?.focus();
}
