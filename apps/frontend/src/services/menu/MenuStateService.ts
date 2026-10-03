import { systemEventBus, SystemEvents, EventBus } from '../../lib/events/SystemEvents';
import { MenuRegistry, ShortcutRegistry, ShortcutFormatter } from '@ag/core';
import { CommandRegistry } from '../../lib/registries/CommandRegistry';
import { ContextEngine } from '../quickInput/ContextEngine';
import { MenuViewModel } from './MenuTypes';
import { MenuId } from '@ag/protocol';

class MenuStateServiceImpl {
  private eventBus = new EventBus();

  constructor() {

    systemEventBus.on(SystemEvents.ContextChanged, () => {
      this.eventBus.emit('change');
    });

    systemEventBus.on(SystemEvents.CommandRegistered, () => {
      this.eventBus.emit('change');
    });

    systemEventBus.on(SystemEvents.CommandUnregistered, () => {
      this.eventBus.emit('change');
    });

    systemEventBus.on(SystemEvents.MenuRegistered, () => {
      this.eventBus.emit('change');
    });

  }

  public onChange(callback: () => void): () => void {
    return this.eventBus.on('change', callback);
  }

  public getMenuTree(menuId: MenuId | string): MenuViewModel[] {
    const items = MenuRegistry.getMenuItems(menuId);
    const result: MenuViewModel[] = [];
    let lastGroup: string | undefined = undefined;

    for (const item of items) {
      // Commands should never disappear from the workbench menu, they just disable.
      // We still evaluate `when`, but it sets `isEnabled` rather than skipping render.
      let isEnabled = item.when ? ContextEngine.evaluate(item.when) : true;

      // Grouping: insert separator
      if (lastGroup !== undefined && item.group !== lastGroup) {
        result.push({ type: 'separator', id: `separator-${menuId}-${result.length}` });
      }
      lastGroup = item.group;

      let isChecked: boolean | undefined = undefined;

      const command = item.command ? CommandRegistry.getCommand(item.command) : undefined;

      if (command) {
        // Use CommandRegistry's canonical enablement check (which handles requiresWorkspace, etc)
        isEnabled = isEnabled && CommandRegistry.isEnabled(command);
      }

      // Check toggle state: item definition overrides command definition
      const toggleExpr = item.toggled || command?.toggled;
      if (toggleExpr) {
        isChecked = ContextEngine.evaluate(toggleExpr);
      }

      // Formatter shortcut
      let shortcutStr: string | undefined;
      if (item.command) {
        const keybindings = ShortcutRegistry.getKeybindingsForCommand(item.command);
        if (keybindings && keybindings.length > 0) {
          const isMac = typeof navigator !== 'undefined' ? navigator.userAgent.includes('Mac') : false;
          shortcutStr = ShortcutFormatter.toHumanReadable(keybindings[0].shortcut, isMac);
        }
      }

      if (item.submenu) {
        result.push({
          type: 'submenu',
          id: item.menuItemId,
          label: item.title || item.menuItemId,
          icon: item.icon,
          enabled: isEnabled,
          visible: true,
          children: this.getMenuTree(item.submenu) // Recursive building!
        });
      } else {
        result.push({
          type: 'item',
          id: item.menuItemId,
          label: item.title || item.menuItemId,
          command: item.command,
          icon: item.icon,
          shortcut: shortcutStr,
          enabled: isEnabled,
          visible: true,
          checked: isChecked
        });
      }
    }

    return result;
  }
}

export const MenuStateService = new MenuStateServiceImpl();
