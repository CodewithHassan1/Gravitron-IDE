export interface RepositoryNode {
  id: string; // Typically absolute path or URI
  parentId: string | null;
  name: string;
  path: string;
  type: 'file' | 'directory';
  createdAt?: number;
  updatedAt?: number;
  size?: number;
  metadata?: Record<string, any>;
}

export class RepositorySnapshot {
  constructor(
    public readonly version: number,
    public readonly nodesById: Map<string, RepositoryNode>,
    public readonly childrenById: Map<string, string[]>,
    public readonly pathToId: Map<string, string>,
    public readonly uriToId: Map<string, string>,
    public readonly parentById: Map<string, string | null>,
    public readonly metadata: Record<string, any>
  ) {}

  static createEmpty(): RepositorySnapshot {
    return new RepositorySnapshot(
      0,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      {}
    );
  }

  clone(newVersion: number = this.version + 1): RepositorySnapshot {
    return new RepositorySnapshot(
      newVersion,
      new Map(this.nodesById),
      new Map(this.childrenById),
      new Map(this.pathToId),
      new Map(this.uriToId),
      new Map(this.parentById),
      { ...this.metadata }
    );
  }

  getNode(id: string): RepositoryNode | undefined {
    return this.nodesById.get(id);
  }

  getChildren(id: string): string[] {
    return this.childrenById.get(id) || [];
  }
}
