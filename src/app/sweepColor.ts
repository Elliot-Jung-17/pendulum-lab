import { lerpHexColor } from '../viz';

/**
 * Colormap for the chaos-map sweep: a maximal-Lyapunov value is mapped to a
 * perceptual ramp from "regular" (dark/cool) to "chaotic" (warm). Pure and
 * unit-tested. `scale` is the λ value treated as fully chaotic (full warm).
 */

// navy → blue → orange → vermillion (cool-to-warm, colorblind-tolerant).
const STOPS = ['#0b1020', '#0072B2', '#E69F00', '#D55E00'] as const;

/** Map a value in [0,1] through the multi-stop ramp. */
export function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const segments = STOPS.length - 1;
  const scaled = clamped * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  return lerpHexColor(STOPS[i]!, STOPS[i + 1]!, scaled - i);
}

/** Map a maximal-Lyapunov value to a color. Non-positive λ ⇒ the coolest stop. */
export function lambdaColor(lambda: number, scale: number): string {
  if (!Number.isFinite(lambda)) return '#000000';
  if (lambda <= 0) return STOPS[0];
  return rampColor(lambda / (scale || 1));
}
