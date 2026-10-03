// src/services/workspace/EditorFileAdapter.ts

import { FileContentManager, OpenFileBuffer } from './FileContentManager';

export class EditorFileAdapter {
  constructor(private contentManager: FileContentManager) {}

  public async open(nodeId: string): Promise<OpenFileBuffer> {
    return this.contentManager.openFile(nodeId);
  }

  public close(nodeId: string): void {
    this.contentManager.closeFile(nodeId);
  }

  public getContent(nodeId: string): string {
    return this.contentManager.getContent(nodeId);
  }

  public updateContent(nodeId: string, content: string): void {
    this.contentManager.updateContent(nodeId, content);
  }

  public async save(nodeId: string): Promise<void> {
    await this.contentManager.saveFile(nodeId);
  }

  public async saveAll(): Promise<void> {
    await this.contentManager.saveAll();
  }

  public isDirty(nodeId: string): boolean {
    return this.contentManager.isDirty(nodeId);
  }
}
