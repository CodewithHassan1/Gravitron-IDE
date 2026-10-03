import { useState, useEffect } from 'react';
import { MenuId } from '@ag/protocol';
import { MenuViewModel } from '../services/menu/MenuTypes';
import { MenuStateService } from '../services/menu/MenuStateService';

export function useMenuState(menuId: MenuId | string): MenuViewModel[] {
  const [items, setItems] = useState<MenuViewModel[]>([]);

  useEffect(() => {
    // Initial fetch
    setItems(MenuStateService.getMenuTree(menuId));

    // Subscribe to dynamic state changes
    const unsubscribe = MenuStateService.onChange(() => {
      setItems(MenuStateService.getMenuTree(menuId));
    });

    return () => {
      unsubscribe();
    };
  }, [menuId]);

  return items;
}
