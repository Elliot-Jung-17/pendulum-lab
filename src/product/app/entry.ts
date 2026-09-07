import { bootstrap, showBootstrapError } from './bootstrap';

const root = document.getElementById('product-root');
if (root) {
  void bootstrap({
    root,
    window,
    load: () =>
      new URLSearchParams(window.location.search).get('gallery') === 'components'
        ? import('../design-system/gallery')
        : import('./application'),
    showError: () => showBootstrapError(root, window)
  });
}
