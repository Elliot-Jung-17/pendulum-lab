import { eventBus } from './EventBus';

export type CommandHandler = () => void | Promise<void>;

export interface Command {
  id: string;
  label: string;
  description: string;
  run: CommandHandler;
  keyboard?: string;
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  register(command: Command): void {
    if (this.commands.has(command.id)) throw new Error(`duplicate command id: ${command.id}`);
    this.commands.set(command.id, Object.freeze(command));
  }

  upsert(command: Command): void {
    this.commands.set(command.id, Object.freeze(command));
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  list(): Command[] {
    return [...this.commands.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async run(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`unknown command: ${id}`);
    await command.run();
  }
}

export const commandRegistry = new CommandRegistry();

export function installDefaultCommands(): void {
  commandRegistry.upsert({
    id: 'simulation.toggle',
    label: 'Toggle simulation',
    description: 'Start or pause the active simulation.',
    keyboard: 'Space',
    run: () => {
      eventBus.emit('simulation:toggle', { source: 'command' });
      document.getElementById('pauseBtn')?.click();
    }
  });
  commandRegistry.upsert({
    id: 'simulation.reset',
    label: 'Reset simulation',
    description: 'Reset state through the legacy reset control.',
    keyboard: 'R',
    run: () => {
      eventBus.emit('simulation:reset', { source: 'command' });
      document.getElementById('resetBtn')?.click();
    }
  });
  commandRegistry.upsert({
    id: 'validation.run',
    label: 'Run validation',
    description: 'Run the active validation suite.',
    run: () => {
      eventBus.emit('validation:run', { profile: 'standard' });
      document.getElementById('runValidation')?.click();
    }
  });
  commandRegistry.upsert({
    id: 'export.manifest',
    label: 'Export manifest',
    description: 'Export the current reproducibility manifest.',
    run: () => {
      eventBus.emit('export:manifest', { source: 'command' });
      const button = document.querySelector<HTMLElement>('[data-rail-action="manifest"], #dlJsonBtn');
      button?.click();
    }
  });
}
