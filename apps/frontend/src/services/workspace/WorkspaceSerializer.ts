import { VirtualFileSystem } from './vfs/VirtualFileSystem';
import { WorkspaceSnapshot } from './types';
import { WorkspaceNode } from './vfs/WorkspaceNode';

export class WorkspaceSerializer {
  /**
   * Serializes a VirtualFileSystem into a JSON-serializable snapshot.
   */
  public static serialize(vfs: VirtualFileSystem, version: number): WorkspaceSnapshot {
    const nodes = vfs.snapshot();
    return {
      version,
      nodes,
    };
  }

  /**
   * Deserializes a snapshot back into a VirtualFileSystem instance.
   * Throws an error if the tree fails validation after rehydration.
   */
  public static deserialize(snapshot: WorkspaceSnapshot): VirtualFileSystem {
    const vfs = new VirtualFileSystem();
    if (snapshot.nodes && snapshot.nodes.length > 0) {
      vfs.rehydrate(snapshot.nodes as WorkspaceNode[]);
    }
    return vfs;
  }
}
