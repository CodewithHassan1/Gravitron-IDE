import { RepositorySnapshot, RepositoryStatistics } from '../models/RepositorySnapshot';
import { WorkspaceId } from '../models/EntityIds';

export interface SnapshotMetadata {
  sequenceNumber: number;
  generation: number;
  cacheVersion: string;
  fileGraphVersion: string;
  importGraphVersion: string;
  symbolGraphVersion: string;
  referenceGraphVersion: string;
  dependencyGraphVersion: string;
  directoryGraphVersion: string;
}

export interface ISnapshotManager {
  /**
   * Initializes or creates the genesis snapshot metadata for a given workspace.
   */
  createGenesisMetadata(workspaceId: WorkspaceId): SnapshotMetadata;

  /**
   * Creates the next set of metadata reflecting an incremented state, depending on which graphs changed.
   */
  incrementMetadata(
    previous: SnapshotMetadata,
    affectedGraphs: string[],
    isRebuild?: boolean
  ): SnapshotMetadata;

  /**
   * Constructs the final immutable snapshot.
   */
  commitSnapshot(
    workspaceId: WorkspaceId,
    metadata: SnapshotMetadata,
    statistics: RepositoryStatistics,
    creationReason: string,
    diagnostics: any[]
  ): RepositorySnapshot;
}
