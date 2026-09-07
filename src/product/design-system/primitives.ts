import { element } from '../app/dom';

export interface ButtonOptions {
  readonly label: string;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly onClick?: (event: MouseEvent) => void;
}

/** Native controls keep keyboard activation and form behavior intact. */
export function createButton(document: Document, options: ButtonOptions): HTMLButtonElement {
  const button = element(document, 'button', `ds-button ds-button--${options.variant ?? 'primary'}`, options.label);
  button.type = options.type ?? 'button';
  button.disabled = options.disabled ?? false;
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
}

export interface InputOptions {
  readonly id: string;
  readonly label: string;
  readonly value?: string;
  readonly help?: string;
  readonly error?: string;
  readonly type?: 'text' | 'number' | 'email' | 'search' | 'password';
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onInput?: (value: string) => void;
}

export interface InputControl {
  readonly element: HTMLDivElement;
  readonly input: HTMLInputElement;
  setError(message: string): void;
}

export function createInput(document: Document, options: InputOptions): InputControl {
  const field = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', options.label);
  label.htmlFor = options.id;
  const input = element(document, 'input', 'ds-field__control');
  input.id = options.id;
  input.type = options.type ?? 'text';
  input.value = options.value ?? '';
  input.required = options.required ?? false;
  input.disabled = options.disabled ?? false;
  const help = element(document, 'p', 'ds-field__help', options.help ?? '');
  help.id = `${options.id}-help`;
  help.hidden = !options.help;
  const error = element(document, 'p', 'ds-field__error');
  error.id = `${options.id}-error`;
  error.setAttribute('aria-live', 'polite');
  error.setAttribute('aria-atomic', 'true');
  field.append(label, input, help, error);

  function setError(message: string): void {
    error.textContent = message;
    error.hidden = !message;
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid', String(Boolean(message)));
    const descriptions = [options.help ? help.id : '', message ? error.id : ''].filter(Boolean);
    if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  setError(options.error ?? '');
  if (options.onInput) input.addEventListener('input', () => options.onInput?.(input.value));
  return { element: field, input, setError };
}

export interface ContainerOptions {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly headingLevel?: 2 | 3 | 4;
}

export interface ContainerControl {
  readonly element: HTMLElement;
  readonly body: HTMLDivElement;
}

function createContainer(document: Document, kind: 'section' | 'card', options: ContainerOptions): ContainerControl {
  const container = element(document, kind === 'section' ? 'section' : 'article', `ds-${kind}`);
  container.id = options.id;
  const heading = element(
    document,
    `h${options.headingLevel ?? (kind === 'section' ? 2 : 3)}`,
    `ds-${kind}__heading`,
    options.title
  );
  heading.id = `${options.id}-heading`;
  container.setAttribute('aria-labelledby', heading.id);
  container.append(heading);
  if (options.description) {
    container.append(element(document, 'p', `ds-${kind}__description`, options.description));
  }
  const body = element(document, 'div', `ds-${kind}__body`);
  container.append(body);
  return { element: container, body };
}

export function createSection(document: Document, options: ContainerOptions): ContainerControl {
  return createContainer(document, 'section', options);
}

export function createCard(document: Document, options: ContainerOptions): ContainerControl {
  return createContainer(document, 'card', options);
}

export interface ProgressOptions {
  readonly id: string;
  readonly label: string;
  readonly value?: number | null;
  readonly max?: number;
}

export interface ProgressControl {
  readonly element: HTMLDivElement;
  readonly progress: HTMLProgressElement;
  setValue(value: number | null, status?: string): void;
}

export function createProgress(document: Document, options: ProgressOptions): ProgressControl {
  const max = options.max ?? 100;
  if (!Number.isFinite(max) || max <= 0) throw new RangeError('Progress maximum must be finite and positive.');
  const container = element(document, 'div', 'ds-progress');
  const label = element(document, 'label', 'ds-progress__label', options.label);
  label.id = `${options.id}-label`;
  label.htmlFor = options.id;
  const progress = element(document, 'progress', 'ds-progress__control');
  progress.id = options.id;
  progress.max = max;
  progress.setAttribute('aria-labelledby', label.id);
  const status = element(document, 'p', 'ds-progress__status');
  status.id = `${options.id}-status`;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  progress.setAttribute('aria-describedby', status.id);
  container.append(label, progress, status);

  function setValue(value: number | null, message?: string): void {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) {
      throw new RangeError('Progress value must be null or a finite number within the declared range.');
    }
    if (value === null) progress.removeAttribute('value');
    else progress.value = value;
    status.textContent =
      message ??
      (value === null ? '진행 중 · 완료 비율을 계산하고 있습니다.' : `${Math.round((value / max) * 100)}% 완료`);
  }

  setValue(options.value ?? null);
  return { element: container, progress, setValue };
}

export interface ToastRegion {
  readonly element: HTMLElement;
  show(message: string): () => void;
  clear(): void;
}

/** Notices remain until dismissed so slow readers never race a timer. */
export function createToastRegion(document: Document, options: { readonly label?: string } = {}): ToastRegion {
  const region = element(document, 'section', 'ds-toast-region');
  region.setAttribute('aria-label', options.label ?? '알림');
  region.setAttribute('tabindex', '-1');
  const announcements = element(document, 'div', 'ds-sr-only');
  announcements.setAttribute('role', 'status');
  announcements.setAttribute('aria-atomic', 'true');
  const messages = element(document, 'div', 'ds-toast-region__messages');
  region.append(announcements, messages);

  function show(message: string): () => void {
    const toast = element(document, 'div', 'ds-toast');
    const text = element(document, 'span', 'ds-toast__message', message);
    const close = createButton(document, {
      label: '닫기',
      variant: 'secondary',
      onClick: dismiss
    });
    close.classList.add('ds-toast__dismiss');
    close.setAttribute('aria-label', `알림 닫기: ${message}`);
    toast.append(text, close);
    messages.append(toast);
    announcements.replaceChildren(element(document, 'span', '', message));

    function dismiss(): void {
      const heldFocus = toast.contains(document.activeElement);
      const next =
        toast.nextElementSibling?.querySelector<HTMLButtonElement>('button') ??
        toast.previousElementSibling?.querySelector<HTMLButtonElement>('button');
      toast.remove();
      if (heldFocus) (next ?? region).focus();
    }

    return dismiss;
  }

  return {
    element: region,
    show,
    clear() {
      const heldFocus = messages.contains(document.activeElement);
      messages.replaceChildren();
      announcements.replaceChildren();
      if (heldFocus) region.focus();
    }
  };
}
