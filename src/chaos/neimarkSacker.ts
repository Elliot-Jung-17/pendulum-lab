import type { FloquetMultiplier } from './floquet';

/**
 * Neimark–Sacker (torus) bifurcation detection along a periodic-orbit branch.
 * A NS bifurcation occurs where a complex-conjugate multiplier pair crosses the
 * unit circle with non-real critical multipliers; past the crossing the orbit
 * sheds an invariant torus whose rotation number is arg(μ)/2π at criticality.
 */

export interface BranchSample {
  /** Continuation parameter (e.g. drive amplitude). */
  param: number;
  multipliers: FloquetMultiplier[];
}

export interface NeimarkSackerPoint {
  /** Bracketing parameters: the crossing lies in (paramBefore, paramAfter]. */
  paramBefore: number;
  paramAfter: number;
  /** Linear interpolation estimate of the critical parameter. */
  paramCritical: number;
  /** |μ| just before and after the crossing. */
  modulusBefore: number;
  modulusAfter: number;
  /** Rotation number arg(μ)/2π at the sample nearest criticality. */
  rotationNumber: number;
  /** Strong-resonance flag: rotation number near 0, 1/2, 1/3, 1/4 invalidates the generic NS normal form. */
  strongResonance: boolean;
  direction: 'destabilising' | 'stabilising';
}

export interface NeimarkSackerScan {
  points: NeimarkSackerPoint[];
  method: string;
  caveat: string;
}

function dominantComplexPair(multipliers: readonly FloquetMultiplier[]): FloquetMultiplier | null {
  let best: FloquetMultiplier | null = null;
  let bestModulus = -1;
  for (const mu of multipliers) {
    if (Math.abs(mu.im) < 1e-9) continue;
    const modulus = Math.hypot(mu.re, mu.im);
    if (modulus > bestModulus) {
      bestModulus = modulus;
      best = mu;
    }
  }
  return best;
}

const STRONG_RESONANCES = [0, 1 / 2, 1 / 3, 1 / 4];

export function detectNeimarkSacker(branch: readonly BranchSample[], resonanceTolerance = 0.02): NeimarkSackerScan {
  const points: NeimarkSackerPoint[] = [];
  for (let i = 1; i < branch.length; i += 1) {
    const before = branch[i - 1]!;
    const after = branch[i]!;
    const pairBefore = dominantComplexPair(before.multipliers);
    const pairAfter = dominantComplexPair(after.multipliers);
    if (!pairBefore || !pairAfter) continue;
    const modulusBefore = Math.hypot(pairBefore.re, pairBefore.im);
    const modulusAfter = Math.hypot(pairAfter.re, pairAfter.im);
    const crossesOut = modulusBefore < 1 && modulusAfter >= 1;
    const crossesIn = modulusBefore >= 1 && modulusAfter < 1;
    if (!crossesOut && !crossesIn) continue;
    const t = Math.abs(modulusAfter - modulusBefore) > 1e-12 ? (1 - modulusBefore) / (modulusAfter - modulusBefore) : 0.5;
    const critical = Math.abs(1 - modulusBefore) <= Math.abs(modulusAfter - 1) ? pairBefore : pairAfter;
    const rotation = Math.abs(Math.atan2(critical.im, critical.re)) / (2 * Math.PI);
    points.push({
      paramBefore: before.param,
      paramAfter: after.param,
      paramCritical: before.param + Math.max(0, Math.min(1, t)) * (after.param - before.param),
      modulusBefore,
      modulusAfter,
      rotationNumber: rotation,
      strongResonance: STRONG_RESONANCES.some((target) => Math.abs(rotation - target) < resonanceTolerance),
      direction: crossesOut ? 'destabilising' : 'stabilising'
    });
  }
  return {
    points,
    method: 'dominant complex Floquet pair |mu| crossing 1 between adjacent branch samples; critical parameter by linear interpolation of |mu|',
    caveat: 'Detection brackets crossings between continuation samples; strong resonances (rotation number near 0, 1/2, 1/3, 1/4) require dedicated normal-form analysis. Torus existence past the crossing assumes the generic non-degenerate NS scenario.'
  };
}

/**
 * Torus indicator from stroboscopic samples: the 0–1-test-like growth of the
 * angular spread distinguishes a closed invariant curve (quasi-periodic torus
 * section: dense, bounded, non-repeating) from a periodic orbit (finite point
 * set) and chaos (area-filling).
 */
export interface TorusIndicator {
  distinctClusters: number;
  fillRatio: number;
  verdict: 'periodic' | 'torus-like' | 'chaotic-or-noisy';
}

export function torusIndicator(angles: readonly number[], clusterTolerance = 1e-3, fillBins = 64): TorusIndicator {
  if (angles.length === 0) return { distinctClusters: 0, fillRatio: 0, verdict: 'periodic' };
  const wrapped = angles.map((angle) => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  let clusters = 1;
  for (let i = 1; i < wrapped.length; i += 1) {
    if (wrapped[i]! - wrapped[i - 1]! > clusterTolerance) clusters += 1;
  }
  const bins = new Uint8Array(fillBins);
  for (const angle of wrapped) bins[Math.min(fillBins - 1, Math.floor((angle / (2 * Math.PI)) * fillBins))] = 1;
  let filled = 0;
  for (let i = 0; i < fillBins; i += 1) filled += bins[i]!;
  const fillRatio = filled / fillBins;
  const verdict = clusters <= 16 ? 'periodic' : fillRatio > 0.9 ? 'torus-like' : 'chaotic-or-noisy';
  return { distinctClusters: clusters, fillRatio, verdict };
}
