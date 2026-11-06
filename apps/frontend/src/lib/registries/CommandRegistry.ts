// src/lib/registries/CommandRegistry.ts
import { systemEventBus, SystemEvents } from '../events/SystemEvents';
import { ContextEngine } from '../../services/quickInput/ContextEngine';
import { CommandMetadata } from '@ag/protocol';
import { ShortcutRegistry, Disposable } from '@ag/core';

export interface CommandExecutionContext {
  editorId?: string;
  workspacePath?: string;
  uri?: string;
  language?: string;
  readOnly?: boolean;
  selectionEmpty?: boolean;
}

export interface Command extends CommandMetadata {
  description?: string;
  aliases?: string[];

  // Guards
  requiresWorkspace?: boolean;
  requiresEditor?: boolean;
  requiresGit?: boolean;
  requiresTerminal?: boolean;

  // Handlers
  handler: (context: CommandExecutionContext, ...args: any[]) => Promise<void> | void;
}

class CommandRegistryImpl {
  private commands: Map<string, Command> = new Map();

  has(id: string): boolean {
    return this.commands.has(id);
  }

  registerCommand(command: Command, shortcutStr?: string): Disposable {
    if (this.commands.has(command.id)) {
      this.unregisterCommand(command.id); // Safely overwrite
    }
    this.commands.set(command.id, command);

    let shortcutDisposable: Disposable | undefined;
    if (shortcutStr) {
      shortcutDisposable = ShortcutRegistry.registerKeybinding(command.id, shortcutStr);
      systemEventBus.emit(SystemEvents.CommandRegistered as any, {
        id: command.id,
        shortcut: shortcutStr,
      });
    }

    return {
      dispose: () => {
        this.unregisterCommand(command.id);
        if (shortcutDisposable) shortcutDisposable.dispose();
      },
    };
  }

  unregisterCommand(id: string): boolean {
    const command = this.commands.get(id);
    if (command) {
      systemEventBus.emit(SystemEvents.CommandUnregistered as any, { id });
    }
    return this.commands.delete(id);
  }

  getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  getCommands(): Command[] {
    // Only return commands whose 'when' clause is satisfied if they have one
    return Array.from(this.commands.values()).filter((c) => this.isVisible(c));
  }

  isVisible(c: Command): boolean {
    if (c.when && !ContextEngine.evaluate(c.when)) return false;
    return true;
  }

  isEnabled(c: Command): boolean {
    if (c.requiresWorkspace && !ContextEngine.evaluate('workspaceIsOpen')) return false;
    if (c.requiresEditor && !ContextEngine.evaluate('editorIsOpen')) return false; // Needs editorIsOpen context
    if (c.requiresGit && !ContextEngine.evaluate('gitAvailable')) return false;
    if (c.requiresTerminal && !ContextEngine.evaluate('terminalIsOpen')) return false; // Needs terminalIsOpen

    if (c.enablement && !ContextEngine.evaluate(c.enablement)) return false;
    if (c.precondition && !ContextEngine.evaluate(c.precondition)) return false;
    return true;
  }

  isToggled(c: Command): boolean {
    if (c.toggled && ContextEngine.evaluate(c.toggled)) return true;
    return false;
  }

  private buildContext(): CommandExecutionContext {
    return {
      editorId: ContextEngine.getContext('activeEditorId'),
      workspacePath: ContextEngine.getContext('workspacePath'),
      uri: ContextEngine.getContext('activeEditorUri'),
      language: ContextEngine.getContext('activeEditorLanguage'),
      readOnly: ContextEngine.getContext('editorReadOnly'),
      selectionEmpty: ContextEngine.getContext('selectionEmpty'),
    };
  }

  async executeCommand(id: string, ...args: any[]) {
    const command = this.commands.get(id);
    if (command) {
      if (!this.isEnabled(command)) {
        console.warn(`Command ${id} execution blocked by preconditions or enablement.`);
        return;
      }
      try {
        const context = this.buildContext();
        await command.handler(context, ...args);
        systemEventBus.emit(SystemEvents.CommandExecuted as any, { commandId: id });
      } catch (e) {
        console.error(`Command ${id} failed:`, e);
      }
    } else {
      console.warn(`Command ${id} not found.`);
    }
  }
}

export const CommandRegistry = new CommandRegistryImpl();
