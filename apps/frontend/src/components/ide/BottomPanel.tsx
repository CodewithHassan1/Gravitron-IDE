import React from 'react';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { TerminalPanel } from './terminal/TerminalPanel';
import { ProblemsPanel } from './ProblemsPanel';

export function BottomPanel() {
  const activeTab = useLayoutStore((state) => state.bottomPanelActiveTab);
  const setActiveTab = useLayoutStore((state) => state.setBottomPanelActiveTab);
  const setBottomPanelOpen = useLayoutStore((state) => state.setBottomPanelOpen);

  const tabs = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'problems', label: 'Problems' },
    { id: 'output', label: 'Output' },
    { id: 'debug', label: 'Debug Console' },
  ];

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <div className="flex items-center justify-between h-9 border-b border-border pr-2">
        <div className="flex h-full">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 text-xs font-medium uppercase tracking-wider h-full border-t-2 transition-colors",
                activeTab === tab.id
                  ? "border-t-primary text-foreground"
                  : "border-t-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              const currentSize = useLayoutStore.getState().bottomPanelSize;
              useLayoutStore.getState().setBottomPanelSize(80); // Maximize
            }}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Maximize Panel Size"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button
            onClick={() => setBottomPanelOpen(false)}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className={cn("flex-1 overflow-hidden", activeTab !== 'terminal' && "p-2 font-mono text-xs overflow-y-auto")}>
        {activeTab === 'terminal' && (
          <TerminalPanel />
        )}
        {activeTab === 'problems' && (
          <ProblemsPanel />
        )}
        {activeTab === 'output' && (
          <div className="text-muted-foreground">
            [IDE] Initialized
          </div>
        )}
        {activeTab === 'debug' && (
          <div className="text-muted-foreground">
            Not debugging.
          </div>
        )}
      </div>
    </div>
  );
}
