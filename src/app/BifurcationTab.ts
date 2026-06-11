import { num } from './systemControls';
import { TabController } from './TabController';
import { poincareSection } from '../chaos';
import { rhsDouble } from '../physics/double';
import { renderBifurcation, type BifurcationColumnData } from '../viz';
import type { PendulumParameters } from '../types/domain';
import { downloadDataUrl } from './labExport';

/**
 * Modern port of the Bifurcation tab. It sweeps gravity g and records θ₂ at the
 * θ₁=0 (θ̇₁>0) Poincaré section for the double pendulum, building the classic
 * bifurcation picture. Columns are computed one parameter value at a time in
 * time-budgeted animation-loop chunks (responsive, cancellable, progress bar),
 * reusing the tested `poincareSection`, and rendered with `viz/renderBifurcation`.
 */

const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

export class BifurcationTab extends TabController {
  private gValues: number[] = [];
  private columns: BifurcationColumnData[] = [];
  private cursor = 0;
  private rafId: number | null = null;
  private params: PendulumParameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  private state0: number[] = [2, 2.5, 0, 0];
  private maxTime = 60;

  private start(): void {
    this.stop();
    this.params = { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: 9.81 };
    this.state0 = [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)];
    this.maxTime = num('bifT', 60);
    const gMin = num('bifGMin', 2);
    const gMax = num('bifGMax', 12);
    const steps = Math.max(20, Math.min(1000, Math.round(num('bifSteps', 400))));
    this.gValues = Array.from({ length: steps }, (_, i) => gMin + ((gMax - gMin) * i) / (steps - 1));
    this.columns = [];
    this.cursor = 0;
    const canvas = this.dom.el<HTMLCanvasElement>('bifCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = '#05080d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.dom.setText('bifStatus', `sweeping g over ${steps}…`);
    this.rafId = requestAnimationFrame(() => this.chunk());
  }

  private columnFor(g: number): BifurcationColumnData {
    const params = { ...this.params, g };
    const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, params, 0, o);
    const section = poincareSection(this.state0, rhs, {
      section: (s) => Math.sin(0.5 * (s[0] ?? 0)), // zero at θ1 = 0 (mod 2π)
      direction: 'rising',
      dt: 0.005,
      maxTime: this.maxTime,
      transientCrossings: 20,
      maxPoints: 60
    });
    return { param: g, values: section.points.map((p) => wrapPi(p[1] ?? 0)) };
  }

  private chunk(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('bifCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const deadline = performance.now() + 14;
    while (this.cursor < this.gValues.length && performance.now() < deadline) {
      this.columns.push(this.columnFor(this.gValues[this.cursor]!));
      this.cursor += 1;
    }
    renderBifurcation(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.columns, { xLabel: 'g (m/s²)', yLabel: 'θ₂ at section' });
    const progress = this.cursor / this.gValues.length;
    const bar = this.dom.el('bifProgress');
    if (bar) bar.style.width = `${(progress * 100).toFixed(1)}%`;
    if (this.cursor < this.gValues.length) {
      this.dom.setText('bifStatus', `${(progress * 100).toFixed(0)}%`);
      this.rafId = requestAnimationFrame(() => this.chunk());
    } else {
      this.dom.setText('bifStatus', `done · ${this.gValues.length} columns`);
      this.badge('bifStatus', 'finite-time-estimate', 'Bifurcation diagram: finite-transient section sampling.');
      this.rafId = null;
    }
  }

  private stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  protected bind(): void {
    this.dom.takeOver('bifStart')?.addEventListener('click', () => this.start());
    this.dom.takeOver('bifStop')?.addEventListener('click', () => {
      this.stop();
      this.dom.setText('bifStatus', 'cancelled');
    });
    this.dom.takeOver('bifExport')?.addEventListener('click', () => {
      const canvas = this.dom.el<HTMLCanvasElement>('bifCanvas');
      if (canvas) downloadDataUrl('pendulum_bifurcation.png', canvas.toDataURL('image/png'));
    });
  }
}
