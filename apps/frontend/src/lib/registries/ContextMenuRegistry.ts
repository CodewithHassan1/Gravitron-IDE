import React from 'react';

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: React.ComponentType<any>;
  shortcut?: string;
  execute: (nodeIds: string[]) => void | Promise<void>;
  isVisible?: (nodeIds: string[]) => boolean;
  isSeparator?: boolean;
  group?: string; // e.g. 'navigation', 'modification', 'clipboard'
  order?: number;
}

class ContextMenuRegistryImpl {
  private actions: Map<string, ContextMenuAction> = new Map();

  register(action: ContextMenuAction) {
    this.actions.set(action.id, action);
  }

  getActions(nodeIds: string[]): ContextMenuAction[] {
    const visibleActions = Array.from(this.actions.values()).filter((action) =>
      action.isVisible ? action.isVisible(nodeIds) : true
    );

    // Sort by group and order
    return visibleActions.sort((a, b) => {
      const groupA = a.group || 'z';
      const groupB = b.group || 'z';
      if (groupA !== groupB) return groupA.localeCompare(groupB);
      return (a.order || 0) - (b.order || 0);
    });
  }
}

export const ContextMenuRegistry = new ContextMenuRegistryImpl();
