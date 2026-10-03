import React from 'react';
import { TerminalTabState, useTerminalStore } from '../../../stores/ide/terminalStore';
import { TerminalManager } from '../../../services/terminal';
import { X, Terminal as TerminalIcon } from 'lucide-react';

interface TerminalTabProps {
  groupId: string;
  tab: TerminalTabState;
  isActive: boolean;
}

export function TerminalTab({ groupId, tab, isActive }: TerminalTabProps) {
  const setActiveTab = useTerminalStore(state => state.setActiveTab);
  const removeTab = useTerminalStore(state => state.removeTab);

  return (
    <div 
      className={`group flex items-center h-full px-3 border-r border-border cursor-pointer select-none min-w-[120px] max-w-[200px] transition-colors
        ${isActive ? 'bg-background text-foreground border-b-transparent' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 border-b-border border-b'}`}
      onClick={() => setActiveTab(groupId, tab.id)}
    >
      <TerminalIcon className="w-3.5 h-3.5 mr-2 shrink-0 opacity-70" />
      <span className="text-xs truncate flex-1">{tab.title}</span>
      <div 
        className="ml-2 w-4 h-4 rounded hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          TerminalManager.destroyTerminal(tab.id);
          removeTab(groupId, tab.id);
        }}
      >
        <X className="w-3 h-3" />
      </div>
    </div>
  );
}
