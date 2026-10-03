import { CommandRegistry } from '../../lib/registries/CommandRegistry';
import { systemEventBus, SystemEvents } from '../../lib/events/SystemEvents';

interface ShortcutMapping {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  commandId: string;
}

export class ShortcutManagerImpl {
  private shortcuts: ShortcutMapping[] = [];
  private boundKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

  constructor() {
    systemEventBus.on(SystemEvents.CommandRegistered, (payload: any) => {
      if (payload && payload.shortcut && payload.id) {
        this.bindShortcutString(payload.shortcut, payload.id);
      }
    });

    systemEventBus.on(SystemEvents.CommandUnregistered, (payload: any) => {
      if (payload && payload.id) {
        this.unbindShortcutString(payload.id);
      }
    });
  }

  // Used strictly internally or by plugins mapping pure keys
  registerShortcut(mapping: ShortcutMapping) {
    if (mapping && mapping.key) {
      this.shortcuts.push(mapping);
    }
  }

  // Parses VS Code style shortcut strings: "Ctrl+Shift+P" or "Ctrl++"
  bindShortcutString(shortcutStr: string, commandId: string) {
    if (!shortcutStr || typeof shortcutStr !== 'string') return;

    // Handle "+" as key explicitly (e.g. "Ctrl++")
    const isPlusKey = shortcutStr.endsWith('++');
    const normalizedStr = isPlusKey ? shortcutStr.slice(0, -1) : shortcutStr;
    const parts = normalizedStr.toLowerCase().split('+').map(p => p.trim()).filter(Boolean);

    const key = isPlusKey ? '+' : parts[parts.length - 1];
    if (!key) return;

    const mapping: ShortcutMapping = {
      key,
      ctrlKey: parts.includes('ctrl') || parts.includes('cmd'),
      shiftKey: parts.includes('shift'),
      altKey: parts.includes('alt') || parts.includes('option'),
      commandId
    };

    // Replace if exists
    this.unbindShortcutString(commandId);
    this.shortcuts.push(mapping);
  }

  unbindShortcutString(commandId: string) {
    this.shortcuts = this.shortcuts.filter(s => s.commandId !== commandId);
  }

  unregisterShortcut(commandId: string) {
    this.unbindShortcutString(commandId);
  }

  handleKeyDown(e: KeyboardEvent) {
    if (!e || typeof e.key !== 'string') return;

    for (const shortcut of this.shortcuts) {
      if (!shortcut.key || typeof shortcut.key !== 'string') continue;

      const matchCtrl = shortcut.ctrlKey ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const matchShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
      const matchAlt = shortcut.altKey ? e.altKey : !e.altKey;
      const matchKey = shortcut.key.toLowerCase() === e.key.toLowerCase();

      if (matchCtrl && matchShift && matchAlt && matchKey) {
        e.preventDefault();
        e.stopPropagation();
        CommandRegistry.executeCommand(shortcut.commandId);
        return;
      }
    }
  }

  attach(element: HTMLElement | Document = document) {
    element.addEventListener('keydown', this.boundKeyDown as EventListener);
  }

  detach(element: HTMLElement | Document = document) {
    element.removeEventListener('keydown', this.boundKeyDown as EventListener);
  }
}

export const ShortcutManager = new ShortcutManagerImpl();