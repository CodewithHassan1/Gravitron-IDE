import React from 'react';
import { IDEProvider } from './IDEProvider';
import { LayoutManager } from './LayoutManager';

export function IDE({ workspaceId }: { workspaceId?: string }) {
  return (
    <IDEProvider workspaceId={workspaceId}>
      <div className="flex-1 overflow-hidden relative w-full h-full">
        <LayoutManager />
      </div>
    </IDEProvider>
  );
}
