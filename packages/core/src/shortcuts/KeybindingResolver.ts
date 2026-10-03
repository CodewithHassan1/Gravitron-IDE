import { ShortcutRegistry } from './ShortcutRegistry';
import { Shortcut } from './Shortcut';
import { ShortcutFormatter } from './ShortcutFormatter';

export class KeybindingResolver {
  /**
   * Resolves a keyboard event to a command ID, taking context into account.
   * Note: full context evaluation will be wired up later via ContextEngine.
   */
  static resolve(event: KeyboardEvent, activeContexts: string[] = []): string | undefined {
    // Basic mapping of event to Shortcut
    const eventShortcut: Shortcut = {
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      key: event.key.toLowerCase()
    };

    // Very naive implementation for now: just iterate all bindings and find the first match
    // ignoring context. We'll enhance this when ContextEngine AST is built.
    // In a real implementation, we'd format both to a canonical string and compare,
    // or compare the properties directly.
    const bindings = (ShortcutRegistry as any).keybindings; // Internal access for resolver
    
    for (const binding of bindings) {
      if (
        binding.shortcut.key === eventShortcut.key &&
        !!binding.shortcut.ctrlKey === !!eventShortcut.ctrlKey &&
        !!binding.shortcut.shiftKey === !!eventShortcut.shiftKey &&
        !!binding.shortcut.altKey === !!eventShortcut.altKey &&
        !!binding.shortcut.metaKey === !!eventShortcut.metaKey
      ) {
        // Here we'd also check if binding.when is satisfied by activeContexts
        return binding.commandId;
      }
    }
    
    return undefined;
  }
}
