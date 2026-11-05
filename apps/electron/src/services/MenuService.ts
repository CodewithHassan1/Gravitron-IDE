import { Menu, MenuItem, MenuItemConstructorOptions, BrowserWindow } from 'electron';
import { Channels } from '@ag/protocol';
import { MenuStateUpdate } from '@ag/protocol/dist/menu';
import { IIpcService, IpcHandlerRegistration } from './IService';
import { ServiceIds } from './ServiceIds';

export class MenuService implements IIpcService {
  public readonly id = ServiceIds.Menu;
  public readonly dependencies = [];

  // We cache MenuItems by their menuItemId
  private menuItemCache: Map<string, MenuItem> = new Map();

  constructor() {}

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.Window.SetApplicationMenu,
        handler: async (menuTree: any[]) => {
          console.log(
            '[NativeMenuAudit] Received SetApplicationMenu IPC with top level items:',
            menuTree.length
          );
          this.menuItemCache.clear();
          const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
          if (!webContents) return { success: false, error: 'No webContents available' };
          const template = this.buildMenuTemplate(menuTree, webContents);
          const menu = Menu.buildFromTemplate(template);
          // Menu.setApplicationMenu(menu); // Removed to enforce React-only workbench menu
          this.populateCache(menu);
          return { success: true };
        },
      },
      {
        channel: Channels.Window.UpdateMenuState,
        handler: async (updates: MenuStateUpdate[]) => {
          for (const update of updates) {
            const item = this.menuItemCache.get(update.menuItemId);
            if (item) {
              if (update.enabled !== undefined) item.enabled = update.enabled;
              if (update.checked !== undefined) item.checked = update.checked;
              if (update.visible !== undefined) item.visible = update.visible;
            }
          }
          return { success: true };
        },
      },
    ];
  }

  private buildMenuTemplate(
    items: any[],
    webContents: Electron.WebContents
  ): MenuItemConstructorOptions[] {
    return items.map((item) => {
      if (item.type === 'separator') {
        return { type: 'separator' };
      }

      const options: MenuItemConstructorOptions = {
        id: item.menuItemId,
        label: item.label,
        enabled: item.enabled ?? true,
        visible: item.visible ?? true,
        accelerator: item.accelerator,
      };

      if (item.checked !== undefined) {
        options.type = 'checkbox';
        options.checked = item.checked;
      }

      if (item.submenu) {
        options.submenu = this.buildMenuTemplate(item.submenu, webContents);
      } else if (item.command) {
        options.click = () => {
          console.log(
            '[NativeMenuAudit] Native menu clicked, sending OnMenuCommand:',
            item.command
          );
          webContents.send(Channels.Window.OnMenuCommand, item.command);
        };
      }

      return options;
    });
  }

  public populateCache(menu: Menu) {
    for (const item of menu.items) {
      if (item.id) {
        this.menuItemCache.set(item.id, item);
      }
      if (item.submenu) {
        this.populateCache(item.submenu);
      }
    }
  }
}
