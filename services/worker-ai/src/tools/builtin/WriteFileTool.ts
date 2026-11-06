import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class WriteFileTool implements ToolImplementation {
  public readonly definition = {
    name: 'write_file',
    description: 'Write contents to a file in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the file to write, relative to the workspace root.',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
    riskLevel: 'destructive' as const,
  };

  public async execute(
    args: { path: string; content: string },
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    try {
      await bridge.writeFile(context, args.path, args.content);
      return {
        content: `Successfully wrote ${args.content.length} characters to ${args.path}`,
        truncated: false,
      };
    } catch (e: any) {
      throw e;
    }
  }
}
