import React, { useEffect, useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../../../components/ui/resizable';
import { useTerminalStore } from '../../../stores/ide/terminalStore';
import { SplitTerminal } from './SplitTerminal';
import { EmptyTerminal } from './EmptyTerminal';
import { TerminalUIHelper } from './TerminalUIHelper';
import { ContextEngine } from '../../../services/quickInput/ContextEngine';

export function TerminalPanel() {
  const groups = useTerminalStore(state => state.groups);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // Restoration is now handled securely via IDEBootstrap and WorkspaceEvents
  }, []);

  if (groups.length === 0) {
    return <EmptyTerminal />;
  }

  return (
    <div 
      className={`w-full h-full flex bg-background transition-all outline-none ${isFocused ? 'ring-1 ring-blue-500' : ''}`}
      tabIndex={-1}
      onFocus={(e) => {
        // Prevent setting focus if it's coming from an inner element that shouldn't trigger it,
        // but generally terminal handles its own focus. We'll listen to the capture phase or just focus within.
        setIsFocused(true);
        ContextEngine.setContext('terminalFocused', true);
        ContextEngine.setContext('editorFocused', false);
        ContextEngine.setContext('explorerFocused', false);
      }}
      onBlur={(e) => {
        // If focus is moving within the terminal, keep it focused
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsFocused(false);
        ContextEngine.setContext('terminalFocused', false);
      }}
    >
      <ResizablePanelGroup direction="horizontal">
        {groups.map((group, index) => (
          <React.Fragment key={group.id}>
            <ResizablePanel minSize={20} className="overflow-hidden">
              <SplitTerminal group={group} />
            </ResizablePanel>
            {index < groups.length - 1 && (
              <ResizableHandle className="w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize z-20" />
            )}
          </React.Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}
