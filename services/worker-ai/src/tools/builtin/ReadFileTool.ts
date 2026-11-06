import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class ReadFileTool implements ToolImplementation {
  public readonly definition = {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the file to read, relative to the workspace root.',
        },
      },
      required: ['path'],
    },
    riskLevel: 'read' as const,
  };

  public async execute(
    args: { path: string },
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    try {
      const content = await bridge.readFile(context, args.path);
      // Truncate to 8000 characters if it's too large
      if (content.length > 8000) {
        return {
          content: content.substring(0, 8000),
          truncated: true,
          originalSize: content.length,
        };
      }
      return {
        content,
        truncated: false,
      };
    } catch (e: any) {
      throw e; // Handled by ToolRegistry or AgentSession
    }
  }
}
