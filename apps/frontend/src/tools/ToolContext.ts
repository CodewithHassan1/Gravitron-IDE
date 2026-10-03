import { ToolPermission } from './ToolPermission';

export interface ToolContext {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  permissionsGranted: Set<ToolPermission>;
}
