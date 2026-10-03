import { WorkspaceNode } from '../../types/ide';

export type FileEvent = 
  | { type: 'created', node: WorkspaceNode }
  | { type: 'deleted', id: string }
  | { type: 'renamed', id: string, newName: string, newPath: string }
  | { type: 'moved', id: string, newParentId: string | null };

type FileEventListener = (event: FileEvent) => void;

class FileWatcherImpl {
  private listeners: Set<FileEventListener> = new Set();

  subscribe(listener: FileEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: FileEvent) {
    this.listeners.forEach(listener => listener(event));
  }
}

export const FileWatcher = new FileWatcherImpl();
