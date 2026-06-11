import { num } from './systemControls';
import { TabController } from './TabController';
import { LabSimulation, type LabConfig } from './LabSimulation';

/**
 * Modern port of the phase-density tab. The legacy tab uses WebGL additive
 * blending with a Canvas2D fallback; this modern version implements that same
 * additive accumulation directly in Canvas2D (`globalCompositeOperation =
 * 'lighter'`), which is portable and headless-testable. It plots the (θ1, ω1)
 * phase density of the evolving double pendulum. Renders only while the tab is
 * visible.
 */

const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

export class DensityTab extends TabController {
  private sim: LabSimulation | null = null;
  private rafId: number | null = null;
  private cleared = true;

  private config(): LabConfig {
    return {
      system: 'double',
      parameters: { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: num('g', 9.81) },
      gamma: num('gamma', 0),
      method: 'rk4',
      dt: 0.004,
      initialState: [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)]
    };
  }

  private active(): boolean {
    return this.dom.tabActive('tab-density');
  }

  private frame(): void {
    this.rafId = requestAnimationFrame(() => this.frame());
    if (!this.active()) return;
    const canvas = this.dom.el<HTMLCanvasElement>('gpuCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!this.sim) this.sim = new LabSimulation(this.config());
    if (this.cleared) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05080d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.cleared = false;
      this.dom.setText('gpuStatus', 'Canvas2D additive');
    }

    const alpha = num('gpuAlpha', 0.04);
    const w = canvas.width;
    const h = canvas.height;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(40,170,230,${alpha})`;
    for (let s = 0; s < 24; s += 1) {
      this.sim.step(1);
      const st = this.sim.getState();
      const x = ((wrapPi(st[0]!) + Math.PI) / (2 * Math.PI)) * w;
      const y = h - Math.max(0, Math.min(1, (st[2]! + 12) / 24)) * h;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  protected bind(): void {
    this.dom.setText('gpuStatus', 'Canvas2D additive (ready)');
    this.dom.el('gpuClear')?.addEventListener('click', () => {
      this.cleared = true;
      this.sim = new LabSimulation(this.config());
    });
    this.rafId = requestAnimationFrame(() => this.frame());
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
