import { useEffect } from 'react';
import { WorkspaceEvents } from '../../services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../services/workspace/types';
import { useEditorLayoutStore } from '../../stores/ide/editorLayoutStore';

export function useEditorSync() {
  const updateTabDirtyState = useEditorLayoutStore((state) => state.updateTabDirtyState);

  useEffect(() => {
    const unsubModified = WorkspaceEvents.on(WorkspaceEventType.FileModified, (event) => {
      const { path } = event.payload!;
      const state = useEditorLayoutStore.getState();
      state.groups.forEach((group) => {
        const tab = group.tabs.find((t) => t.path === path);
        if (tab) {
          updateTabDirtyState(group.id, tab.id, true);
        }
      });
    });

    const unsubSaved = WorkspaceEvents.on(WorkspaceEventType.FileSaved, (event) => {
      const { path } = event.payload!;
      const state = useEditorLayoutStore.getState();
      state.groups.forEach((group) => {
        const tab = group.tabs.find((t) => t.path === path);
        if (tab) {
          updateTabDirtyState(group.id, tab.id, false);
        }
      });
    });

    return () => {
      unsubModified();
      unsubSaved();
    };
  }, [updateTabDirtyState]);
}
