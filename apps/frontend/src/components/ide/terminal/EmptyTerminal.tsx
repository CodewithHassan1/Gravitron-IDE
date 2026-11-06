import React from 'react';
import { Terminal as TerminalIcon, Plus } from 'lucide-react';
import { TerminalUIHelper } from './TerminalUIHelper';
import { useTerminalStore } from '../../../stores/ide/terminalStore';

export function EmptyTerminal() {
  const addGroup = useTerminalStore((state) => state.addGroup);

  const handleNewTerminal = () => {
    const groupId = `group_${Date.now()}`;
    addGroup({
      id: groupId,
      tabs: [],
      activeTabId: null,
    });
    TerminalUIHelper.createTerminal(groupId);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full text-muted-foreground bg-background">
      <TerminalIcon className="w-12 h-12 mb-4 opacity-50" />
      <p className="text-sm mb-4">No terminals open</p>
      <button
        className="flex items-center px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded text-sm transition-colors"
        onClick={handleNewTerminal}
      >
        <Plus className="w-4 h-4 mr-2" />
        New Terminal
      </button>
    </div>
  );
}
