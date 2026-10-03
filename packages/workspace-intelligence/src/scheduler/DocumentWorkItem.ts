import { DocumentId } from '../models/EntityIds';

export enum WorkItemPriority {
  Immediate = 0,
  Interactive = 1,
  Background = 2,
  Recovery = 3,
  Reindex = 4
}

export interface DocumentWorkItem {
  readonly documentId: DocumentId;
  readonly priority: WorkItemPriority;
  readonly enqueuedAt: number;
  readonly reason: string;
}

export interface SchedulerMetrics {
  queueDepth: number;
  oldestItemAgeMs: number;
  coalescedDocuments: number;
  cancelledJobs: number;
  workerUtilization: number;
  averageLatencyMs: number;
}
