// Force TS cache invalidation
import React from 'react';
import { Menubar } from '../../ui/menubar';
import { useMenuState } from '../../../hooks/useMenuState';
import { MenuId } from '@ag/protocol';
import { MenuDropdown } from './WorkbenchMenuDropdown';

import { MenuRegistry } from '@ag/core';

export function WorkbenchMenu() {
  const menuItems = useMenuState(MenuId.Menubar);

  console.log("=== WORKBENCH MENU RENDER ===");
  console.log("MenuItems for Menubar:", MenuRegistry.getMenuItems(MenuId.Menubar));

  return (
    <Menubar className="border-none bg-transparent h-8 p-0">
      {menuItems.map((item) => (
        <MenuDropdown key={item.id} model={item} />
      ))}
    </Menubar>
  );
}
