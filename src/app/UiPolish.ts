/**
 * UiPolish — small, purely-visual interaction enhancements for the premium CSS
 * layer (css/04-premium.css). No simulation, state, or worker coupling.
 *
 * What it maintains:
 *  - `--sp` on every range input: the filled fraction of the track (0–100%),
 *    so the CSS can paint a progress-filled gradient track.
 *  - a short highlight class on the row's value readout when a slider moves.
 *  - a click ripple <span> on buttons (skipping the rail and tooltip buttons,
 *    whose ::after tooltips would be clipped by the ripple's overflow:hidden).
 *
 * All listeners are passive observers on existing events; programmatic value
 * changes (preset loads, tab restores) are caught by a cheap re-sync scheduled
 * after any click.
 */

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function syncRange(el: HTMLInputElement): void {
  const min = Number.parseFloat(el.min !== '' ? el.min : '0');
  const max = Number.parseFloat(el.max !== '' ? el.max : '100');
  const val = Number.parseFloat(el.value !== '' ? el.value : '0');
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(val)) return;
  const pct = Math.min(100, Math.max(0, ((val - min) / span) * 100));
  const next = `${pct.toFixed(2)}%`;
  // Skip no-op writes: presets fire input+change per slider, and every style
  // write is one more invalidation for the engine to chew on.
  if (el.style.getPropertyValue('--sp') !== next) el.style.setProperty('--sp', next);
}

function syncAllRanges(): void {
  document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(syncRange);
}

let resyncQueued = false;
function queueResync(): void {
  if (resyncQueued) return;
  resyncQueued = true;
  requestAnimationFrame(() => {
    resyncQueued = false;
    syncAllRanges();
  });
}

function flashValueReadout(range: HTMLInputElement): void {
  if (reducedMotion()) return;
  const readout = range.closest('.row')?.querySelector('.val');
  if (!(readout instanceof HTMLElement)) return;
  if (readout.classList.contains('val-flash')) {
    // Mid-flash restart via the Web Animations API. The classic alternative
    // (remove class, force a synchronous reflow, re-add) costs one forced
    // layout per slider event — preset loads dispatch input+change on every
    // slider, and that burst of forced layouts visibly stalls slower
    // compositors.
    readout.getAnimations?.().forEach((a) => {
      a.cancel();
      a.play();
    });
    return;
  }
  readout.classList.add('val-flash');
  readout.addEventListener('animationend', () => readout.classList.remove('val-flash'), { once: true });
}

function spawnRipple(button: HTMLElement, ev: PointerEvent): void {
  if (reducedMotion()) return;
  const rect = button.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const diameter = Math.max(rect.width, rect.height) * 2;
  const x = (ev.clientX || rect.left + rect.width / 2) - rect.left - diameter / 2;
  const y = (ev.clientY || rect.top + rect.height / 2) - rect.top - diameter / 2;
  const ripple = document.createElement('span');
  ripple.className = 'ui-ripple';
  ripple.style.width = `${diameter}px`;
  ripple.style.height = `${diameter}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.setAttribute('aria-hidden', 'true');
  button.classList.add('ui-ripple-host');
  button.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  // Safety net in case animation events never fire (e.g. display toggled off).
  window.setTimeout(() => ripple.remove(), 800);
}

/** True for buttons whose CSS tooltip or rail placement must not be clipped. */
function rippleExcluded(button: HTMLElement): boolean {
  return button.hasAttribute('data-tip') || button.closest('.rail') !== null;
}

export function installUiPolish(): void {
  syncAllRanges();

  document.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'range') {
        syncRange(t);
        flashValueReadout(t);
      }
    },
    true
  );
  document.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'range') syncRange(t);
    },
    true
  );

  // Presets, resets, imports and tab restores set slider values from code; one
  // deferred sweep after any click keeps every track fill honest.
  document.addEventListener('click', queueResync, true);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (button instanceof HTMLElement && !rippleExcluded(button)) spawnRipple(button, e);
    },
    true
  );
}
