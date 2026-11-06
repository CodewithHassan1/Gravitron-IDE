import { Shortcut } from './Shortcut';
import { ShortcutParser } from './ShortcutParser';
import { ShortcutFormatter } from './ShortcutFormatter';

export interface Keybinding {
  commandId: string;
  shortcut: Shortcut;
  when?: string; // Optional context condition (will become AST later)
}

export interface Disposable {
  dispose(): void;
}

class ShortcutRegistryImpl {
  private keybindings: Keybinding[] = [];

  registerKeybinding(commandId: string, shortcutStr: string, when?: string): Disposable {
    const shortcut = ShortcutParser.parse(shortcutStr);
    const accel = ShortcutFormatter.toElectronAccelerator(shortcut);
    const existingIndex = this.keybindings.findIndex(
      (k) =>
        k.commandId === commandId &&
        k.when === when &&
        ShortcutFormatter.toElectronAccelerator(k.shortcut) === accel
    );

    const keybinding: Keybinding = { commandId, shortcut, when };
    if (existingIndex > -1) {
      this.keybindings[existingIndex] = keybinding;
    } else {
      this.keybindings.push(keybinding);
    }

    return {
      dispose: () => {
        const index = this.keybindings.indexOf(keybinding);
        if (index > -1) {
          this.keybindings.splice(index, 1);
        }
      },
    };
  }

  getKeybindingsForCommand(commandId: string): Keybinding[] {
    return this.keybindings.filter((k) => k.commandId === commandId);
  }

  getPrimaryShortcut(commandId: string): Shortcut | undefined {
    // Return the first unconditional keybinding, or just the first one if all are conditional
    const bindings = this.getKeybindingsForCommand(commandId);
    if (bindings.length === 0) return undefined;

    const unconditional = bindings.find((b) => !b.when);
    return unconditional ? unconditional.shortcut : bindings[0].shortcut;
  }

  getPrimaryAccelerator(commandId: string): string | undefined {
    const shortcut = this.getPrimaryShortcut(commandId);
    if (!shortcut) return undefined;
    return ShortcutFormatter.toElectronAccelerator(shortcut);
  }
}

export const ShortcutRegistry = new ShortcutRegistryImpl();
