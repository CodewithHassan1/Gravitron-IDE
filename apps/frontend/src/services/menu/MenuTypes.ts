export type MenuViewModel = MenuItemViewModel | MenuSeparatorViewModel;

export interface MenuItemViewModel {
  type: 'item' | 'submenu';
  id: string;
  label: string;
  command?: string;
  icon?: string;
  shortcut?: string;
  enabled: boolean;
  visible: boolean;
  checked?: boolean;
  children?: MenuViewModel[];
}

export interface MenuSeparatorViewModel {
  type: 'separator';
  id: string;
}
