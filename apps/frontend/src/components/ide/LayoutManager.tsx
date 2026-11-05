import React, { useRef, useEffect } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useLayoutStore } from '../../stores/ide/layoutStore';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { EditorArea } from './EditorArea';
import { BottomPanel } from './BottomPanel';
import { SecondarySidebar } from './SecondarySidebar';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import { useEditorSync } from './useEditorSync';

const clampSize = (value: number, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
};

export function LayoutManager() {
  return <HydratedLayoutManager />;
}

function HydratedLayoutManager() {
  useEditorSync();

  const isSidebarOpen = useLayoutStore((state) => state.isSidebarOpen);
  const isBottomPanelOpen = useLayoutStore((state) => state.isBottomPanelOpen);
  const isSecondarySidebarOpen = useLayoutStore((state) => state.isSecondarySidebarOpen);
  const currentWorkspaceId = useLayoutStore((state) => state.currentWorkspaceId);

  // Initialize strictly with clamped snapshot values post-hydration
  const initialSidebarSize = useRef(
    useLayoutStore.getState().isSidebarOpen
      ? clampSize(useLayoutStore.getState().sidebarSize, 10, 40, 20)
      : 0
  ).current;
  const initialBottomPanelSize = useRef(
    useLayoutStore.getState().isBottomPanelOpen
      ? clampSize(useLayoutStore.getState().bottomPanelSize, 10, 80, 25)
      : 0
  ).current;

  const initialSecondarySidebarSize = useRef(
    useLayoutStore.getState().isSecondarySidebarOpen
      ? clampSize(useLayoutStore.getState().secondarySidebarSize, 10, 40, 20)
      : 0
  ).current;

  const setSidebarSize = useLayoutStore((state) => state.setSidebarSize);
  const setBottomPanelSize = useLayoutStore((state) => state.setBottomPanelSize);
  const setSecondarySidebarSize = useLayoutStore((state) => state.setSecondarySidebarSize);
  const setSidebarOpen = useLayoutStore((state) => state.setSidebarOpen);
  const setSecondarySidebarOpen = useLayoutStore((state) => state.setSecondarySidebarOpen);
  const setBottomPanelOpen = useLayoutStore((state) => state.setBottomPanelOpen);
  const setEditorGroupSize = useLayoutStore((state) => state.setEditorGroupSize);
  const setLastSidebarSize = useLayoutStore((state) => state.setLastSidebarSize);
  const setLastBottomPanelSize = useLayoutStore((state) => state.setLastBottomPanelSize);
  const setLastSecondarySidebarSize = useLayoutStore((state) => state.setLastSecondarySidebarSize);

  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const bottomPanelRef = useRef<PanelImperativeHandle>(null);
  const secondarySidebarRef = useRef<PanelImperativeHandle>(null);

  // Sync reactive boolean state to imperative panel API
  useEffect(() => {
    if (isSidebarOpen) sidebarRef.current?.expand();
    else sidebarRef.current?.collapse();
  }, [isSidebarOpen]);

  useEffect(() => {
    if (isSecondarySidebarOpen) secondarySidebarRef.current?.expand();
    else secondarySidebarRef.current?.collapse();
  }, [isSecondarySidebarOpen]);

  useEffect(() => {
    if (isBottomPanelOpen) bottomPanelRef.current?.expand();
    else bottomPanelRef.current?.collapse();
  }, [isBottomPanelOpen]);

  // Synchronize on hydration explicitly
  useEffect(() => {
    const syncSizes = () => {
      const state = useLayoutStore.getState();
      if (state.isSidebarOpen) sidebarRef.current?.resize(clampSize(state.sidebarSize, 10, 40, 20));
      if (state.isBottomPanelOpen)
        bottomPanelRef.current?.resize(clampSize(state.bottomPanelSize, 10, 80, 25));
      if (state.isSecondarySidebarOpen)
        secondarySidebarRef.current?.resize(clampSize(state.secondarySidebarSize, 10, 40, 20));
    };

    if (useLayoutStore.persist.hasHydrated()) {
      syncSizes();
    } else {
      const unsub = useLayoutStore.persist.onFinishHydration(syncSizes);
      return () => unsub();
    }
  }, [currentWorkspaceId]);

  // Imperative synchronization of panel visibility and size restoration
  useEffect(() => {
    if (isSidebarOpen) {
      if (sidebarRef.current?.isCollapsed() || sidebarRef.current?.getSize()?.asPercentage === 0) {
        sidebarRef.current?.expand();
        const lastSize = clampSize(useLayoutStore.getState().lastSidebarSize, 10, 40, 20);
        sidebarRef.current?.resize(lastSize);
      }
    } else {
      if (!sidebarRef.current?.isCollapsed()) {
        sidebarRef.current?.collapse();
      }
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    if (isBottomPanelOpen) {
      if (
        bottomPanelRef.current?.isCollapsed() ||
        bottomPanelRef.current?.getSize()?.asPercentage === 0
      ) {
        bottomPanelRef.current?.expand();
        const lastSize = clampSize(useLayoutStore.getState().lastBottomPanelSize, 10, 80, 25);
        bottomPanelRef.current?.resize(lastSize);
      }
    } else {
      if (!bottomPanelRef.current?.isCollapsed()) {
        bottomPanelRef.current?.collapse();
      }
    }
  }, [isBottomPanelOpen]);

  useEffect(() => {
    if (isSecondarySidebarOpen) {
      if (
        secondarySidebarRef.current?.isCollapsed() ||
        secondarySidebarRef.current?.getSize()?.asPercentage === 0
      ) {
        secondarySidebarRef.current?.expand();
        const lastSize = clampSize(useLayoutStore.getState().lastSecondarySidebarSize, 10, 40, 20);
        secondarySidebarRef.current?.resize(lastSize);
      }
    } else {
      if (!secondarySidebarRef.current?.isCollapsed()) {
        secondarySidebarRef.current?.collapse();
      }
    }
  }, [isSecondarySidebarOpen]);

  // Handlers for double click on splitters
  const handleSidebarDoubleClick = () => {
    if (isSidebarOpen) {
      if (sidebarRef.current) {
        const currentSize = sidebarRef.current.getSize()?.asPercentage ?? 20;

        if (currentSize !== 20) {
          setLastSidebarSize(currentSize);
          setSidebarSize(20);
        } else {
          setSidebarSize(40);
        }
      }
    } else {
      setSidebarOpen(true);
    }
  };

  const handleBottomPanelDoubleClick = () => {
    if (isBottomPanelOpen) {
      if (bottomPanelRef.current) {
        const currentSize = bottomPanelRef.current.getSize()?.asPercentage ?? 20;

        if (currentSize !== 20) {
          setLastBottomPanelSize(currentSize);
          setBottomPanelSize(20);
        } else {
          setBottomPanelSize(80);
        }
      }
    } else {
      setBottomPanelOpen(true);
    }
  };

  const handleSecondarySidebarDoubleClick = () => {
    if (isSecondarySidebarOpen) {
      if (secondarySidebarRef.current) {
        const currentSize = secondarySidebarRef.current.getSize()?.asPercentage ?? 20;

        if (currentSize !== 20) {
          setLastSecondarySidebarSize(currentSize);
          setSecondarySidebarSize(20);
        } else {
          setSecondarySidebarSize(40);
        }
      }
    } else {
      setSecondarySidebarOpen(true);
    }
  };

  // Debounced resize handlers to ensure persistence without React render loop thrashing
  const resizeTimeouts = useRef<{
    [key: string]: ReturnType<typeof setTimeout>;
  }>({});
  const handleResize = (id: string, size: PanelSize, setter: (size: number) => void) => {
    const numericSize = size.asPercentage;

    if (resizeTimeouts.current[id]) {
      clearTimeout(resizeTimeouts.current[id]);
    }

    resizeTimeouts.current[id] = setTimeout(() => {
      setter(numericSize);
    }, 100);
  };

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
      <ActivityBar />

      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel
          panelRef={sidebarRef}
          id="sidebar"
          defaultSize={initialSidebarSize}
          minSize="12%"
          maxSize="30%"
          collapsible={true}
          collapsedSize={0}
          onResize={(size) => handleResize('sidebar', size, setSidebarSize)}
          className="bg-card border-r border-border flex flex-col overflow-hidden"
        >
          <Sidebar />
        </ResizablePanel>

        <ResizableHandle
          className="w-1 bg-border transition-colors cursor-col-resize z-10 hover:bg-primary"
          onDoubleClick={handleSidebarDoubleClick}
          disableDoubleClick={true}
        />

        <ResizablePanel
          id="main"
          defaultSize={100 - initialSidebarSize - initialSecondarySidebarSize}
          className="overflow-hidden"
        >
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel
              id="editor"
              defaultSize={100 - initialBottomPanelSize}
              minSize={20}
              onResize={(size) => handleResize('editor', size, setEditorGroupSize)}
              className="overflow-hidden"
            >
              <EditorArea />
            </ResizablePanel>

            <ResizableHandle
              className="h-1 bg-border transition-colors cursor-row-resize z-10 hover:bg-primary"
              onDoubleClick={handleBottomPanelDoubleClick}
              disableDoubleClick={true}
            />

            <ResizablePanel
              panelRef={bottomPanelRef}
              id="bottom-panel"
              defaultSize={initialBottomPanelSize}
              minSize="12%"
              maxSize="60%"
              collapsible={true}
              collapsedSize={0}
              onResize={(size) => handleResize('bottom', size, setBottomPanelSize)}
              className="bg-card border-t border-border overflow-hidden"
            >
              <BottomPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle
          className="w-1 bg-border transition-colors cursor-col-resize z-10 hover:bg-primary"
          onDoubleClick={handleSecondarySidebarDoubleClick}
          disableDoubleClick={true}
        />

        <ResizablePanel
          panelRef={secondarySidebarRef}
          id="secondary-sidebar"
          defaultSize={initialSecondarySidebarSize}
          minSize="12%"
          maxSize="30%"
          collapsible={true}
          collapsedSize={0}
          onResize={(size) => handleResize('secondary', size, setSecondarySidebarSize)}
          className="bg-card border-l border-border flex flex-col overflow-hidden"
        >
          <SecondarySidebar />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
