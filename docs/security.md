# Security Hardening

## CSP

The project applies a Content Security Policy in `index.html` and the Vite dev server:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self'; connect-src 'self' ws:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

`style-src 'unsafe-inline'` remains for the hand-written shell styling and a small number of runtime sizing styles, not for inline script execution. New TypeScript UI code should continue to use `createElement`, `textContent`, event listeners, and CSS classes instead of `innerHTML`. `npm run audit:legacy` tracks `innerHTML`, `.onclick`, inline worker, eval-like, dynamic script, and global export risks against the legacy baseline.

## JSON Import

`src/validation/importSchema.ts` rejects:

- imports larger than 5 MB,
- prototype pollution keys,
- unknown integrators,
- unknown system types,
- non-finite state values,
- out-of-range `dt` or damping,
- malformed parameter objects.

## Worker Policy

New code uses `new Worker(new URL('../workers/physics.worker.ts', import.meta.url), { type: 'module' })` through `WorkerBridge`. If module workers are unavailable, the bridge computes the fallback step on the main thread rather than returning a stale state.

The legacy blob worker is now disabled when `index.html` is opened directly through `file://`, and worker creation failure explicitly falls back to the main thread so the pendulum keeps moving.

## Event Policy

New commands are registered through `CommandRegistry`; the legacy bridge migrates existing `.onclick` handlers into the registry where possible and emits typed events through `EventBus`.

## Export And Storage

Typed exports sanitize filenames in `src/export/manifest.ts`. Imported JSON and localStorage-derived snapshots are validated before applying to runtime state.
