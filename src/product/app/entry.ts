import { bootstrap, showBootstrapError } from './bootstrap';

const root = document.getElementById('product-root');
if (root) {
  void bootstrap({
    root,
    window,
    load: () => import('./application'),
    showError: () => showBootstrapError(root, window)
  });
}
