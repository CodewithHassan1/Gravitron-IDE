import React from 'react';
import { useGitStore } from '../../../stores/ide/gitStore';
import { ChangeItem } from './ChangeItem';

export function ChangesList() {
  const dirtyFiles = useGitStore(s => s.dirtyFiles);

  return (
    <div className="changes-list flex-1 overflow-auto mt-2 border-t border-border-color">
      <div className="header px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-secondary sticky top-0 bg-panel-bg z-10">
        Changes ({dirtyFiles.length})
      </div>
      <div className="list pb-2">
        {dirtyFiles.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-secondary italic">No changes</div>
        ) : (
          dirtyFiles.map(file => (
            <ChangeItem key={file.path} entry={file} />
          ))
        )}
      </div>
    </div>
  );
}
