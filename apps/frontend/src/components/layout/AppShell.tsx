'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav } from '../ide/TopNav';
import { StatusBar } from '../ide/StatusBar';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';
import { WorkspaceLifecycleState } from '../../services/workspace/types';
import { FirstLaunchSetupWizard } from '../ide/models/FirstLaunchSetupWizard';
import { ModelMarketplaceView } from '../ide/models/ModelMarketplaceView';
import { useModelStore } from '../../stores/useModelStore';
import { modelManager } from '../../services/models/ModelManager';
import { X } from 'lucide-react';

const AUTH_PATHS = [
  '/',
  '/index',
  '/login',
  '/signup',
  '/auth',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lifecycleState = useWorkspaceStore((state) => state.lifecycleState);
  const isMarketplaceOpen = useModelStore((s) => s.isMarketplaceOpen);
  const setMarketplaceOpen = useModelStore((s) => s.setMarketplaceOpen);
  const setSetupWizardOpen = useModelStore((s) => s.setSetupWizardOpen);
  const refreshLocalModels = useModelStore((s) => s.refreshLocalModels);
  const applyDownloadProgress = useModelStore((s) => s.applyDownloadProgress);
  const applyRuntimeStatus = useModelStore((s) => s.applyRuntimeStatus);

  // 1. Auth Routing Bypass (normalize .html suffix for static Electron app:// routes)
  const normalizedPath = (pathname || '/').replace(/\.html$/i, '') || '/';
  const isAuthPage = AUTH_PATHS.some(
    (path) => normalizedPath === path || (path !== '/' && normalizedPath.startsWith(path + '/'))
  );

  useEffect(() => {
    if (!modelManager.isAvailable()) return;
    const unsubProgress = modelManager.subscribeDownloadProgress((p) => {
      applyDownloadProgress(p);
    });
    const unsubRuntime = modelManager.subscribeRuntimeStatus((r) => {
      applyRuntimeStatus(r);
    });
    void refreshLocalModels().then((snap) => {
      if (snap && !snap.setupCompleted && !isAuthPage) {
        setSetupWizardOpen(true);
      }
    });
    return () => {
      unsubProgress();
      unsubRuntime();
    };
  }, [applyDownloadProgress, applyRuntimeStatus, isAuthPage, refreshLocalModels, setSetupWizardOpen]);

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
      <FirstLaunchSetupWizard />
      {isMarketplaceOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gravitron Model Marketplace"
        >
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <img src="/brand/gravitron-mark.png" alt="Gravitron" className="w-5 h-5 object-contain" />
                <span className="text-sm font-semibold text-zinc-100">Model Marketplace</span>
              </div>
              <button
                type="button"
                onClick={() => setMarketplaceOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                aria-label="Close Model Marketplace"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ModelMarketplaceView />
          </div>
        </div>
      )}
    </div>
  );
}
