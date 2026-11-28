import React from 'react';
import { ViewRegistry } from '../../lib/registries/ViewRegistry';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { Bot, X } from 'lucide-react';
import { AIChatPanel } from './ai/AIChatPanel';
import { cn } from '@/lib/utils';

const SECONDARY_TAB_IDS = ['ai-chat', 'agent-tasks', 'planning', 'context', 'memory', 'logs'];

const SECONDARY_TAB_LABELS: Record<string, string> = {
  'ai-chat': 'Chat',
  'agent-tasks': 'Tasks',
  planning: 'Plan & MCP',
  context: 'Context',
  memory: 'Memory',
  logs: 'Logs',
};

export function SecondarySidebar() {
  const activeSecondaryActivity = useLayoutStore((state) => state.activeSecondaryActivity);
  const setActiveSecondaryActivity = useLayoutStore((state) => state.setActiveSecondaryActivity);
  const setSecondarySidebarOpen = useLayoutStore((state) => state.setSecondarySidebarOpen);

  // Safe fallback to 'ai-chat' if view does not exist in registry
  const resolvedActivity = ViewRegistry.get(activeSecondaryActivity)
    ? activeSecondaryActivity
    : 'ai-chat';
  const view = ViewRegistry.get(resolvedActivity) || ViewRegistry.get('ai-chat');

  const tabs = SECONDARY_TAB_IDS.map((id) => ViewRegistry.get(id)).filter(
    (v): v is NonNullable<typeof v> => Boolean(v)
  );

  const ActiveIcon = view?.icon || Bot;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0e] h-full border-l border-zinc-800/80">
      {/* Compact Workspace View Switcher Strip so all Agent Workspace views are 1 click away */}
      {tabs.length > 1 && (
        <div className="px-2 py-1.5 flex items-center justify-between gap-1 border-b border-zinc-800/80 bg-[#0a0a0d] shrink-0 select-none">
          <div className="flex flex-wrap items-center gap-0.5 min-w-0 flex-1">
            {tabs.map((tab) => {
              const Icon = tab.icon || Bot;
              const isActive = resolvedActivity === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSecondaryActivity(tab.id)}
                  title={tab.title}
                  className={cn(
                    'px-1.5 py-1 rounded-md text-[10px] font-medium flex items-center space-x-1 transition-colors shrink-0',
                    isActive
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/70'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  )}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span>{SECONDARY_TAB_LABELS[tab.id] || tab.title}</span>
                </button>
              );
            })}
          </div>

          {resolvedActivity !== 'ai-chat' && (
            <button
              type="button"
              onClick={() => setSecondarySidebarOpen(false)}
              title="Close Secondary Side Bar"
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Keep AIChatPanel continuously mounted across Secondary view switches so
          active sessions, event streams, and UI state are never destroyed. */}
      <div
        className={cn(
          'flex-1 flex flex-col overflow-hidden',
          resolvedActivity !== 'ai-chat' && 'hidden'
        )}
      >
        <AIChatPanel />
      </div>

      {/* Supporting Secondary diagnostic/specialist views */}
      {resolvedActivity !== 'ai-chat' && view && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0e] select-none">
          <div className="h-9 px-3 flex items-center space-x-2 text-xs font-semibold text-zinc-200 shrink-0 border-b border-zinc-800/80 bg-[#0e0e11]">
            <div className="p-1 rounded bg-primary/10 text-primary">
              <ActiveIcon className="w-3.5 h-3.5" />
            </div>
            <span className="uppercase tracking-wider text-[11px] font-bold">{view.title}</span>
          </div>
          <div className="flex-1 overflow-y-auto relative bg-[#0c0c0e]">
            <view.component />
          </div>
        </div>
      )}
    </div>
  );
}
