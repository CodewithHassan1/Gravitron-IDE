'use client';

import { useWorkspaceStore } from '@/stores/ide/workspaceStore';
import { WorkspaceLifecycleState } from '@/services/workspace/types';
import dynamic from 'next/dynamic';

const IDE = dynamic(() => import('@/components/ide/IDE').then((m) => m.IDE), { ssr: false });

export default function DashboardPage() {
  const lifecycleState = useWorkspaceStore((state) => state.lifecycleState);

  if (lifecycleState !== WorkspaceLifecycleState.Empty) {
    // We are in Opening, Initializing, Ready, Closing, or Error state.
    // The IDE component handles its own internal loading states, but we mount it immediately.
    // The AppShell ensures the Status Bar only appears when Ready.
    return <IDE />;
  }

  // Empty Workspace View
  return (
    <div className="p-8 h-full bg-background text-foreground flex flex-col">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed mt-4 bg-muted/20">
        <h3 className="font-medium text-lg mb-1">No recent workspaces</h3>
        <p className="text-sm text-muted-foreground mb-4">Open a folder to get started</p>
      </div>
    </div>
  );
}
