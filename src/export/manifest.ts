import type { RuntimeSnapshot } from '../types/domain';
import { integratorRegistry } from '../physics/integrators';

export interface SubmissionManifest {
  schemaVersion: 'pendulum-submission/v10-ts';
  generatedAt: string;
  runtime: RuntimeSnapshot;
  integrator: unknown;
  security: {
    csp: string;
    jsonImport: 'strict-schema';
    workerPolicy: 'module-worker-with-main-thread-fallback';
  };
  limitations: string[];
}

export function createSubmissionManifest(runtime: RuntimeSnapshot): SubmissionManifest {
  return {
    schemaVersion: 'pendulum-submission/v10-ts',
    generatedAt: new Date().toISOString(),
    runtime,
    integrator: integratorRegistry[runtime.method],
    security: {
      csp: "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'",
      jsonImport: 'strict-schema',
      workerPolicy: 'module-worker-with-main-thread-fallback'
    },
    limitations: [
      'Browser floating point and scheduling can affect exact reproducibility.',
      'Symplectic claims require canonical coordinates, gamma = 0, and residual/step metadata.',
      'With damping enabled, energy change is physical dissipation plus numerical error, not a conservation diagnostic.',
      'Triple pendulum mode remains more sensitive and should be independently benchmarked for research claims.'
    ]
  };
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(filename, blob);
}

export function downloadBytes(filename: string, bytes: Uint8Array, type = 'application/octet-stream'): void {
  // Copy into a plain ArrayBuffer-backed view so Blob accepts it under strict lib.dom typing.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  downloadBlob(filename, new Blob([copy.buffer], { type }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
