import { WorkspaceId, DocumentId } from '../models/EntityIds';

export enum RepositoryCommandType {
  IndexRequested = 'IndexRequested',
  ReindexRequested = 'ReindexRequested',
  RecoveryRequested = 'RecoveryRequested',
  ParseRequested = 'ParseRequested',
}

export interface BaseRepositoryCommand {
  type: RepositoryCommandType;
  commandId: string;
  workspaceId: WorkspaceId;
  timestamp: number;
  correlationId?: string;
  traceContext?: Record<string, string>;
}

export interface IndexRequestedCommand extends BaseRepositoryCommand {
  type: RepositoryCommandType.IndexRequested;
  documents: DocumentId[];
  priority: 'Immediate' | 'Interactive' | 'Background';
}

export interface ReindexRequestedCommand extends BaseRepositoryCommand {
  type: RepositoryCommandType.ReindexRequested;
  force: boolean;
}

export interface RecoveryRequestedCommand extends BaseRepositoryCommand {
  type: RepositoryCommandType.RecoveryRequested;
  targetSnapshotId?: string;
}

export interface ParseRequestedCommand extends BaseRepositoryCommand {
  type: RepositoryCommandType.ParseRequested;
  documentId: DocumentId;
}

export type RepositoryCommand =
  | IndexRequestedCommand
  | ReindexRequestedCommand
  | RecoveryRequestedCommand
  | ParseRequestedCommand;
