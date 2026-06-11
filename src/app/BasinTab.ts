import { TabController } from './TabController';
import type { SystemSpec } from '../physics/systemSpec';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderLabelGrid } from './labPlots';
import { downloadDataUrl } from './labExport';
import { num, readSystem } from './systemControls';

/**
 * Double-pendulum flip basin + basin entropy + box-counting (fractal) dimension.
 * Each initial angle (θ₁, θ₂), released from rest, is coloured by which rod flips
 * over the top first; the boundary is the classic double-pendulum fractal. The
 * Daza basin entropy (Sb, Sbb) and the Minkowski–Bouligand dimension quantify it
 * — a measured fractal dimension, not "it looks fractal".
 *
 * Flip basins are double-pendulum specific, so the tab reports a notice when the
 * triple pendulum is selected. Takes over the tab's controls (idempotent).
 */
export class BasinTab extends TabController {
  private client = new ChaosClient();
  private labels: number[] = [];
  private gridWidth = 0;
  private gridHeight = 0;

  async run(): Promise<void> {
    if (this.running) return;
    const { spec } = readSystem();
    if (spec.kind !== 'double') {
      this.dom.setText('basinStatus', 'flip basins require the double pendulum (set System → Double)');
      return;
    }
    this.running = true;
    this.dom.setText('basinStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const n = Math.max(20, Math.min(200, Math.round(num('basinRes', 100))));
    try {
      const result = await this.client.basin(spec as Extract<SystemSpec, { kind: 'double' }>, { n });
      this.labels = result.labels;
      this.gridWidth = result.width;
      this.gridHeight = result.height;
      this.dom.setText('basinSb', `${result.basinEntropy.toFixed(4)} ± ${result.basinEntropyStdError.toFixed(4)}`);
      this.dom.setText('basinSbb', `${result.boundaryBasinEntropy.toFixed(4)} ± ${result.boundaryBasinEntropyStdError.toFixed(4)}`);
      this.dom.setText('basinDim', `${result.boxCountingDimension.toFixed(3)} ± ${result.boxCountingStdError.toFixed(3)}`);
      this.dom.setText('basinFractal', result.fractalBoundary ? 'Sbb > ln2 ✓' : `dim≈${result.boxCountingDimension.toFixed(2)}`);
      this.render();
      const wada = result.wadaCandidate ? 'Wada candidate ✓' : `Wada fraction ${(result.wadaFraction * 100).toFixed(0)}%`;
      this.dom.setText('basinStatus', `done · Sb=${result.basinEntropy.toFixed(3)}±${result.basinEntropyStdError.toFixed(3)} · dim=${result.boxCountingDimension.toFixed(3)}±${result.boxCountingStdError.toFixed(3)} (R²=${result.boxCountingR2.toFixed(3)}) · ${wada}`);
    } catch (err) {
      this.dom.setText('basinStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('basinCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      renderLabelGrid(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.labels, this.gridWidth, this.gridHeight);
    }
  }

  private exportPng(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('basinCanvas');
    if (canvas) downloadDataUrl('pendulum_flip_basin.png', canvas.toDataURL('image/png'));
  }

  protected bind(): void {
    this.dom.takeOver('basinStart')?.addEventListener('click', () => void this.run());
    this.dom.takeOver('basinStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      this.dom.setText('basinStatus', 'stopped');
    });
    this.dom.takeOver('basinExport')?.addEventListener('click', () => this.exportPng());
  }
}
