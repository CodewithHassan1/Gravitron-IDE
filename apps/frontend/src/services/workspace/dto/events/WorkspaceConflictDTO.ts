export interface WorkspaceConflictDTO {
  readonly operationId: string;
  readonly conflictedNodeId?: string;
  readonly reason: string;
}
