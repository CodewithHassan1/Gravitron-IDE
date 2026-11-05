import { FileContentManager, OpenFileBuffer } from '../FileContentManager';
import { WorkspaceManagerImpl } from '../WorkspaceManager';

export enum ConflictState {
  None,
  ExternalChange,
  LocalChange,
  BothChanged,
}

export class FileConflictManager {
  constructor(private workspaceManager: WorkspaceManagerImpl) {}

  public async checkConflict(
    buffer: OpenFileBuffer,
    newExternalContent: string
  ): Promise<ConflictState> {
    const newHash = await this.hashString(newExternalContent);

    const localChanged =
      buffer.dirty || (await this.hashString(buffer.content)) !== buffer.lastSavedHash;
    const externalChanged = newHash !== buffer.lastDiskHash;

    if (localChanged && externalChanged) {
      return ConflictState.BothChanged;
    } else if (externalChanged) {
      return ConflictState.ExternalChange;
    } else if (localChanged) {
      return ConflictState.LocalChange;
    }

    return ConflictState.None;
  }

  public async handleExternalModification(path: string): Promise<void> {
    const nodeId = this.workspaceManager.resolvePath(path);
    if (!nodeId) return;

    const buffer = this.workspaceManager.contentManager.getBuffer(nodeId);
    if (!buffer) return;

    try {
      const newContent = await this.workspaceManager.readFile(path);
      const state = await this.checkConflict(buffer, newContent);

      if (state === ConflictState.ExternalChange) {
        // Safe to reload
        this.workspaceManager.contentManager.silentReload(nodeId, newContent);
      } else if (state === ConflictState.BothChanged) {
        // Fire conflict event
        console.warn(`[FileConflictManager] Conflict detected for ${path}!`);
        // We'll emit an event that UI can listen to for showing a diff view.
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('workspace:conflict', { detail: { path, nodeId } });
          window.dispatchEvent(event);
        }
      }
    } catch (e) {
      console.error(`[FileConflictManager] Error checking conflict for ${path}`, e);
    }
  }

  public async hashString(content: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
