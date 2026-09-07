export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: Node;
  readonly disabled?: boolean;
}

export interface TabsOptions {
  /** Unique DOM ID prefix within the owning document. */
  readonly id: string;
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly selectedId?: string;
  readonly onChange?: (id: string) => void;
}

export interface Tabs {
  readonly element: HTMLDivElement;
  readonly selectedId: string;
  select(id: string, focus?: boolean): void;
  dispose(): void;
}

/** Automatically activated horizontal tabs; only the selected tab is in the tab order. */
export function createTabs(document: Document, options: TabsOptions): Tabs {
  const ids = options.items.map((item) => item.id);
  const enabled = options.items.filter((item) => !item.disabled);
  if (!options.id || /\s/.test(options.id) || ids.some((id) => !id || /\s/.test(id))) {
    throw new TypeError('Tabs require nonempty IDs without whitespace.');
  }
  if (new Set(ids).size !== ids.length || !enabled.length) {
    throw new RangeError('Tabs require unique items and at least one enabled tab.');
  }
  let selectedId = options.selectedId ?? enabled[0]!.id;
  if (!enabled.some((item) => item.id === selectedId)) throw new RangeError('Selected tab is unavailable.');
  let disposed = false;
  const element = document.createElement('div');
  element.id = options.id;
  element.className = 'ds-tabs';
  const list = document.createElement('div');
  list.className = 'ds-tabs__list';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', options.label);
  list.setAttribute('aria-orientation', 'horizontal');
  element.append(list);
  const entries = options.items.map((item) => {
    const tab = document.createElement('button');
    tab.id = `${options.id}-tab-${item.id}`;
    tab.type = 'button';
    tab.className = 'ds-tabs__tab';
    tab.textContent = item.label;
    tab.disabled = item.disabled ?? false;
    tab.setAttribute('role', 'tab');
    const panel = document.createElement('div');
    panel.id = `${options.id}-panel-${item.id}`;
    panel.className = 'ds-tabs__panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.setAttribute('aria-controls', panel.id);
    panel.append(item.content);
    const click = () => select(item.id);
    tab.addEventListener('click', click);
    list.append(tab);
    element.append(panel);
    return { item, tab, panel, click };
  });
  function render(): void {
    for (const { item, tab, panel } of entries) {
      const selected = item.id === selectedId;
      tab.tabIndex = selected ? 0 : -1;
      tab.setAttribute('aria-selected', String(selected));
      panel.hidden = !selected;
    }
  }
  function select(id: string, focus = false): void {
    if (disposed) return;
    const next = entries.find((entry) => entry.item.id === id && !entry.item.disabled);
    if (!next) throw new RangeError('Selected tab is unavailable.');
    const changed = selectedId !== id;
    selectedId = id;
    render();
    if (focus) next.tab.focus();
    if (changed) options.onChange?.(id);
  }
  const keydown = (event: KeyboardEvent) => {
    const current = enabled.findIndex((item) => entries.find((entry) => entry.item === item)?.tab === event.target);
    if (current < 0) return;
    const last = enabled.length - 1;
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight'
            ? (current + 1) % enabled.length
            : event.key === 'ArrowLeft'
              ? (current + last) % enabled.length
              : -1;
    if (index < 0) return;
    event.preventDefault();
    select(enabled[index]!.id, true);
  };
  list.addEventListener('keydown', keydown);
  render();
  return {
    element,
    get selectedId() {
      return selectedId;
    },
    select,
    dispose() {
      disposed = true;
      list.removeEventListener('keydown', keydown);
      entries.forEach(({ tab, click }) => tab.removeEventListener('click', click));
      element.remove();
    }
  };
}
