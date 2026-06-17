/**
 * TabController — the common base for every modern analysis-tab controller.
 *
 * It standardises the three things every tab used to re-implement:
 * - an idempotent `install()` (bind controls exactly once),
 * - DOM access through a {@link DomBinder} instead of raw `document` calls,
 * - a single-flight `runExclusive` guard so a long-running analysis can't be
 *   started twice from double clicks.
 */
import { DomBinder, pageDom } from './DomBinder';
import { attachBadge, type ResultBadgeLevel, type TrustInspection } from './resultBadges';

export abstract class TabController {
  protected readonly dom: DomBinder;
  private installed = false;
  /** Single-flight guard: true while the tab's long-running analysis is in flight. */
  protected running = false;

  constructor(dom: DomBinder = pageDom) {
    this.dom = dom;
  }

  /** Bind controls exactly once; safe to call repeatedly. */
  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.bind();
  }

  /** Wire the tab's controls. Called once from install(). */
  protected abstract bind(): void;

  /**
   * Stamp the tab's status line with a result-credibility badge (visual-only /
   * finite-time-estimate / validated / publication-ready / caveat).
   */
  protected badge(statusId: string, level: ResultBadgeLevel, note?: string, inspection?: TrustInspection): void {
    attachBadge(statusId, level, note, inspection);
  }

  /**
   * Run `task` unless one is already in flight. Reports errors to `statusId`
   * (when given) instead of throwing into the void.
   */
  protected async runExclusive(task: () => Promise<void>, statusId?: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await task();
    } catch (err) {
      if (statusId) this.dom.setText(statusId, `error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
