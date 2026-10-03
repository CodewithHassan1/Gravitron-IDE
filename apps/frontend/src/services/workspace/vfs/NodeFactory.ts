// src/services/workspace/vfs/NodeFactory.ts
import { WorkspaceNode, NodeType, NodePermissions } from './WorkspaceNode';

export class NodeFactory {
  /**
   * Only this class may generate UUIDs.
   */
  private static generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Helper to extract the extension from a filename.
   */
  private static extractExtension(name: string): string {
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex < name.length - 1) {
      return name.substring(lastDotIndex).toLowerCase();
    }
    return '';
  }

  /**
   * Generates a new file node.
   */
  public static createFile(
    name: string,
    parentId: string | null,
    path: string,
    relativePath: string,
    customMetadata?: Record<string, any>
  ): WorkspaceNode {
    const now = Date.now();
    return {
      id: this.generateUUID(),
      parentId,
      name,
      type: 'file',
      path,
      relativePath,
      extension: this.extractExtension(name),
      size: 0,
      createdTime: now,
      modifiedTime: now,
      children: [],
      childrenLoaded: true, // Files have no children to load
      permissions: {
        readonly: false,
        executable: false,
      },
      metadata: {
        isHidden: name.startsWith('.'),
        isSymlink: false,
        ...customMetadata,
      },
    };
  }

  /**
   * Generates a new directory node.
   */
  public static createDirectory(
    name: string,
    parentId: string | null,
    path: string,
    relativePath: string,
    customMetadata?: Record<string, any>
  ): WorkspaceNode {
    const now = Date.now();
    return {
      id: this.generateUUID(),
      parentId,
      name,
      type: 'directory',
      path,
      relativePath,
      extension: '',
      size: 0,
      createdTime: now,
      modifiedTime: now,
      children: [],
      childrenLoaded: false,
      permissions: {
        readonly: false,
        executable: false,
      },
      metadata: {
        isHidden: name.startsWith('.'),
        isSymlink: false,
        ...customMetadata,
      },
    };
  }
}
