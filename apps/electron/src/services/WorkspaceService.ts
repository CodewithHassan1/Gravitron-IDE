import { IWorkspaceService } from './IWorkspaceService';
import { ServiceId, ServiceIds } from './ServiceIds';
import * as fs from 'fs';
import * as pathModule from 'path';

import { IpcHandlerRegistration } from './IService';
import { Channels } from '@ag/protocol';
import { dialog } from 'electron';

interface ActiveWorkspace {
  path: string;
  openedAt: number;
  isFile?: boolean;
}

export class WorkspaceService implements IWorkspaceService {
  public readonly id = ServiceIds.Workspace;
  public readonly dependencies: readonly ServiceId[] = [];
  private workspaces = new Map<string, ActiveWorkspace>();
  private closedListeners: Set<(workspaceId: string) => void> = new Set();

  constructor(
    private fileWatcherService?: any,
    private eventBroker?: any
  ) {}

  public async initialize(): Promise<void> {}
  public async start(): Promise<void> {}
  public async stop(): Promise<void> {
    this.workspaces.clear();
  }
  public async dispose(): Promise<void> {}
  public async health(): Promise<boolean> {
    return true;
  }

  public async openWorkspace(path: string): Promise<void> {
    if (this.workspaces.has(path)) {
      return;
    }

    let isFile = false;
    try {
      isFile = fs.statSync(path).isFile();
    } catch {
      // ignore
    }
    this.workspaces.set(path, { path, openedAt: Date.now(), isFile });

    if (this.fileWatcherService) {
      this.fileWatcherService.startWatching(path);
    }
  }

  public async closeWorkspace(path: string): Promise<void> {
    this.workspaces.delete(path);

    // Notify listeners
    for (const listener of this.closedListeners) {
      try {
        listener(path);
      } catch {
        // ignore listener errors
      }
    }

    if (this.fileWatcherService) {
      this.fileWatcherService.stopWatching();
    }
  }

  public onWorkspaceClosed(listener: (workspaceId: string) => void): void {
    this.closedListeners.add(listener);
  }

  public async workspaceInfo(path: string): Promise<any> {
    const ws = this.workspaces.get(path);
    if (!ws) {
      throw new Error(`Workspace not found: ${path}`);
    }
    return { ...ws, type: 'active-workspace' };
  }

  public listOpenWorkspaces(): string[] {
    return Array.from(this.workspaces.keys());
  }

  private async getSecurePath(workspaceId: string, virtualPath: string): Promise<string> {
    const pathMod = await import('path');
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Normalize path to prevent directory traversal
    const normalizedVirtualPath = pathMod.normalize(virtualPath).replace(/^(\.\.[/\\\\])+/, '');

    if ((workspace as any).isFile) {
      if (
        normalizedVirtualPath === '/' ||
        normalizedVirtualPath === '' ||
        normalizedVirtualPath === pathMod.basename(workspace.path)
      ) {
        return workspace.path;
      } else {
        throw new Error(`Cannot access sub-paths in a file workspace: ${virtualPath}`);
      }
    }

    const normalizedWorkspacePath = pathMod.normalize(workspace.path);
    const physicalPath = pathMod.join(
      normalizedWorkspacePath,
      normalizedVirtualPath === '/' ? '' : normalizedVirtualPath
    );

    if (!physicalPath.startsWith(normalizedWorkspacePath)) {
      console.log(
        '[FORENSIC:MAIN:SECURE_PATH] physicalPath:',
        physicalPath,
        'normalizedWorkspacePath:',
        normalizedWorkspacePath
      );
      throw new Error(`Path traversal violation: ${virtualPath}`);
    }
    return physicalPath;
  }

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.Workspace.Open,
        handler: async (payload: string) => {
          await this.openWorkspace(payload);
        },
      },
      {
        channel: Channels.Workspace.OpenFileRequest,
        handler: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openFile'],
          });
          if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            const name = pathModule.basename(filePath);
            const id = await this.openWorkspace(filePath);
            return { id, path: filePath, name, type: 'file' };
          }
          return null;
        },
      },
      {
        channel: Channels.Workspace.Close,
        handler: async (workspaceId: string) => {
          await this.closeWorkspace(workspaceId);
        },
      },
      {
        channel: Channels.Workspace.SelectFolderRequest,
        handler: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
          });
          if (!result.canceled && result.filePaths.length > 0) {
            const testPath = result.filePaths[0];
            const name = pathModule.basename(testPath);
            await this.openWorkspace(testPath);
            const id = testPath; // Legacy ID is just the path
            console.log('[FORENSIC:MAIN:OPEN] generated workspaceId:', id);
            const ret = { id, path: testPath, name, type: 'directory' };
            console.log('[FORENSIC:MAIN:OPEN] exact object returned:', ret);
            return ret;
          }
          return null;
        },
      },
      {
        channel: Channels.Workspace.GetDefaultWorkspaceRequest,
        handler: async () => {
          return undefined; // Frontend handles empty state
        },
      },
      {
        channel: Channels.Workspace.SearchRequest,
        handler: async (request: import('@ag/protocol').WorkspaceSearchRequest) => {
          const fsPromises = await import('fs/promises');
          const pathMod = await import('path');
          const results: import('@ag/protocol').TextSearchResult[] = [];
          const maxResults = request.options?.maxResults || 100;
          const maxFileSize = request.options?.maxFileSize || 5 * 1024 * 1024; // 5MB limit

          let physicalWorkspacePath: string;
          try {
            physicalWorkspacePath = await this.getSecurePath(request.workspaceId, '/');
          } catch {
            return [];
          }

          let regex: RegExp;
          try {
            const flags = request.options?.isCaseSensitive ? 'g' : 'gi';
            let pattern = request.query;
            if (!request.options?.isRegex) {
              pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            if (request.options?.isWordMatch) {
              pattern = `\\b${pattern}\\b`;
            }
            regex = new RegExp(pattern, flags);
          } catch (e) {
            console.error('[WorkspaceService] Invalid regex pattern', e);
            return [];
          }

          async function searchDirectory(dir: string, relDir: string) {
            if (results.length >= maxResults) return;

            let entries;
            try {
              entries = await fsPromises.readdir(dir, { withFileTypes: true });
            } catch {
              return;
            }

            for (const entry of entries) {
              if (results.length >= maxResults) return;

              if (
                entry.name === 'node_modules' ||
                entry.name === '.git' ||
                entry.name === 'dist' ||
                entry.name === 'build' ||
                entry.name === 'coverage'
              ) {
                continue;
              }

              const fullPath = pathMod.join(dir, entry.name);
              const relPath = relDir === '/' ? `/${entry.name}` : `${relDir}/${entry.name}`;

              if (entry.isDirectory()) {
                await searchDirectory(fullPath, relPath);
              } else if (entry.isFile()) {
                try {
                  const stat = await fsPromises.stat(fullPath);
                  if (stat.size > maxFileSize) continue;

                  const buffer = await fsPromises.readFile(fullPath);
                  const checkLength = Math.min(buffer.length, 8192);
                  let isBinary = false;
                  for (let i = 0; i < checkLength; i++) {
                    if (buffer[i] === 0) {
                      isBinary = true;
                      break;
                    }
                  }
                  if (isBinary) continue;

                  const content = buffer.toString('utf-8');
                  const lines = content.split('\n');

                  for (let i = 0; i < lines.length; i++) {
                    if (results.length >= maxResults) break;

                    const line = lines[i];
                    regex.lastIndex = 0;
                    const match = regex.exec(line);

                    if (match) {
                      results.push({
                        path: relPath,
                        line: i + 1,
                        column: match.index + 1,
                        match: match[0],
                        preview: line.substring(0, 200),
                      });
                    }
                  }
                } catch {
                  // ignore read errors for individual files
                }
              }
            }
          }

          await searchDirectory(physicalWorkspacePath, '/');
          return results;
        },
      },
      {
        channel: Channels.Workspace.ReadDirectory,
        handler: async ({ workspaceId, path }: { workspaceId: string; path: string }) => {
          console.log(
            '[FORENSIC:MAIN:READDIR] workspaceId:',
            workspaceId,
            'requested relative path:',
            path
          );
          const fsSync = await import('fs');

          const physicalPath = await this.getSecurePath(workspaceId, path);
          console.log('[FORENSIC:MAIN:READDIR] resolved physical path:', physicalPath);
          const exists = fsSync.existsSync(physicalPath);
          console.log('[FORENSIC:MAIN:READDIR] physical directory exists:', exists);

          const fsPromises = await import('fs/promises');
          const entries = await fsPromises.readdir(physicalPath, { withFileTypes: true });
          console.log('[FORENSIC:MAIN:READDIR] raw directory entries count:', entries.length);

          const mapped = entries.map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            isSymlink: entry.isSymbolicLink(),
          }));
          console.log('[FORENSIC:MAIN:READDIR] exact returned entries:', mapped);
          return mapped;
        },
      },
      {
        channel: Channels.Workspace.ReadFile,
        handler: async ({ workspaceId, path }: { workspaceId: string; path: string }) => {
          const fsPromises = await import('fs/promises');
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            const content = await fsPromises.readFile(physicalPath, 'utf-8');
            return content;
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to read file ${path}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.WriteFile,
        handler: async ({
          workspaceId,
          path,
          content,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          content: string | Uint8Array;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');

          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
          }

          let physicalPath: string;
          try {
            physicalPath = await this.getSecurePath(workspaceId, path);
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to write file ${path}`, e);
            throw e;
          }

          const tempPath = `${physicalPath}.tmp`;
          let fileHandle: any;

          try {
            fileHandle = await fsPromises.open(tempPath, 'w');
            await fileHandle.writeFile(content);
            await fileHandle.sync(); // fsync
            await fileHandle.close();
            fileHandle = undefined;

            await fsPromises.rename(tempPath, physicalPath);
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed atomic write for ${path}`, e);
            if (fileHandle) {
              try {
                await fileHandle.close();
              } catch {
                /* ignore */
              }
            }
            try {
              await fsPromises.unlink(tempPath);
            } catch {
              /* ignore */
            }
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.CreateFile,
        handler: async ({
          workspaceId,
          path,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            await fsPromises.writeFile(physicalPath, ''); // Create empty file
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to create file ${path}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.CreateFolder,
        handler: async ({
          workspaceId,
          path,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            await fsPromises.mkdir(physicalPath, { recursive: true });
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to create folder ${path}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.DeleteFile,
        handler: async ({
          workspaceId,
          path,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            await fsPromises.unlink(physicalPath);
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to delete file ${path}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.DeleteFolder,
        handler: async ({
          workspaceId,
          path,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            await fsPromises.rm(physicalPath, { recursive: true, force: true });
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to delete folder ${path}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.RenameFile,
        handler: async ({
          workspaceId,
          path,
          newPath,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          newPath: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
            this.eventBroker.registerMutation(newPath, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            const newPhysicalPath = await this.getSecurePath(workspaceId, newPath);
            await fsPromises.rename(physicalPath, newPhysicalPath);
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to rename file ${path} to ${newPath}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.RenameFolder,
        handler: async ({
          workspaceId,
          path,
          newPath,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          newPath: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
            this.eventBroker.registerMutation(newPath, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            const newPhysicalPath = await this.getSecurePath(workspaceId, newPath);
            await fsPromises.rename(physicalPath, newPhysicalPath);
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to rename folder ${path} to ${newPath}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.MoveFile,
        handler: async ({
          workspaceId,
          path,
          newPath,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          newPath: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(path, mutationId);
            this.eventBroker.registerMutation(newPath, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            const newPhysicalPath = await this.getSecurePath(workspaceId, newPath);
            await fsPromises.rename(physicalPath, newPhysicalPath);
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to move file ${path} to ${newPath}`, e);
            throw e;
          }
        },
      },
      {
        channel: Channels.Workspace.Copy,
        handler: async ({
          workspaceId,
          path,
          newPath,
          mutationId,
        }: {
          workspaceId: string;
          path: string;
          newPath: string;
          mutationId?: string;
        }) => {
          const fsPromises = await import('fs/promises');
          if (mutationId && this.eventBroker) {
            this.eventBroker.registerMutation(newPath, mutationId);
          }
          try {
            const physicalPath = await this.getSecurePath(workspaceId, path);
            const newPhysicalPath = await this.getSecurePath(workspaceId, newPath);
            await fsPromises.cp(physicalPath, newPhysicalPath, { recursive: true });
          } catch (e: any) {
            console.error(`[WorkspaceService] Failed to copy file ${path} to ${newPath}`, e);
            throw e;
          }
        },
      },
    ];
  }
}
