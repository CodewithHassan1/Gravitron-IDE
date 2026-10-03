import { Shortcut } from './Shortcut';

export class ShortcutFormatter {
  /**
   * Formats a Shortcut object into an Electron-compatible Accelerator string.
   * Example: { ctrlKey: true, key: 'p' } -> 'CommandOrControl+P'
   */
  static toElectronAccelerator(shortcut: Shortcut): string {
    const parts: string[] = [];

    // Electron usually likes CommandOrControl instead of just Ctrl
    if (shortcut.ctrlKey || shortcut.metaKey) {
      parts.push('CommandOrControl');
    }
    if (shortcut.altKey) {
      parts.push('Alt');
    }
    if (shortcut.shiftKey) {
      parts.push('Shift');
    }

    if (shortcut.key) {
      // Electron expects uppercase characters for single letters
      let key = shortcut.key.toUpperCase();
      if (key === 'UP') key = 'Up';
      if (key === 'DOWN') key = 'Down';
      if (key === 'LEFT') key = 'Left';
      if (key === 'RIGHT') key = 'Right';
      parts.push(key);
    }

    return parts.join('+');
  }

  /**
   * Formats a Shortcut object into a human-readable string for UI display.
   * On Mac, it will use ⌘, ⌥, ⇧. On Windows, Ctrl, Alt, Shift.
   */
  static toHumanReadable(shortcut: Shortcut, isMac: boolean): string {
    const parts: string[] = [];

    if (isMac) {
      if (shortcut.ctrlKey || shortcut.metaKey) parts.push('⌘');
      if (shortcut.altKey) parts.push('⌥');
      if (shortcut.shiftKey) parts.push('⇧');
      if (shortcut.key) parts.push(shortcut.key.toUpperCase());
      return parts.join(''); // Mac shortcuts don't typically use '+'
    } else {
      if (shortcut.ctrlKey) parts.push('Ctrl');
      if (shortcut.metaKey) parts.push('Win');
      if (shortcut.altKey) parts.push('Alt');
      if (shortcut.shiftKey) parts.push('Shift');
      if (shortcut.key) {
        let key = shortcut.key.toUpperCase();
        if (key === 'UP') key = 'UpArrow';
        if (key === 'DOWN') key = 'DownArrow';
        if (key === 'LEFT') key = 'LeftArrow';
        if (key === 'RIGHT') key = 'RightArrow';
        parts.push(key);
      }
      return parts.join('+');
    }
  }
}
