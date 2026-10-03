import React from 'react';
import { useGitStore } from '../../../stores/ide/gitStore';
import { GitStatusEntry } from '../../../lib/scm/GitModels';

export function ChangeItem({ entry }: { entry: GitStatusEntry }) {
  return (
    <div className="change-item flex items-center justify-between py-1 px-2 hover:bg-hover-bg cursor-pointer text-sm">
      <span className="truncate flex-1">{entry.path}</span>
      <span className={`status-badge text-xs ml-2 uppercase font-bold
        ${entry.status === 'modified' ? 'text-blue-400' : ''}
        ${entry.status === 'added' ? 'text-green-400' : ''}
        ${entry.status === 'deleted' ? 'text-red-400' : ''}
        ${entry.status === 'untracked' ? 'text-green-500' : ''}
      `}>{entry.status[0]}</span>
    </div>
  );
}
