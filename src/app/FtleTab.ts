import { TabController } from './TabController';
import type { SystemSpec } from '../physics/systemSpec';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderScalarField } from './labPlots';
import { downloadDataUrl } from './labExport';
import { num, readSystem } from './systemControls';

/**
 * Finite-Time Lyapunov Exponent (FTLE) field of the double pendulum over its
 * (θ₁, θ₂) section. Unlike the chaos-map Sweep (which time-averages λ₁), the
 * FTLE measures the largest singular value of the finite-time flow-map gradient
 * ∂x(T)/∂x(0) — so ridges of the field are Lagrangian Coherent Structures, the
 * transport barriers that organise the mixing. The horizon T is the key knob.
 *
 * FTLE fields are double-pendulum specific; the tab reports a notice for the
 * triple pendulum. Takes over the tab's controls (idempotent).
 */
export class FtleTab extends TabController {
  private client = new ChaosClient();
  private values: number[] = [];
  private gridWidth = 0;
  private gridHeight = 0;
  private min = 0;
  private max = 0;

  async run(): Promise<void> {
    if (this.running) return;
    const { spec } = readSystem();
    if (spec.kind !== 'double') {
      this.dom.setText('ftleStatus', 'FTLE field requires the double pendulum (set System → Double)');
      this.badge('ftleStatus', 'caveat', 'FTLE field requires the double pendulum (set System → Double)');
      return;
    }
    this.running = true;
    this.dom.setText('ftleStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const n = Math.max(20, Math.min(160, Math.round(num('ftleRes', 70))));
    const totalTime = Math.max(0.5, num('ftleT', 3));
    try {
      const r = await this.client.ftle(spec as Extract<SystemSpec, { kind: 'double' }>, { n, totalTime });
      this.values = r.values;
      this.gridWidth = r.width;
      this.gridHeight = r.height;
      this.min = r.min;
      this.max = r.max;
      this.dom.setText('ftleMin', r.min.toFixed(3));
      this.dom.setText('ftleMax', r.max.toFixed(3));
      this.dom.setText('ftleT2', `${totalTime.toFixed(1)} s`);
      this.render();
      this.dom.setText('ftleStatus', `done · σ_T∈[${r.min.toFixed(2)}, ${r.max.toFixed(2)}] · T=${totalTime.toFixed(1)}s`);
      this.badge('ftleStatus', 'finite-time-estimate', 'FTLE field: finite-horizon flow-map gradient estimate.');
    } catch (err) {
      this.dom.setText('ftleStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('ftleCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      renderScalarField(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.values, this.gridWidth, this.gridHeight, {
        range: [this.min, this.max]
      });
    }
  }

  private exportPng(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('ftleCanvas');
    if (canvas) downloadDataUrl('pendulum_ftle_field.png', canvas.toDataURL('image/png'));
  }

  protected bind(): void {
    this.dom.takeOver('ftleStart')?.addEventListener('click', () => void this.run());
    this.dom.takeOver('ftleStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      this.dom.setText('ftleStatus', 'stopped');
    });
    this.dom.takeOver('ftleExport')?.addEventListener('click', () => this.exportPng());
  }
}
