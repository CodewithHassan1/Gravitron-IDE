import React from 'react';
import { useBranchStore } from '../../../stores/ide/branchStore';
import { useGitStore } from '../../../stores/ide/gitStore';

export function RepositoryHeader() {
  const currentRepository = useGitStore(s => s.currentRepository);
  const currentBranch = useBranchStore(s => s.currentBranch);

  if (!currentRepository) {
    return <div className="p-4 text-sm text-text-secondary">No repository detected.</div>;
  }

  return (
    <div className="repository-header p-2 flex items-center justify-between border-b border-border-color">
      <div className="flex flex-col">
        <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Source Control</span>
        <span className="text-sm font-medium truncate" title={currentRepository}>{currentRepository.split('/').pop() || 'Workspace'}</span>
      </div>
      <div className="branch-badge bg-blue-900 text-blue-200 text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-blue-800">
        {currentBranch || 'HEAD'}
      </div>
    </div>
  );
}
