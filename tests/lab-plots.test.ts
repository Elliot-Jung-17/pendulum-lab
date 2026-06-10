import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '../src/viz/types';
import { renderPhasePortrait, renderSpectrum } from '../src/app/labPlots';

function makeStubCtx(): Ctx2D & { calls: Record<string, number>; lineTos: number } {
  const calls: Record<string, number> = {};
  let lineTos = 0;
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  return {
    get lineTos() {
      return lineTos;
    },
    calls,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px monospace',
    lineJoin: 'round',
    lineCap: 'round',
    textAlign: 'left',
    textBaseline: 'top',
    save: () => bump('save'),
    restore: () => bump('restore'),
    beginPath: () => bump('beginPath'),
    closePath: () => bump('closePath'),
    moveTo: () => bump('moveTo'),
    lineTo: () => {
      lineTos += 1;
      bump('lineTo');
    },
    stroke: () => bump('stroke'),
    fill: () => bump('fill'),
    arc: () => bump('arc'),
    rect: () => bump('rect'),
    fillRect: () => bump('fillRect'),
    clearRect: () => bump('clearRect'),
    fillText: () => bump('fillText'),
    setLineDash: () => bump('setLineDash'),
    createLinearGradient: () => ({ addColorStop: () => bump('addColorStop') })
  } as unknown as Ctx2D & { calls: Record<string, number>; lineTos: number };
}

const RECT = { x: 0, y: 0, width: 220, height: 120 };

describe('renderPhasePortrait', () => {
  it('draws axes and a polyline through the samples without throwing', () => {
    const ctx = makeStubCtx();
    const samples = Array.from({ length: 50 }, (_, i) => ({ theta: Math.sin(i / 5), omega: Math.cos(i / 5) * 10 }));
    renderPhasePortrait(ctx, RECT, samples);
    expect(ctx.calls.fillRect).toBeGreaterThanOrEqual(1); // background
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(2); // axes + trajectory
    expect(ctx.calls.lineTo).toBeGreaterThan(40); // one segment per sample
  });

  it('still renders axes with fewer than two samples', () => {
    const ctx = makeStubCtx();
    expect(() => renderPhasePortrait(ctx, RECT, [{ theta: 0, omega: 0 }])).not.toThrow();
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(1);
  });
});

describe('renderSpectrum', () => {
  it('draws a filled spectrum and a Nyquist label', () => {
    const ctx = makeStubCtx();
    const mags = Array.from({ length: 64 }, (_, i) => Math.exp(-Math.abs(i - 8) / 4));
    renderSpectrum(ctx, RECT, mags, { log: true, nyquist: 83.3 });
    expect(ctx.calls.fill).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.fillText).toBeGreaterThanOrEqual(1); // Nyquist label
  });

  it('handles an empty spectrum gracefully', () => {
    const ctx = makeStubCtx();
    expect(() => renderSpectrum(ctx, RECT, [])).not.toThrow();
  });
});
