'use client';
import { CheckCircle2, GitBranch, RefreshCw, XCircle, Bell, TerminalSquare } from 'lucide-react';
import { useStatusBarStore } from '../../stores/ide/statusBarStore';
import { useEditorLayoutStore } from '../../stores/ide/editorLayoutStore';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';

export function StatusBar() {
  const { data } = useStatusBarStore();
  const layout = useEditorLayoutStore();
  const activeGroup = layout.groups.find((g) => g.id === layout.activeGroupId) || layout.groups[0];
  const activeTab = activeGroup?.tabs.find((t) => t.id === activeGroup.activeTabId);
  const workspace = useWorkspaceStore();

  return (
    <div className="h-6 bg-primary text-primary-foreground text-xs flex items-center justify-between px-2 font-mono shrink-0 select-none">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <GitBranch className="w-3 h-3" />
          <span>{data.git.branch}*</span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          {data.git.status === 'syncing' ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          <span>{data.git.status === 'syncing' ? 'Syncing...' : 'Synced'}</span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <XCircle className="w-3 h-3 text-red-300" />
          <span>{data.git.changes}</span>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <span>Ln 1, Col 1</span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <span>UTF-8</span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <span>{activeTab?.language || 'plaintext'}</span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <TerminalSquare className="w-3 h-3" />
          <span>
            {data.ai.provider} ({data.ai.status})
          </span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors">
          <CheckCircle2 className="w-3 h-3 text-green-300" />
          <span>{workspace.connectionStatus}</span>
        </div>
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-white/20 px-1 rounded transition-colors relative">
          <Bell className="w-3 h-3" />
          {data.notifications.hasUnread && (
            <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-red-500 rounded-full" />
          )}
        </div>
      </div>
    </div>
  );
}
