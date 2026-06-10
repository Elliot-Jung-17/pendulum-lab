import type { EnergyBreakdown, PendulumParameters } from '../types/domain';
import { energyDouble } from './double';

export function energyTriple(state: ArrayLike<number>, parameters: PendulumParameters): EnergyBreakdown {
  const p = {
    m1: parameters.m1,
    m2: parameters.m2,
    m3: parameters.m3 ?? 1,
    l1: parameters.l1,
    l2: parameters.l2,
    l3: parameters.l3 ?? 1,
    g: parameters.g
  };
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const t3 = Number(state[2] ?? 0);
  const w1 = Number(state[3] ?? 0);
  const w2 = Number(state[4] ?? 0);
  const w3 = Number(state[5] ?? 0);
  const py1 = -p.l1 * Math.cos(t1);
  const py2 = py1 - p.l2 * Math.cos(t2);
  const py3 = py2 - p.l3 * Math.cos(t3);
  const vx1 = p.l1 * Math.cos(t1) * w1;
  const vy1 = p.l1 * Math.sin(t1) * w1;
  const vx2 = vx1 + p.l2 * Math.cos(t2) * w2;
  const vy2 = vy1 + p.l2 * Math.sin(t2) * w2;
  const vx3 = vx2 + p.l3 * Math.cos(t3) * w3;
  const vy3 = vy2 + p.l3 * Math.sin(t3) * w3;
  const KE = 0.5 * (p.m1 * (vx1 * vx1 + vy1 * vy1) + p.m2 * (vx2 * vx2 + vy2 * vy2) + p.m3 * (vx3 * vx3 + vy3 * vy3));
  const PE = p.g * (p.m1 * py1 + p.m2 * py2 + p.m3 * py3);
  return { total: KE + PE, KE, PE };
}

export function relativeEnergyDrift(initial: EnergyBreakdown, current: EnergyBreakdown): number {
  return Math.abs((current.total - initial.total) / (Math.abs(initial.total) || 1));
}

export { energyDouble };
