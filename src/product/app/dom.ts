/** Small, text-only DOM helpers for the parallel app shell. */
export function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function link(document: Document, text: string, href: string, className = 'product-link'): HTMLAnchorElement {
  const node = element(document, 'a', className, text);
  node.href = href;
  return node;
}

export function pageHeading(document: Document, text: string): HTMLHeadingElement {
  const heading = element(document, 'h1', 'product-title', text);
  heading.tabIndex = -1;
  return heading;
}

export function availabilityNote(document: Document, title: string, description: string): HTMLElement {
  const note = element(document, 'section', 'product-availability');
  note.append(element(document, 'h2', 'product-note-title', title), element(document, 'p', '', description));
  return note;
}
