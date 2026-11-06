import { GraphPatch } from '../models/GraphPatch';
import { GraphNodeId } from '../models/EntityIds';

export interface ReadonlyGraph<TNodeId extends string = GraphNodeId, TNode = any, TEdge = any> {
  readonly version: string;
  readonly name: string;

  getNode(id: TNodeId): Readonly<TNode> | undefined;
  getOutgoingEdges(id: TNodeId): ReadonlyArray<Readonly<TEdge>>;
  getIncomingEdges(id: TNodeId): ReadonlyArray<Readonly<TEdge>>;

  // Exposes all nodes in an immutable fashion, typically for debugging or snapshotting
  getAllNodes(): ReadonlyArray<Readonly<TNode>>;
}

export interface Graph<
  TNodeId extends string = GraphNodeId,
  TNode = any,
  TEdge = any,
> extends ReadonlyGraph<TNodeId, TNode, TEdge> {
  /**
   * Applies patches to the graph.
   * This is generally called only by the RepositoryReducer.
   */
  applyPatches(patches: ReadonlyArray<GraphPatch>): void;
}
