/**
 * Small shared helpers for the modern analysis-tab takeovers. Cloning a control
 * drops every previously-attached (legacy) listener, so a modern controller can
 * own the element without editing the legacy JS.
 */

/** Replace an element with a clone to drop all previously-attached listeners. */
export function takeOverButton(id: string): HTMLElement | null {
  const el = document.getElementById(id);
  if (!el) return null;
  return takeOverElement(el);
}

/** Replace a specific element with a clone to drop its previously-attached listeners. */
export function takeOverElement(el: Element): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  el.replaceWith(clone);
  return clone;
}

export function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Remove all children of an element (safe alternative to clearing markup directly). */
export function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
