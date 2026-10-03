import { Shortcut } from './Shortcut';

export class ShortcutParser {
  /**
   * Parses a standard string representation of a shortcut (e.g., "Ctrl+Shift+P")
   * into a strongly typed Shortcut object.
   */
  static parse(shortcutStr: string): Shortcut {
    const parts = shortcutStr.split('+').map(p => p.trim().toLowerCase());
    const shortcut: Shortcut = { key: '' };

    for (const part of parts) {
      if (part === 'ctrl' || part === 'control') {
        shortcut.ctrlKey = true;
      } else if (part === 'shift') {
        shortcut.shiftKey = true;
      } else if (part === 'alt') {
        shortcut.altKey = true;
      } else if (part === 'meta' || part === 'cmd' || part === 'command' || part === 'win' || part === 'windows') {
        shortcut.metaKey = true;
      } else {
        // Assume the last part is the key
        shortcut.key = part;
      }
    }

    return shortcut;
  }
}
