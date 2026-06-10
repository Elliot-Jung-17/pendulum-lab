import type { Ctx2D, Padding, Rect } from './types';
import type { VizTheme } from './palette';

/**
 * Pure coordinate-mapping and tick helpers. Kept independent of any canvas so
 * the mapping math is unit-tested directly.
 */

export interface Scale {
  /** Map a data value to a pixel coordinate. */
  map(value: number): number;
  /** Inverse map a pixel coordinate back to a data value. */
  invert(pixel: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

export function makeScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): Scale {
  const dSpan = domainMax - domainMin || 1;
  const rSpan = rangeMax - rangeMin;
  return {
    domain: [domainMin, domainMax],
    range: [rangeMin, rangeMax],
    map: (value: number) => rangeMin + ((value - domainMin) / dSpan) * rSpan,
    invert: (pixel: number) => domainMin + ((pixel - rangeMin) / (rSpan || 1)) * dSpan
  };
}

/**
 * "Nice" tick values covering [min, max] with approximately `count` ticks,
 * snapped to 1/2/5 * 10^k steps. Returns ascending tick values.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const stepFactor = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  const step = stepFactor * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) {
    // Avoid -0 and floating dust.
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

/** Compute the inner plot rectangle after reserving padding. */
export function innerRect(rect: Rect, pad: Padding): Rect {
  return {
    x: rect.x + pad.left,
    y: rect.y + pad.top,
    width: Math.max(0, rect.width - pad.left - pad.right),
    height: Math.max(0, rect.height - pad.top - pad.bottom)
  };
}

export const DEFAULT_PADDING: Padding = { top: 10, right: 12, bottom: 26, left: 48 };

/**
 * Fill the background and draw the axis box plus gridlines/labels for the given
 * x and y scales. Returns nothing; purely side-effecting on the context.
 */
export function drawFrame(
  ctx: Ctx2D,
  outer: Rect,
  inner: Rect,
  xScale: Scale,
  yScale: Scale,
  theme: VizTheme,
  options: { xLabel?: string; yLabel?: string; tickCount?: number } = {}
): void {
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(outer.x, outer.y, outer.width, outer.height);

  const tickCount = options.tickCount ?? 5;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  // Y gridlines + labels.
  ctx.textAlign = 'right';
  for (const t of niceTicks(yScale.domain[0], yScale.domain[1], tickCount)) {
    const py = yScale.map(t);
    if (py < inner.y - 0.5 || py > inner.y + inner.height + 0.5) continue;
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(inner.x, py);
    ctx.lineTo(inner.x + inner.width, py);
    ctx.stroke();
    ctx.fillStyle = theme.axis;
    ctx.fillText(formatTick(t), inner.x - 6, py);
  }

  // X gridlines + labels.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of niceTicks(xScale.domain[0], xScale.domain[1], tickCount)) {
    const px = xScale.map(t);
    if (px < inner.x - 0.5 || px > inner.x + inner.width + 0.5) continue;
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(px, inner.y);
    ctx.lineTo(px, inner.y + inner.height);
    ctx.stroke();
    ctx.fillStyle = theme.axis;
    ctx.fillText(formatTick(t), px, inner.y + inner.height + 6);
  }

  // Axis box.
  ctx.strokeStyle = theme.axis;
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.width, inner.height);
  ctx.stroke();

  if (options.yLabel) {
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(options.yLabel, outer.x + 4, outer.y + 2);
  }
  if (options.xLabel) {
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(options.xLabel, outer.x + outer.width - 4, outer.y + outer.height - 2);
  }
  ctx.restore();
}

export function formatTick(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3) return value.toExponential(1);
  return Number(value.toPrecision(4)).toString();
}
