import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ContextMenuRegistry } from '../../../lib/registries/ContextMenuRegistry';

export function ExplorerContextMenu({ children, nodeIds }: { children: React.ReactNode, nodeIds: string[] }) {
  const actions = ContextMenuRegistry.getActions(nodeIds);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {actions.map((action, idx) => {
          if (action.isSeparator) {
            return <ContextMenuSeparator key={idx} />;
          }
          const Icon = action.icon;
          return (
            <ContextMenuItem key={action.id} onClick={(e: React.MouseEvent) => { e.stopPropagation(); action.execute(nodeIds); }}>
              {Icon && <Icon className="mr-2 h-4 w-4" />}
              {action.label}
              {action.shortcut && <span className="ml-auto text-xs text-muted-foreground">{action.shortcut}</span>}
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
