import { commandRegistry, installDefaultCommands } from './CommandRegistry';
import { eventBus } from './EventBus';
import { stateStore } from '../state/StateStore';
import { physicsAdapter } from '../physics';

const LEGACY_CLICK_PROP = 'onclick';

export function installLegacyBridge(): void {
  installDefaultCommands();
  stateStore.syncFromLegacy();

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      void commandRegistry.run('simulation.toggle');
    }
    if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void commandRegistry.run('simulation.reset');
    }
  });

  migrateOnClickHandlers();
  setInterval(() => stateStore.syncFromLegacy(), 2_000);

  const runtimeApi = Object.freeze({
    version: '10.1.0',
    commands: commandRegistry,
    events: eventBus,
    state: stateStore,
    physics: physicsAdapter
  });
  window.PendulumLabIndex = runtimeApi;
}

export function migrateOnClickHandlers(root: ParentNode = document): number {
  let migrated = 0;
  root.querySelectorAll<HTMLElement>('button, [role="button"], input[type="button"], input[type="submit"]').forEach((element) => {
    const existing = element[LEGACY_CLICK_PROP] as ((this: HTMLElement, ev: Event) => unknown) | null;
    if (typeof existing !== 'function' || element.dataset.commandMigrated === 'true') return;
    const id = element.id ? `legacy.${element.id}` : `legacy.${element.dataset.railAction ?? migrated}`;
    commandRegistry.upsert({
      id,
      label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? id,
      description: 'Migrated legacy onclick handler.',
      run: () => {
        existing.call(element, new MouseEvent('click', { bubbles: true }));
      }
    });
    element.addEventListener('click', (event) => {
      eventBus.emit('state:changed', { reason: `command:${id}` });
      return existing.call(element, event);
    });
    element[LEGACY_CLICK_PROP] = null;
    element.dataset.commandMigrated = 'true';
    migrated += 1;
  });
  return migrated;
}
