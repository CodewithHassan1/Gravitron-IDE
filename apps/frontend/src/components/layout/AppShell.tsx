'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { TopNav } from '../ide/TopNav';
import { StatusBar } from '../ide/StatusBar';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';
import { WorkspaceLifecycleState } from '../../services/workspace/types';

const AUTH_PATHS = ['/', '/login', '/signup', '/auth'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lifecycleState = useWorkspaceStore((state) => state.lifecycleState);

  // 1. Auth Routing Bypass
  const isAuthPage = AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );

  if (isAuthPage) {
    return <main className="flex-1 overflow-auto bg-background text-foreground">{children}</main>;
  }

  // 2. Global Shell Structure
  const isReady = lifecycleState === WorkspaceLifecycleState.Ready;

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <TopNav />
      <main className="flex-1 overflow-hidden relative">{children}</main>
      {isReady && <StatusBar />}
    </div>
  );
}
