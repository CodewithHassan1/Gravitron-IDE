import { WorkspaceId } from './EntityIds';
import { RepositoryDiagnostic } from './RepositoryDiagnostic';

export interface RepositoryStatistics {
  fileCount: number;
  directoryCount: number;
  symbolCount: number;
  importCount: number;
  dependencyCount: number;
  referenceCount: number;
}

export interface RepositorySnapshot {
  readonly id: string;
  readonly parentSnapshotId?: string;
  readonly generation: number;
  readonly sequenceNumber: number;
  readonly timestamp: number;
  readonly workspaceId: WorkspaceId;
  readonly cacheVersion: string;
  readonly statistics: RepositoryStatistics;
  readonly creationReason: string;
  readonly diagnostics: readonly RepositoryDiagnostic[];
  
  // Independent Graph Versions
  readonly fileGraphVersion: string;
  readonly importGraphVersion: string;
  readonly symbolGraphVersion: string;
  readonly referenceGraphVersion: string;
  readonly dependencyGraphVersion: string;
  readonly directoryGraphVersion: string;
}
