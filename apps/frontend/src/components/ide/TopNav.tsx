'use client';
import React from 'react';
import { Bell, PanelLeft, PanelBottom, PanelRight, Settings } from 'lucide-react';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { CommandService, WorkbenchCommands } from '../../services/command/CommandService';
import Link from 'next/link';
import { WorkbenchMenu } from './menu/WorkbenchMenu';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';
import { WorkspaceLifecycleState } from '../../services/workspace/types';

export function TopNav() {
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const toggleBottomPanel = useLayoutStore((state) => state.toggleBottomPanel);
  const toggleSecondarySidebar = useLayoutStore((state) => state.toggleSecondarySidebar);
  const lifecycleState = useWorkspaceStore((state) => state.lifecycleState);
  const isReady = lifecycleState === WorkspaceLifecycleState.Ready;

  const toggleClass = isReady
    ? 'text-muted-foreground hover:text-foreground transition-colors'
    : 'text-muted-foreground opacity-50 cursor-not-allowed';

  return (
    <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 select-none shrink-0">
      <div className="flex items-center space-x-4 flex-1">
        <div className="font-semibold text-foreground tracking-tight ml-2">Gravitron</div>
        <WorkbenchMenu />
      </div>

      <div className="flex-1 flex justify-center max-w-xl"></div>

      <div className="flex items-center space-x-4 flex-1 justify-end">
        <button disabled={!isReady} className={toggleClass} onClick={toggleSidebar}>
          <PanelLeft className="w-4 h-4" />
        </button>
        <button disabled={!isReady} className={toggleClass} onClick={toggleBottomPanel}>
          <PanelBottom className="w-4 h-4" />
        </button>
        <button disabled={!isReady} className={toggleClass} onClick={toggleSecondarySidebar}>
          <PanelRight className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-border"></div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <Link
          href="/dashboard/settings"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
