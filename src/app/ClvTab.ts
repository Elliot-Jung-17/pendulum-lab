import { ChaosClient } from '../runtime/ChaosClient';
import { renderSpectrumBars, renderHistogram } from './labPlots';
import { downloadText } from './labExport';
import { setText, takeOverButton } from './domTakeover';
import { readSystem } from './systemControls';

/**
 * Covariant Lyapunov vectors (Ginelli algorithm). Unlike the Gram–Schmidt frame
 * behind the spectrum, these are the true (non-orthogonal) Oseledets directions.
 * The tab reports the exponents recovered from the QR diagonals (a cross-check on
 * the spectrum tab) and the hyperbolicity angle — the minimum angle between an
 * expanding and a contracting CLV. Angles bounded away from 0 ⇒ hyperbolic;
 * angles approaching 0 ⇒ homoclinic tangencies / non-hyperbolic dynamics.
 *
 * The canvas shows the exponent spectrum (top) and the distribution of
 * hyperbolicity angles over the analysis window (bottom).
 *
 * Takes over the tab's controls when the modern app mounts (idempotent).
 */
export class ClvTab {
  private client = new ChaosClient();
  private exponents: number[] = [];
  private angles: number[] = [];
  private running = false;

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    setText('clvStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const { spec, state0, count } = readSystem();
    try {
      const result = await this.client.clv(spec, state0, count, {
        dt: 0.01,
        renormEvery: 10,
        forwardTransient: 200,
        window: 400,
        backwardTransient: 200
      });
      this.exponents = result.exponents;
      this.angles = result.hyperbolicityAngles;
      setText('clvLambda1', (result.exponents[0] ?? 0).toFixed(4));
      setText('clvHypMean', `${result.meanHyperbolicityAngle.toFixed(4)} rad`);
      setText('clvHypMin', `${result.minHyperbolicityAngle.toFixed(4)} rad`);
      this.render();
      const hyp = result.minHyperbolicityAngle > 0.05 ? 'hyperbolic' : 'near-tangency';
      setText('clvStatus', `done · λ₁=${(result.exponents[0] ?? 0).toFixed(3)} · ⟨∠⟩=${result.meanHyperbolicityAngle.toFixed(3)} · ${hyp}`);
    } catch (err) {
      setText('clvStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = document.getElementById('clvCanvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const half = canvas.height / 2;
    renderSpectrumBars(ctx, { x: 0, y: 0, width: canvas.width, height: half }, this.exponents);
    renderHistogram(ctx, { x: 0, y: half, width: canvas.width, height: canvas.height - half }, this.angles, {
      range: [0, Math.PI / 2],
      label: 'hyperbolicity angle (rad)'
    });
  }

  private exportCsv(): void {
    const rows = ['index,exponent', ...this.exponents.map((v, i) => `${i + 1},${v.toPrecision(8)}`)];
    rows.push('', 'window_index,hyperbolicity_angle_rad', ...this.angles.map((v, i) => `${i + 1},${v.toPrecision(8)}`));
    downloadText('pendulum_covariant_lyapunov_vectors.csv', rows.join('\n'), 'text/csv');
  }

  /** Take over the tab's controls. Idempotent. */
  install(): void {
    takeOverButton('clvStart')?.addEventListener('click', () => void this.run());
    takeOverButton('clvStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      setText('clvStatus', 'stopped');
    });
    takeOverButton('clvExport')?.addEventListener('click', () => this.exportCsv());
  }
}
