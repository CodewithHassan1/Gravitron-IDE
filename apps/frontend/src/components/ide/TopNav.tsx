'use client';
import React from 'react';
import { Bell, PanelLeft, PanelBottom, PanelRight, Settings, Bot } from 'lucide-react';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { CommandService, WorkbenchCommands } from '../../services/command/CommandService';
import Link from 'next/link';
import { WorkbenchMenu } from './menu/WorkbenchMenu';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';
import { WorkspaceLifecycleState } from '../../services/workspace/types';
import { cn } from '@/lib/utils';

export function TopNav() {
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const toggleBottomPanel = useLayoutStore((state) => state.toggleBottomPanel);
  const toggleSecondarySidebar = useLayoutStore((state) => state.toggleSecondarySidebar);
  const isSecondarySidebarOpen = useLayoutStore((state) => state.isSecondarySidebarOpen);
  const activeSecondaryActivity = useLayoutStore((state) => state.activeSecondaryActivity);
  const toggleAgentWorkspace = useLayoutStore((state) => state.toggleAgentWorkspace);

  const lifecycleState = useWorkspaceStore((state) => state.lifecycleState);
  const isReady = lifecycleState === WorkspaceLifecycleState.Ready;

  const isAgentActive = isSecondarySidebarOpen && activeSecondaryActivity === 'ai-chat';

  const toggleClass = isReady
    ? 'text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted/50'
    : 'text-muted-foreground opacity-50 cursor-not-allowed p-1.5';

  return (
    <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 select-none shrink-0">
      <div className="flex items-center space-x-4 flex-1">
        <div className="font-semibold text-foreground tracking-tight ml-2">Gravitron</div>
        <WorkbenchMenu />
      </div>

      <div className="flex-1 flex justify-center max-w-xl"></div>

      <div className="flex items-center space-x-2 flex-1 justify-end">
        {/* Primary Sidebar Toggle */}
        <button
          disabled={!isReady}
          title="Toggle Primary Side Bar"
          aria-label="Toggle Primary Side Bar"
          className={toggleClass}
          onClick={toggleSidebar}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Bottom Panel Toggle */}
        <button
          disabled={!isReady}
          title="Toggle Panel"
          aria-label="Toggle Panel"
          className={toggleClass}
          onClick={toggleBottomPanel}
        >
          <PanelBottom className="w-4 h-4" />
        </button>

        {/* Secondary Sidebar Toggle */}
        <button
          disabled={!isReady}
          title="Toggle Secondary Side Bar"
          aria-label="Toggle Secondary Side Bar"
          className={toggleClass}
          onClick={toggleSecondarySidebar}
        >
          <PanelRight className="w-4 h-4" />
        </button>

        {/* Dedicated AI Agent Workspace Quick Toggle */}
        <button
          disabled={!isReady}
          title="AI Agent Workspace"
          aria-label="AI Agent Workspace"
          className={cn(
            'p-1.5 rounded transition-all flex items-center space-x-1.5',
            isAgentActive
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          onClick={toggleAgentWorkspace}
        >
          <Bot className="w-4 h-4" />
          <span className="text-xs font-semibold hidden lg:inline">AI Agent</span>
        </button>

        <div className="h-4 w-px bg-border/60 mx-1"></div>

        <button
          title="Notifications"
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted/50"
        >
          <Bell className="w-4 h-4" />
        </button>

        <Link
          href="/dashboard/settings"
          title="Settings"
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted/50"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
