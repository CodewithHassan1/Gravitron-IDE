import React from 'react';
import {
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarCheckboxItem,
} from '../../ui/menubar';
import { MenuViewModel } from '../../../services/menu/MenuTypes';
import { CommandRegistry } from '../../../lib/registries/CommandRegistry';

interface MenuItemProps {
  model: MenuViewModel;
}

export function MenuItemComponent({ model }: MenuItemProps) {
  if (model.type === 'separator') {
    return <MenubarSeparator />;
  }

  if (model.type === 'submenu') {
    return null; // Handled by MenuDropdown
  }

  const handleSelect = (e: Event) => {
    if (model.command && model.enabled) {
      CommandRegistry.executeCommand(model.command);
    } else {
      e.preventDefault();
    }
  };

  if (model.checked !== undefined) {
    return (
      <MenubarCheckboxItem
        checked={model.checked}
        disabled={!model.enabled}
        onSelect={handleSelect}
      >
        {model.label}
        {model.shortcut && <MenubarShortcut>{model.shortcut}</MenubarShortcut>}
      </MenubarCheckboxItem>
    );
  }

  return (
    <MenubarItem disabled={!model.enabled} onSelect={handleSelect}>
      {model.label}
      {model.shortcut && <MenubarShortcut>{model.shortcut}</MenubarShortcut>}
    </MenubarItem>
  );
}
