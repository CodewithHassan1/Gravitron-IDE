import { AgentProtocol } from '@ag/protocol';
import { ToolDefinition } from '@ag/ai-providers';

export interface ToolResult {
  content: string;
  truncated: boolean;
  originalSize?: number;
}

export interface ToolImplementation {
  definition: ToolDefinition;
  execute(
    args: any,
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult>;
}
