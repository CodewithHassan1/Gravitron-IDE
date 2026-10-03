import { WorkspaceNode } from '../../vfs/WorkspaceNode';

export interface FileCreatedEventDTO {
  readonly type: 'created';
  readonly node: Readonly<WorkspaceNode>;
}
