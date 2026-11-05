export interface IWorkspaceRoot {
  id: string;
  name: string;
  uri: string;
  provider: 'browser' | 'electron' | 'remote' | 'memory';
  handle?: any; // FileSystemDirectoryHandle or other platform-specific handle
}

export interface IWorkspaceProvider {
  /**
   * Request the user to select a workspace folder
   */
  openFolder(): Promise<IWorkspaceRoot | null>;

  /**
   * Reopen a previously authorized workspace by URI
   */
  reopenFolder(uri: string): Promise<IWorkspaceRoot | null>;

  /**
   * Check if we still have permission to read/write
   */
  verifyPermissions(root: IWorkspaceRoot): Promise<boolean>;

  /**
   * Request permission for a workspace
   */
  requestPermissions(root: IWorkspaceRoot): Promise<boolean>;
}

export class BrowserWorkspaceProvider implements IWorkspaceProvider {
  async openFolder(): Promise<IWorkspaceRoot | null> {
    if (!('showDirectoryPicker' in window)) {
      console.warn('File System Access API is not supported in this browser.');
      return null;
    }

    try {
      // @ts-ignore
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      return {
        id: `browser-${Date.now()}`,
        name: directoryHandle.name,
        uri: `browser://${directoryHandle.name}`,
        provider: 'browser',
        handle: directoryHandle,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null;
      }
      console.error('Error opening folder:', err);
      return null;
    }
  }

  async reopenFolder(uri: string): Promise<IWorkspaceRoot | null> {
    // In a real application, handles can be stored in IndexedDB.
    // For now, we will return null to force re-picking if refreshed.
    return null;
  }

  async verifyPermissions(root: IWorkspaceRoot): Promise<boolean> {
    if (root.provider !== 'browser' || !root.handle) return true;

    try {
      const options = { mode: 'readwrite' };
      // @ts-ignore
      const permission = await root.handle.queryPermission(options);
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  async requestPermissions(root: IWorkspaceRoot): Promise<boolean> {
    if (root.provider !== 'browser' || !root.handle) return true;

    try {
      const options = { mode: 'readwrite' };
      // @ts-ignore
      const permission = await root.handle.requestPermission(options);
      return permission === 'granted';
    } catch {
      return false;
    }
  }
}

// Singleton instance for the platform
export const workspaceProvider = new BrowserWorkspaceProvider();
