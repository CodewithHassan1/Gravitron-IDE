// Force TS cache invalidation
import React from 'react';
import {
  MenubarContent,
  MenubarMenu,
  MenubarTrigger,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from '../../ui/menubar';
import { MenuViewModel } from '../../../services/menu/MenuTypes';
import { MenuItemComponent } from './MenuItemComponent';

interface MenuDropdownProps {
  model: MenuViewModel;
  isSubmenu?: boolean;
}

export function MenuDropdown({ model, isSubmenu = false }: MenuDropdownProps) {
  if (model.type === 'separator') return null; // Root level or submenu trigger level separators don't make sense

  if (isSubmenu) {
    return (
      <MenubarSub>
        <MenubarSubTrigger disabled={!model.enabled}>{model.label}</MenubarSubTrigger>
        <MenubarSubContent>
          {model.children?.map((child, idx) =>
            child.type === 'submenu' ? (
              <MenuDropdown key={child.id || idx} model={child} isSubmenu={true} />
            ) : (
              <MenuItemComponent key={child.id || idx} model={child} />
            )
          )}
        </MenubarSubContent>
      </MenubarSub>
    );
  }

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-sm font-medium cursor-pointer">{model.label}</MenubarTrigger>
      <MenubarContent>
        {model.children?.map((child, idx) =>
          child.type === 'submenu' ? (
            <MenuDropdown key={child.id || idx} model={child} isSubmenu={true} />
          ) : (
            <MenuItemComponent key={child.id || idx} model={child} />
          )
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
