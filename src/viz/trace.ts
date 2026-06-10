import type { Ctx2D } from './types';
import type { Point2D } from './poincare';
import { lerpHexColor, OKABE_ITO } from './palette';

/**
 * Gradient trajectory trace. The path is supplied in pixel coordinates (the
 * host maps physical positions to the screen). Older segments fade toward
 * `colorOld` at low alpha and the most recent segments brighten toward
 * `colorNew`, giving the motion a sense of direction and recency. A head marker
 * is drawn at the final point.
 *
 * Performance: the per-segment colour is quantised into a small lookup table
 * (built once per colour pair and cached across frames), and contiguous segments
 * that fall in the same quantisation bucket are drawn as a single stroked path.
 * This turns an O(n) sequence of `lerpHexColor`+`stroke` calls (which dominated
 * the frame cost for long trails) into O(bucket) work.
 */

export interface TraceOptions {
  colorOld?: string;
  colorNew?: string;
  width?: number;
  minAlpha?: number;
  headColor?: string;
  headRadius?: number;
}

const LUT_SIZE = 24;
const lutCache = new Map<string, string[]>();

function colorLut(colorOld: string, colorNew: string): string[] {
  const key = `${colorOld}|${colorNew}`;
  let lut = lutCache.get(key);
  if (!lut) {
    lut = new Array<string>(LUT_SIZE);
    for (let i = 0; i < LUT_SIZE; i += 1) lut[i] = lerpHexColor(colorOld, colorNew, i / (LUT_SIZE - 1));
    if (lutCache.size > 64) lutCache.clear(); // bound the cache
    lutCache.set(key, lut);
  }
  return lut;
}

export function renderTrajectoryTrace(ctx: Ctx2D, path: readonly Point2D[], options: TraceOptions = {}): void {
  const n = path.length;
  if (n < 2) {
    if (n === 1) drawHead(ctx, path[0]!, options);
    return;
  }
  const colorOld = options.colorOld ?? '#1b3a4b';
  const colorNew = options.colorNew ?? OKABE_ITO.skyBlue;
  const width = options.width ?? 2;
  const minAlpha = options.minAlpha ?? 0.05;
  const lut = colorLut(colorOld, colorNew);

  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const segments = n - 1;
  let curBucket = -1;
  let open = false;
  for (let i = 0; i < segments; i += 1) {
    const t = segments === 1 ? 1 : i / (segments - 1);
    const bucket = Math.min(LUT_SIZE - 1, Math.max(0, Math.floor(t * LUT_SIZE)));
    const a = path[i]!;
    const b = path[i + 1]!;
    if (bucket !== curBucket) {
      if (open) ctx.stroke();
      ctx.strokeStyle = lut[bucket]!;
      ctx.globalAlpha = minAlpha + (1 - minAlpha) * t;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      curBucket = bucket;
      open = true;
    }
    ctx.lineTo(b.x, b.y);
  }
  if (open) ctx.stroke();
  ctx.globalAlpha = 1;
  drawHead(ctx, path[n - 1]!, options);
  ctx.restore();
}

function drawHead(ctx: Ctx2D, p: Point2D, options: TraceOptions): void {
  if (options.headRadius === 0) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = options.headColor ?? OKABE_ITO.yellow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, options.headRadius ?? 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
