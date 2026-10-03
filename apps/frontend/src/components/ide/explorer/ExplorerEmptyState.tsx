import React from 'react';
import { FolderPlus, GitBranch, History, PlusSquare, Loader2 } from 'lucide-react';
import { CommandService, WorkbenchCommands } from '../../../services/command/CommandService';
import { Button } from '../../ui/button';

export function ExplorerEmptyState({ type }: { type?: 'no-workspace' | 'empty-folder' | 'no-results' | 'loading' }) {
  if (type === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Loading workspace...</h3>
      </div>
    );
  }
  if (type === 'no-results') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
        <h3 className="text-sm font-medium text-foreground">No matches found</h3>
        <p className="text-xs text-muted-foreground">Try adjusting your filter</p>
      </div>
    );
  }

  if (type === 'empty-folder') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
        <h3 className="text-sm font-medium text-foreground">Folder is empty</h3>
        <p className="text-xs text-muted-foreground">Right click to create files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">No Workspace Opened</h3>
        <p className="text-xs text-muted-foreground">Open a folder to start editing files, or clone a repository.</p>
      </div>

      <div className="flex flex-col w-full space-y-2 max-w-[200px]">
        <Button 
          onClick={() => CommandService.execute('workbench.action.files.openFile')}
          className="flex items-center space-x-2 w-full"
        >
          <PlusSquare className="w-4 h-4" />
          <span>Open File</span>
        </Button>
        <Button 
          variant="outline"
          onClick={() => CommandService.execute(WorkbenchCommands.OPEN_FOLDER)}
          className="flex items-center space-x-2 w-full justify-start text-muted-foreground"
        >
          <FolderPlus className="w-4 h-4 mr-1" />
          <span>Open Folder</span>
        </Button>

        <Button 
          variant="outline"
          onClick={() => CommandService.execute(WorkbenchCommands.OPEN_RECENT)}
          className="flex items-center space-x-2 w-full justify-start text-muted-foreground"
        >
          <History className="w-4 h-4 mr-1" />
          <span>Open Recent</span>
        </Button>

        <Button 
          variant="outline"
          onClick={() => CommandService.execute(WorkbenchCommands.CLONE_REPOSITORY)}
          className="flex items-center space-x-2 w-full justify-start text-muted-foreground"
        >
          <GitBranch className="w-4 h-4 mr-1" />
          <span>Clone Repository</span>
        </Button>

        <Button 
          variant="outline"
          onClick={() => CommandService.execute('workbench.action.newWorkspace')}
          className="flex items-center space-x-2 w-full justify-start text-muted-foreground"
        >
          <PlusSquare className="w-4 h-4 mr-1" />
          <span>New Workspace</span>
        </Button>
      </div>
    </div>
  );
}
