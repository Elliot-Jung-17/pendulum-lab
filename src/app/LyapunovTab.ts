import type { SystemSpec } from '../physics/systemSpec';
import { ChaosClient } from '../runtime/ChaosClient';
import { renderSpectrumBars } from './labPlots';
import { downloadText } from './labExport';
import { setText, takeOverButton } from './domTakeover';

/**
 * Modern port of the Lyapunov-spectrum analysis tab. It takes over the tab's
 * controls (cloning the buttons to strip the legacy handlers), reads the current
 * system from the on-page controls, and computes the full spectrum on the chaos
 * worker (`lyapunovSpectrum`, with a transparent main-thread fallback). Results
 * fill the existing #L1…#KY fields and a spectrum bar chart on #lyapSpecCanvas.
 *
 * It takes over the tab controls when the modern app mounts.
 */

function num(id: string, fallback: number): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const v = el ? Number.parseFloat(el.value) : Number.NaN;
  return Number.isFinite(v) ? v : fallback;
}

function str(id: string, fallback: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el ? el.value : fallback;
}

export class LyapunovTab {
  private client = new ChaosClient();
  private spectrum: number[] = [];
  private stdError: number[] = [];
  private blockStdError: number[] = [];
  private running = false;

  /** Build the current system spec from the lab controls. */
  private spec(): { spec: SystemSpec; state0: number[]; count: number } {
    const triple = str('sysType', 'double') === 'triple';
    const g = num('g', 9.81);
    if (triple) {
      const spec: SystemSpec = { kind: 'triple', m1: num('m1', 1), m2: num('m2', 1), m3: num('m3', 1), l1: num('l1', 1.2), l2: num('l2', 1), l3: num('l3', 0.8), g };
      const state0 = [num('th1', 2), num('th2', 2.5), num('th3', 1), num('iw1', 0), num('iw2', 0), num('iw3', 0)];
      return { spec, state0, count: 6 };
    }
    const spec: SystemSpec = { kind: 'double', m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g };
    const state0 = [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)];
    return { spec, state0, count: 4 };
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    setText('lyapStatus', this.client.usesWorker() ? 'computing (worker)…' : 'computing…');
    const { spec, state0, count } = this.spec();
    const dt = 0.005;
    const renormEvery = Math.max(1, Math.round(num('lyapDt', 0.5) / dt));
    const steps = Math.max(2000, Math.round(num('lyapT', 120) / dt));
    try {
      const result = await this.client.lyapunovSpectrum(spec, state0, count, {
        dt,
        steps,
        renormEvery,
        transientSteps: Math.min(2000, Math.round(steps / 10))
      });
      this.spectrum = result.spectrum;
      this.stdError = result.stdError ?? [];
      this.blockStdError = result.blockStdError ?? [];
      result.spectrum.slice(0, 4).forEach((v, i) => {
        const se = this.stdError[i];
        setText(`L${i + 1}`, se !== undefined ? `${v.toFixed(4)} ± ${se.toFixed(4)}` : v.toFixed(4));
      });
      setText('LSum', result.sum.toExponential(2));
      setText('KY', result.kaplanYorkeDimension.toFixed(3));
      this.render();
      // Surface the Hamiltonian self-consistency gate alongside the result so the
      // estimate is reported with its own validation, not as a bare number.
      const c = result.consistency;
      const verdict = c ? (c.symplectic ? 'symplectic ✓' : 'pairing ✗') : '';
      const pairing = c ? `, pairErr=${c.pairingError.toExponential(1)}` : '';
      setText('lyapStatus', `done · Σλ=${result.sum.toExponential(1)}${pairing}${verdict ? ` · ${verdict}` : ''}`);
    } catch (err) {
      setText('lyapStatus', `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private render(): void {
    const canvas = document.getElementById('lyapSpecCanvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) renderSpectrumBars(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.spectrum);
  }

  private exportCsv(): void {
    const csv = [
      'index,lambda,std_error,block_std_error',
      ...this.spectrum.map(
        (v, i) => `${i + 1},${v.toPrecision(10)},${(this.stdError[i] ?? 0).toPrecision(6)},${(this.blockStdError[i] ?? 0).toPrecision(6)}`
      )
    ].join('\n');
    downloadText('pendulum_lyapunov_spectrum.csv', csv, 'text/csv');
  }

  /** Take over the tab's controls. Idempotent. */
  install(): void {
    takeOverButton('lyapStart')?.addEventListener('click', () => void this.run());
    takeOverButton('lyapStop')?.addEventListener('click', () => {
      this.client.terminate();
      this.running = false;
      setText('lyapStatus', 'stopped');
    });
    takeOverButton('lyapExport')?.addEventListener('click', () => this.exportCsv());
  }
}
