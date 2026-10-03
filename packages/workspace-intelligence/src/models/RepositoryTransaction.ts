import { RepositoryEvent } from '../events/RepositoryEvent';
import { GraphPatchCollection } from './GraphPatchCollection';
import { SnapshotMetadata } from '../pipeline/SnapshotManager';

export interface RepositoryTransactionMetrics {
  totalPatches: number;
  processingTimeMs: number;
}

export interface RepositoryTransaction {
  readonly event: RepositoryEvent;
  readonly patchCollection: GraphPatchCollection;
  readonly snapshotMetadata: SnapshotMetadata;
  readonly metrics: RepositoryTransactionMetrics;
  readonly traceContext?: Record<string, string>;
}
