import React from 'react';
import { TerminalSplitGroup, useTerminalStore } from '../../../stores/ide/terminalStore';
import { TerminalTab } from './TerminalTab';
import { TerminalToolbar } from './TerminalToolbar';

interface TerminalTabsProps {
  group: TerminalSplitGroup;
}

export function TerminalTabs({ group }: TerminalTabsProps) {
  const setActiveGroup = useTerminalStore(state => state.setActiveGroup);
  
  return (
    <div 
      className="flex items-center h-9 bg-card w-full shrink-0 relative z-10"
      onClick={() => setActiveGroup(group.id)}
    >
      <div className="flex flex-1 h-full overflow-x-auto custom-scrollbar">
        {group.tabs.map(tab => (
          <TerminalTab 
            key={tab.id} 
            groupId={group.id} 
            tab={tab} 
            isActive={tab.id === group.activeTabId} 
          />
        ))}
        <div className="flex-1 border-b border-border" />
      </div>
      
      <TerminalToolbar groupId={group.id} />
    </div>
  );
}
