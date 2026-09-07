export interface SplitPanelOptions {
  readonly id: string;
  readonly label: string;
  readonly primaryLabel: string;
  readonly secondaryLabel: string;
  readonly primary: Node;
  readonly secondary: Node;
  /** First panel percentage. Values snap to the nearest five percent. */
  readonly value?: number;
  /** Bounds are multiples of five, within 10–90 percent. Defaults: 25 and 75. */
  readonly min?: number;
  readonly max?: number;
  readonly onChange?: (value: number) => void;
}

export interface SplitPanel {
  readonly element: HTMLDivElement;
  readonly separator: HTMLDivElement;
  readonly value: number;
  setValue(value: number): void;
  dispose(): void;
}

/** Resizable desktop regions become a single readable column at 40rem and below. */
export function createSplitPanel(document: Document, options: SplitPanelOptions): SplitPanel {
  const min = options.min ?? 25;
  const max = options.max ?? 75;
  if (
    ![min, max].every((bound) => Number.isFinite(bound) && bound % 5 === 0 && bound >= 10 && bound <= 90) ||
    min >= max
  ) {
    throw new RangeError('Split panel bounds must be multiples of five within 10–90, with min < max.');
  }
  if (options.value !== undefined && !Number.isFinite(options.value)) {
    throw new RangeError('Split panel value must be finite.');
  }
  let value = min;
  let pointerId: number | null = null;
  let separatorFocused = false;
  let disposed = false;
  const element = document.createElement('div');
  element.id = options.id;
  element.className = 'ds-split-panel';
  const help = document.createElement('p');
  help.id = `${options.id}-help`;
  help.className = 'ds-split__help';
  help.textContent =
    '넓은 화면에서는 경계를 드래그하거나 방향키로 너비를 조절합니다. Home은 최소, End는 최대 너비입니다. 좁은 화면에서는 위아래로 표시합니다.';
  const layout = document.createElement('div');
  layout.className = 'ds-split';
  const primary = document.createElement('section');
  primary.id = `${options.id}-primary`;
  primary.className = 'ds-split__pane';
  primary.setAttribute('aria-label', options.primaryLabel);
  primary.tabIndex = -1;
  primary.append(options.primary);
  const secondary = document.createElement('section');
  secondary.id = `${options.id}-secondary`;
  secondary.className = 'ds-split__pane';
  secondary.setAttribute('aria-label', options.secondaryLabel);
  secondary.append(options.secondary);
  const separator = document.createElement('div');
  separator.className = 'ds-split__separator';
  separator.tabIndex = 0;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', options.label);
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-controls', primary.id);
  separator.setAttribute('aria-describedby', help.id);
  separator.setAttribute('aria-valuemin', String(min));
  separator.setAttribute('aria-valuemax', String(max));
  layout.append(primary, separator, secondary);
  element.append(help, layout);
  const narrow = document.defaultView?.matchMedia('(max-width: 40rem)');
  function update(next: number, notify = true): void {
    if (disposed) return;
    if (!Number.isFinite(next)) throw new RangeError('Split panel value must be finite.');
    const normalized = Math.max(min, Math.min(max, Math.round(next / 5) * 5));
    const changed = value !== normalized;
    value = normalized;
    layout.dataset.value = String(value);
    separator.setAttribute('aria-valuenow', String(value));
    separator.setAttribute('aria-valuetext', `${options.primaryLabel} 너비 ${value}%`);
    if (notify && changed) options.onChange?.(value);
  }
  const keydown = (event: KeyboardEvent) => {
    if (narrow?.matches) return;
    const next =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : event.key === 'ArrowLeft'
            ? value - 5
            : event.key === 'ArrowRight'
              ? value + 5
              : null;
    if (next === null) return;
    event.preventDefault();
    update(next);
  };
  const pointermove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId || narrow?.matches) return;
    const bounds = layout.getBoundingClientRect();
    if (bounds.width > 0) update(((event.clientX - bounds.left) / bounds.width) * 100);
  };
  const release = () => {
    if (pointerId !== null && separator.hasPointerCapture(pointerId)) separator.releasePointerCapture(pointerId);
    pointerId = null;
    separator.removeAttribute('data-resizing');
  };
  const pointerdown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || narrow?.matches) return;
    event.preventDefault();
    pointerId = event.pointerId;
    separator.setPointerCapture(event.pointerId);
    separator.dataset.resizing = 'true';
    separator.focus();
  };
  const pointerend = (event: PointerEvent) => {
    if (event.pointerId === pointerId) release();
  };
  const responsive = () => {
    if (narrow?.matches) {
      release();
      if (separatorFocused || document.activeElement === separator) primary.focus();
    }
  };
  const focus = () => {
    separatorFocused = true;
  };
  const blur = (event: FocusEvent) => {
    // Hiding a focused separator can blur it before the media change event.
    if (!disposed && narrow?.matches && !event.relatedTarget) primary.focus();
    separatorFocused = false;
  };
  separator.addEventListener('focus', focus);
  separator.addEventListener('blur', blur);
  separator.addEventListener('keydown', keydown);
  separator.addEventListener('pointerdown', pointerdown);
  separator.addEventListener('pointermove', pointermove);
  separator.addEventListener('pointerup', pointerend);
  separator.addEventListener('pointercancel', pointerend);
  separator.addEventListener('lostpointercapture', pointerend);
  narrow?.addEventListener('change', responsive);
  update(options.value ?? 50, false);
  return {
    element,
    separator,
    get value() {
      return value;
    },
    setValue: update,
    dispose() {
      disposed = true;
      release();
      separator.removeEventListener('focus', focus);
      separator.removeEventListener('blur', blur);
      separator.removeEventListener('keydown', keydown);
      separator.removeEventListener('pointerdown', pointerdown);
      separator.removeEventListener('pointermove', pointermove);
      separator.removeEventListener('pointerup', pointerend);
      separator.removeEventListener('pointercancel', pointerend);
      separator.removeEventListener('lostpointercapture', pointerend);
      narrow?.removeEventListener('change', responsive);
      element.remove();
    }
  };
}
