import React, { useEffect, useRef, useState } from 'react';
import { useCommandStore } from '../../stores/ide/commandStore';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { useTheme } from 'next-themes';
import { GlobalOverlays } from './GlobalOverlays';
import { ShortcutManager } from '../../services/keyboard/ShortcutManager';
import { CommandRegistry } from '../../lib/registries/CommandRegistry';
import { WorkspaceManager } from '../../services/workspace/WorkspaceManager';
import { bootstrapWorkspace } from '../../runtime/IDEBootstrap';
import { useBootstrapStore } from '../../stores/ide/bootstrapStore';
import { LoadingState } from '../ui/LoadingState';
import { useRouter } from 'next/navigation';
import { WorkspaceEvents } from '../../services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../services/workspace/types';

export function IDEProvider({ children, workspaceId }: { children: React.ReactNode; workspaceId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setBootstrapStage = useBootstrapStore((state) => state.setBootstrapStage);
  const setIsBootstrapped = useBootstrapStore((state) => state.setBootstrapped);
  const isBootstrapped = useBootstrapStore((state) => state.isBootstrapped);
  const executeCommand = useCommandStore((state) => state.executeCommand);
  const setSidebarOpen = useLayoutStore((state) => state.setSidebarOpen);
  const setActiveActivity = useLayoutStore((state) => state.setActiveActivity);
  const setCurrentWorkspace = useLayoutStore((state) => state.setCurrentWorkspace);
  const { setTheme, theme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    setIsBootstrapped(false);
    setBootstrapStage('Initializing IDE...');
    
    bootstrapWorkspace((stage) => {
      if (mounted) setBootstrapStage(stage);
    }).then(() => {
      if (mounted) setIsBootstrapped(true);
    });

    CommandRegistry.registerCommand({
      id: "workbench.action.toggleTheme",
      title: "Toggle Theme",
      category: "Preferences",
      handler: () => {
        setTheme(theme === "dark" ? "light" : "dark");
      },
    });

    return () => { mounted = false; };
  }, [setTheme, theme, setBootstrapStage, setIsBootstrapped]);



  useEffect(() => {
    const onNavigate = (event: any) => {
      if (event.payload?.targetUrl) {
        router.push(event.payload.targetUrl);
      }
    };
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceNavigate, onNavigate);
    return () => {
      WorkspaceEvents.off(WorkspaceEventType.WorkspaceNavigate, onNavigate);
    };
  }, [router]);
  useEffect(() => {
    if (workspaceId) {
      setCurrentWorkspace(workspaceId);
    }
  }, [workspaceId, setCurrentWorkspace]);

  const bootstrapStage = useBootstrapStore((state) => state.bootstrapStage);

  return (
    <div ref={containerRef} className="h-full w-full outline-none" tabIndex={-1}>
      {!isBootstrapped ? (
        <LoadingState title="Loading IDE" subtitle={bootstrapStage} />
      ) : (
        <>
          {children}
          <GlobalOverlays />
        </>
      )}
    </div>
  );
}
