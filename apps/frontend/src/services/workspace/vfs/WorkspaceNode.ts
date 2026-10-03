// src/services/workspace/vfs/WorkspaceNode.ts

export type NodeType = 'file' | 'directory';

export interface NodePermissions {
  readonly: boolean;
  executable: boolean;
}

export interface WorkspaceNode {
  readonly id: string;
  parentId: string | null;
  name: string;
  type: NodeType;
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  createdTime: number;
  modifiedTime: number;
  children: string[];
  childrenLoaded: boolean;
  permissions: NodePermissions;
  
  /**
   * Additional metadata for arbitrary editor/agent data
   */
  metadata: Record<string, any>;
}

/**
 * Creates a deep clone of a node to guarantee immutability across boundaries.
 */
export function cloneNode(node: WorkspaceNode): WorkspaceNode {
  return {
    ...node,
    children: [...node.children],
    permissions: { ...node.permissions },
    metadata: { ...node.metadata },
  };
}
