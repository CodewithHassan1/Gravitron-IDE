import React from 'react';
import { EditorGroup as EditorGroupType } from '../../../stores/ide/editorLayoutStore';
import { EditorTabs } from './EditorTabs';
import { MonacoEditor } from './MonacoEditor';
import { Breadcrumbs } from './Breadcrumbs';
import { VirtualDocumentProvider } from '../../../services/editor/VirtualDocumentProvider';

interface EditorGroupProps {
  group: EditorGroupType;
}

export function EditorGroup({ group }: EditorGroupProps) {
  const activeTab = group.tabs.find((t) => t.id === group.activeTabId);

  const renderContent = () => {
    if (!activeTab) {
      return <div className="w-full h-full bg-background" />;
    }

    if (VirtualDocumentProvider.isVirtualDocument(activeTab.path)) {
      const doc = VirtualDocumentProvider.getDocument(activeTab.path);
      if (doc) {
        const VirtualComponent = doc.component;
        return <VirtualComponent uri={activeTab.path} />;
      }
    }

    return <MonacoEditor uri={activeTab.path} tabId={activeTab.id} groupId={group.id} />;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 border-r border-border last:border-r-0">
      <EditorTabs group={group} />
      {activeTab && <Breadcrumbs path={activeTab.path} />}
      <div className="flex-1 relative overflow-hidden">{renderContent()}</div>
    </div>
  );
}
