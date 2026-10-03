export interface Shortcut {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean; // Command on Mac, Windows key on Win
  key: string;
}
