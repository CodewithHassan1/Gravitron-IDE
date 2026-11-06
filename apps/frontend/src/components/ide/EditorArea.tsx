import React from 'react';
import { useEditorLayoutStore } from '../../stores/ide/editorLayoutStore';
import { EditorGroup } from './editor/EditorGroup';
import { WelcomeScreen } from './editor/WelcomeScreen';
import { useBootstrapStore } from '../../stores/ide/bootstrapStore';
import { LoadingState } from '../ui/LoadingState';

export function EditorArea() {
  const groups = useEditorLayoutStore((state) => state.groups);
  const isBootstrapped = useBootstrapStore((state) => state.isBootstrapped);
  const bootstrapStage = useBootstrapStore((state) => state.bootstrapStage);

  const hasAnyTabs = groups.some((g) => g.tabs.length > 0);

  if (!isBootstrapped) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background overflow-hidden relative">
        <LoadingState title="Loading Workspace Intelligence" subtitle={bootstrapStage} />
      </div>
    );
  }

  if (!hasAnyTabs) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex-1 flex flex-row h-full bg-background overflow-hidden">
      {groups.map((group) => (
        <EditorGroup key={group.id} group={group} />
      ))}
    </div>
  );
}
