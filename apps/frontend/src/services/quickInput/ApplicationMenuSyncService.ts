import { ContextEngine } from './ContextEngine';
import { systemEventBus, SystemEvents } from '../../lib/events/SystemEvents';
import { MenuRegistry } from '@ag/core';
import { CommandRegistry } from '../../lib/registries/CommandRegistry';
import { MenuId, MenuContribution, MenuStateUpdate } from '@ag/protocol';
import { ShortcutFormatter, ShortcutRegistry } from '@ag/core';

export class ApplicationMenuSyncService {
  private lastStates: Map<string, { enabled: boolean; visible: boolean; checked?: boolean }> = new Map();
  private hasInitialized = false;

  constructor() { }

  public init() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    console.log('[NativeMenuAudit] ApplicationMenuSyncService.init() invoked');
    // First build the entire tree
    this.buildAndSendFullMenu();

    // Listen for context changes and send deltas
    systemEventBus.on(SystemEvents.ContextChanged, () => {
      this.syncDeltas();
    });

    // Listen for commands requested by backend menu
    if (typeof window !== 'undefined' && (window as any).agApi) {
      (window as any).agApi.window.onMenuCommand((commandId: string) => {
        CommandRegistry.executeCommand(commandId);
      });
    }
  }

  private buildAndSendFullMenu() {
    if (typeof window === 'undefined' || !(window as any).agApi) return;

    // Build the top level menubar
    const menuTree = this.buildMenuTree(MenuId.Menubar);
    console.log('[NativeMenuAudit] Built menu tree, sending to Electron. Top-level item count:', menuTree.length, 'Total registered contributions:', MenuRegistry.getAllMenus().size);

    (window as any).agApi.window.setApplicationMenu(menuTree);
  }

  private buildMenuTree(menuId: MenuId | string): any[] {
    const items = MenuRegistry.getMenuItems(menuId);
    const result: any[] = [];

    // Group items by their group property to insert separators between groups
    let lastGroup: string | undefined = undefined;

    for (const item of items) {
      if (lastGroup !== undefined && item.group !== lastGroup) {
        result.push({ type: 'separator' });
      }
      lastGroup = item.group;

      const menuItemId = item.menuItemId;
      const command = item.command ? CommandRegistry.getCommand(item.command) : undefined;

      const enabled = command ? CommandRegistry.isEnabled(command) : true;
      const visible = command ? CommandRegistry.isVisible(command) : true;
      const checked = command ? CommandRegistry.isToggled(command) : undefined;

      this.lastStates.set(menuItemId, { enabled, visible, checked });

      // Determine shortcut accelerator string for Electron
      let accelerator: string | undefined = undefined;
      if (item.command) {
        const keybindings = ShortcutRegistry.getKeybindingsForCommand(item.command);
        if (keybindings && keybindings.length > 0) {
          accelerator = ShortcutFormatter.toElectronAccelerator(keybindings[0].shortcut);
        }
      }

      const builtItem: any = {
        menuItemId,
        label: item.title,
        command: item.command,
        enabled,
        visible,
        checked,
        accelerator
      };

      if (item.submenu) {
        builtItem.submenu = this.buildMenuTree(item.submenu);
      }

      result.push(builtItem);
    }

    return result;
  }

  private syncDeltas() {
    if (typeof window === 'undefined' || !(window as any).agApi) return;

    const updates: MenuStateUpdate[] = [];

    this.lastStates.forEach((lastState, menuItemId) => {
      // Find the menu contribution item
      // We need to look it up from all menus (optimally we'd maintain a flat map of menuItemId -> MenuContribution)
      const contribution = this.findContribution(menuItemId);
      if (!contribution) return;

      const command = contribution.command ? CommandRegistry.getCommand(contribution.command) : undefined;
      
      const enabled = command ? CommandRegistry.isEnabled(command) : true;
      const visible = command ? CommandRegistry.isVisible(command) : true;
      const checked = command ? CommandRegistry.isToggled(command) : undefined;

      if (enabled !== lastState.enabled || visible !== lastState.visible || checked !== lastState.checked) {
        updates.push({
          menuItemId,
          enabled: enabled !== lastState.enabled ? enabled : undefined,
          visible: visible !== lastState.visible ? visible : undefined,
          checked: checked !== lastState.checked ? checked : undefined
        });

        this.lastStates.set(menuItemId, { enabled, visible, checked });
      }
    });

    if (updates.length > 0) {
      (window as any).agApi.window.updateMenuState(updates);
    }
  }

  private findContribution(menuItemId: string): MenuContribution | undefined {
    const menus = MenuRegistry.getAllMenus();
    let found: MenuContribution | undefined;
    menus.forEach((items) => {
      if (found) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].menuItemId === menuItemId) {
          found = items[i];
          break;
        }
      }
    });
    return found;
  }
}

export const MenuSyncService = new ApplicationMenuSyncService();
