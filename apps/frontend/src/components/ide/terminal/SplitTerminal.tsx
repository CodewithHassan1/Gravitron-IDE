import React from 'react';
import { TerminalSplitGroup } from '../../../stores/ide/terminalStore';
import { TerminalTabs } from './TerminalTabs';
import { TerminalInstance } from './TerminalInstance';

interface SplitTerminalProps {
  group: TerminalSplitGroup;
}

export function SplitTerminal({ group }: SplitTerminalProps) {
  // If no tabs, this group shouldn't exist really, but we handle it just in case
  if (group.tabs.length === 0) return null;

  return (
    <div className="flex flex-col w-full h-full bg-background border-r border-border last:border-r-0">
      <TerminalTabs group={group} />
      <div className="flex-1 relative overflow-hidden bg-black min-h-0 min-w-0">
        {group.tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0 px-2 pb-2"
            style={{
              opacity: tab.id === group.activeTabId ? 1 : 0,
              pointerEvents: tab.id === group.activeTabId ? 'auto' : 'none',
              zIndex: tab.id === group.activeTabId ? 10 : 0,
            }}
          >
            <TerminalInstance sessionId={tab.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
