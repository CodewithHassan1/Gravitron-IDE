import { RepositorySnapshot, RepositoryNode } from './Snapshot';

export class RepositorySerializer {
  static serialize(snapshot: RepositorySnapshot): string {
    const data = {
      version: snapshot.version,
      nodes: Array.from(snapshot.nodesById.entries()),
      children: Array.from(snapshot.childrenById.entries()),
      paths: Array.from(snapshot.pathToId.entries()),
      uris: Array.from(snapshot.uriToId.entries()),
      parents: Array.from(snapshot.parentById.entries()),
      metadata: snapshot.metadata
    };
    return JSON.stringify(data);
  }

  static deserialize(json: string): RepositorySnapshot {
    const data = JSON.parse(json);
    return new RepositorySnapshot(
      data.version,
      new Map(data.nodes),
      new Map(data.children),
      new Map(data.paths),
      new Map(data.uris),
      new Map(data.parents),
      data.metadata || {}
    );
  }
}
