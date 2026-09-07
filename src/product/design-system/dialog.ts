export interface DialogOptions {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly content: Node;
  readonly closeLabel?: string;
  readonly onClose?: (value: string) => void;
}

export interface Dialog {
  readonly element: HTMLDialogElement;
  /** Append element before opening. An explicit trigger takes priority over current focus. */
  open(trigger?: HTMLElement): void;
  close(value?: string): void;
  dispose(): void;
}

interface ModalEntry {
  readonly element: HTMLDialogElement;
  close(value?: string): void;
}

const modalStacks = new WeakMap<Document, ModalEntry[]>();
const focusSelector =
  'a[href],area[href],button,input,select,textarea,summary,iframe,[contenteditable="true"],[tabindex]';

function focusableElements(element: HTMLDialogElement): HTMLElement[] {
  const visible = [...element.querySelectorAll<HTMLElement>(focusSelector)].filter((node) => {
    const visibility = element.ownerDocument.defaultView?.getComputedStyle(node).visibility;
    return (
      node.tabIndex >= 0 &&
      !node.matches(':disabled') &&
      !node.closest('[inert]') &&
      node.getClientRects().length > 0 &&
      visibility !== 'hidden' &&
      visibility !== 'collapse'
    );
  });
  return visible
    .filter((node) => {
      if (!node.matches('input[type="radio"]')) return true;
      const radio = node as HTMLInputElement;
      if (!radio.name) return true;
      const group = visible.filter(
        (candidate): candidate is HTMLInputElement =>
          candidate.matches('input[type="radio"]') &&
          (candidate as HTMLInputElement).name === radio.name &&
          (candidate as HTMLInputElement).form === radio.form
      );
      // Native sequential navigation visits the checked radio, or one radio when
      // none is checked. Counting every radio would miss the real tab boundary.
      return (group.find((candidate) => candidate.checked) ?? group[0]) === radio;
    })
    .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
}

/** Native modal semantics plus deterministic tab wrapping, nested close order and focus restoration. */
export function createDialog(document: Document, options: DialogOptions): Dialog {
  const element = document.createElement('dialog');
  element.id = options.id;
  element.className = 'ds-dialog';
  element.setAttribute('aria-modal', 'true');
  const header = document.createElement('div');
  header.className = 'ds-dialog__header';
  const title = document.createElement('h2');
  title.id = `${options.id}-title`;
  title.className = 'ds-dialog__title';
  title.textContent = options.title;
  element.setAttribute('aria-labelledby', title.id);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ds-button ds-button--secondary';
  closeButton.textContent = options.closeLabel ?? '닫기';
  header.append(title, closeButton);
  element.append(header);
  if (options.description !== undefined) {
    const description = document.createElement('p');
    description.id = `${options.id}-description`;
    description.className = 'ds-dialog__description';
    description.textContent = options.description;
    element.setAttribute('aria-describedby', description.id);
    element.append(description);
  }
  const body = document.createElement('div');
  body.className = 'ds-dialog__body';
  body.append(options.content);
  element.append(body);
  const stack = modalStacks.get(document) ?? [];
  modalStacks.set(document, stack);
  let trigger: HTMLElement | null = null;
  let shown = false;
  let disposed = false;
  const entry: ModalEntry = { element, close };

  function finish(value: string): void {
    if (!shown) return;
    shown = false;
    // Closing/removing a parent also closes dialogs opened above it, in reverse order.
    const index = stack.indexOf(entry);
    if (index >= 0) {
      for (const child of stack.slice(index + 1).reverse()) child.close('parent-closed');
      stack.splice(stack.indexOf(entry), 1);
    }
    const focusTarget = trigger;
    trigger = null;
    if (focusTarget?.isConnected && !focusTarget.closest('[inert]')) focusTarget.focus();
    if (!disposed) options.onClose?.(value);
  }
  function close(value = ''): void {
    if (!shown) return;
    // Native close removes the modal from the top layer before restoring focus.
    if (element.open) element.close(value);
    finish(value);
  }
  const onClose = () => {
    // A queued close event from an earlier opening must not close a reopened dialog.
    if (!element.open) finish(element.returnValue);
  };
  const onCancel = (event: Event) => {
    if (stack.at(-1) !== entry) return;
    event.preventDefault();
    close('cancel');
  };
  const onClick = () => close('close');
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || stack.at(-1) !== entry) return;
    const targets = focusableElements(element);
    const first = targets[0] ?? closeButton;
    const last = targets.at(-1) ?? closeButton;
    const active = document.activeElement;
    const outsideTabOrder = !targets.some((target) => target === active);
    if (event.shiftKey && (active === first || outsideTabOrder)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outsideTabOrder)) {
      event.preventDefault();
      first.focus();
    }
  };
  closeButton.addEventListener('click', onClick);
  element.addEventListener('cancel', onCancel);
  element.addEventListener('close', onClose);
  element.addEventListener('keydown', onKeydown);
  return {
    element,
    open(focusTrigger) {
      if (disposed) throw new Error('Cannot open a disposed dialog.');
      if (shown) return;
      if (!element.isConnected) throw new Error('Append the dialog before opening it.');
      const active = document.activeElement;
      const candidate = active && 'focus' in active ? (active as HTMLElement) : null;
      trigger = focusTrigger ?? candidate;
      element.returnValue = '';
      shown = true;
      stack.push(entry);
      try {
        // showModal dispatches focus synchronously. Register first so focus
        // handlers can safely open a child or close this dialog immediately.
        element.showModal();
      } catch (error) {
        shown = false;
        const index = stack.indexOf(entry);
        if (index >= 0) stack.splice(index, 1);
        trigger = null;
        throw error;
      }
    },
    close,
    dispose() {
      if (disposed) return;
      disposed = true;
      close('disposed');
      closeButton.removeEventListener('click', onClick);
      element.removeEventListener('cancel', onCancel);
      element.removeEventListener('close', onClose);
      element.removeEventListener('keydown', onKeydown);
      element.remove();
    }
  };
}
