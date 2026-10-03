import React from 'react';
import { RepositoryHeader } from './RepositoryHeader';
import { CommitInput } from './CommitInput';
import { ChangesList } from './ChangesList';

export function SCMPanel() {
  return (
    <div className="scm-panel h-full flex flex-col bg-panel-bg text-text-primary overflow-hidden">
      <RepositoryHeader />
      <CommitInput />
      <ChangesList />
    </div>
  );
}
