export enum MenuId {
  Menubar = 'Menubar',
  MenubarFile = 'MenubarFile',
  MenubarEdit = 'MenubarEdit',
  MenubarSelection = 'MenubarSelection',
  MenubarView = 'MenubarView',
  MenubarGo = 'MenubarGo',
  MenubarRun = 'MenubarRun',
  MenubarTerminal = 'MenubarTerminal',
  MenubarHelp = 'MenubarHelp',

  ExplorerContext = 'ExplorerContext',
  EditorContext = 'EditorContext',
  TerminalContext = 'TerminalContext',

  ActivityBar = 'ActivityBar',
  CommandPalette = 'CommandPalette',
}

export const MenuItemId = {
  // File
  NewFile: 'MENU_FILE_NEW_FILE',
  NewFolder: 'MENU_FILE_NEW_FOLDER',
  OpenFile: 'MENU_FILE_OPEN_FILE',
  OpenFolder: 'MENU_FILE_OPEN_FOLDER',
  OpenRecent: 'MENU_FILE_OPEN_RECENT',
  Save: 'MENU_FILE_SAVE',
  SaveAs: 'MENU_FILE_SAVE_AS',
  SaveAll: 'MENU_FILE_SAVE_ALL',
  CloseEditor: 'MENU_FILE_CLOSE_EDITOR',
  CloseFolder: 'MENU_FILE_CLOSE_FOLDER',
  Exit: 'MENU_FILE_EXIT',

  // Edit
  Undo: 'MENU_EDIT_UNDO',
  Redo: 'MENU_EDIT_REDO',
  Cut: 'MENU_EDIT_CUT',
  Copy: 'MENU_EDIT_COPY',
  Paste: 'MENU_EDIT_PASTE',
  Find: 'MENU_EDIT_FIND',
  Replace: 'MENU_EDIT_REPLACE',
  ReplaceInFiles: 'MENU_EDIT_REPLACE_IN_FILES',

  // Selection
  SelectAll: 'MENU_SELECTION_SELECT_ALL',
  ExpandSelection: 'MENU_SELECTION_EXPAND',
  ShrinkSelection: 'MENU_SELECTION_SHRINK',
  AddCursorAbove: 'MENU_SELECTION_ADD_CURSOR_ABOVE',
  AddCursorBelow: 'MENU_SELECTION_ADD_CURSOR_BELOW',

  // Terminal
  NewTerminal: 'MENU_TERMINAL_NEW',
  SplitTerminal: 'MENU_TERMINAL_SPLIT',
  KillTerminal: 'MENU_TERMINAL_KILL',
  RenameTerminal: 'MENU_TERMINAL_RENAME',
} as const;

export type MenuItemIdType = (typeof MenuItemId)[keyof typeof MenuItemId] | string;

export interface MenuStateUpdate {
  menuItemId: string; // The specific menu item ID, NOT the command ID.
  enabled?: boolean;
  checked?: boolean;
  visible?: boolean;
}

export interface CommandMetadata {
  id: string;
  title: string;
  category?: string;
  icon?: string;

  // We keep string here for the definition payload,
  // but internally it will be parsed to a ContextExpression.
  precondition?: string;
  when?: string;
  enablement?: string;
  toggled?: string;
}

export interface MenuContribution {
  contributorId?: string; // Optional so we don't have to specify it everywhere
  menuId: MenuId | string;
  menuItemId: MenuItemIdType;
  command?: string; // The command ID (e.g. workbench.action.files.save)

  title?: string; // Used for submenus or overriding command title
  submenu?: MenuId | string; // If this item opens a submenu

  group?: string; // e.g. "1_new", "2_workspace"
  order?: number; // e.g. 100, 200
  alt?: string; // Command ID for alternate action (e.g. holding Alt)

  // We can override command properties for a specific menu item
  when?: string;
  toggled?: string;
  icon?: string;
}
