import { ILifecycleService, IIpcService } from './IService';

export interface IWorkspaceService extends ILifecycleService, IIpcService {
  openWorkspace(path: string): Promise<void>;
  closeWorkspace(path: string): Promise<void>;
  workspaceInfo(path: string): Promise<any>;
  listOpenWorkspaces(): string[];
  onWorkspaceClosed(listener: (workspaceId: string) => void): void;
}
