import { MenuContribution, MenuId } from '@ag/protocol';
import { Disposable } from '../shortcuts/ShortcutRegistry';

export class MenuRegistryImpl {
  // Store contributions grouped by menuId
  private contributions: Map<MenuId | string, MenuContribution[]> = new Map();

  registerMenuContribution(contribution: MenuContribution): Disposable {
    let list = this.contributions.get(contribution.menuId);
    if (!list) {
      list = [];
      this.contributions.set(contribution.menuId, list);
    }
    const existingIndex = list.findIndex(c => c.menuItemId === contribution.menuItemId);
    if (existingIndex > -1) {
      list[existingIndex] = contribution;
    } else {
      list.push(contribution);
    }
    console.log(`[NativeMenuAudit] Registered menu contribution: ${contribution.menuItemId} -> ${contribution.menuId}`);

    return {
      dispose: () => {
        const idx = list!.indexOf(contribution);
        if (idx > -1) {
          list!.splice(idx, 1);
        }
      }
    };
  }

  getMenuItems(menuId: MenuId | string): MenuContribution[] {
    const items = this.contributions.get(menuId) || [];
    
    // Sort items by group then order
    return [...items].sort((a, b) => {
      const groupA = a.group || '';
      const groupB = b.group || '';
      if (groupA !== groupB) {
        return groupA.localeCompare(groupB);
      }
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      return orderA - orderB;
    });
  }

  getAllMenus(): Map<MenuId | string, MenuContribution[]> {
    return this.contributions;
  }
}

export const MenuRegistry = new MenuRegistryImpl();
