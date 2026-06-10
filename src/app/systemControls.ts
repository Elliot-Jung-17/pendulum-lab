import type { SystemSpec } from '../physics/systemSpec';

/**
 * Read the current system (spec + initial state + exponent count) from the
 * shared on-page Lab controls. This mirrors `LyapunovTab.spec()` exactly so the
 * chaos-diagnostics tabs analyse the same system the simulator shows, without
 * each tab re-implementing (and risking drift from) the control wiring.
 */

export function num(id: string, fallback: number): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const v = el ? Number.parseFloat(el.value) : Number.NaN;
  return Number.isFinite(v) ? v : fallback;
}

export function str(id: string, fallback: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el ? el.value : fallback;
}

export interface SystemControls {
  spec: SystemSpec;
  state0: number[];
  count: number;
}

export function readSystem(): SystemControls {
  const triple = str('sysType', 'double') === 'triple';
  const g = num('g', 9.81);
  if (triple) {
    const spec: SystemSpec = {
      kind: 'triple',
      m1: num('m1', 1), m2: num('m2', 1), m3: num('m3', 1),
      l1: num('l1', 1.2), l2: num('l2', 1), l3: num('l3', 0.8), g
    };
    const state0 = [num('th1', 2), num('th2', 2.5), num('th3', 1), num('iw1', 0), num('iw2', 0), num('iw3', 0)];
    return { spec, state0, count: 6 };
  }
  const spec: SystemSpec = { kind: 'double', m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g };
  const state0 = [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)];
  return { spec, state0, count: 4 };
}
