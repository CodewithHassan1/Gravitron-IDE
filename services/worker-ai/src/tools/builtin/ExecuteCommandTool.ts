import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class ExecuteCommandTool implements ToolImplementation {
  public readonly definition = {
    name: 'execute_command',
    description: 'Execute a terminal command in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'The working directory relative to the workspace root. Optional.',
        },
      },
      required: ['command'],
    },
    riskLevel: 'execute' as const,
  };

  public async execute(
    args: { command: string; cwd?: string },
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    try {
      const result = await bridge.executeCommand(context, args.command, args.cwd);

      let content = `Exit Code: ${result.exitCode}\n`;
      const truncated = false;
      let originalSize = 0;

      if (result.stdout) {
        content += `\nSTDOUT:\n${result.stdout}`;
        originalSize += result.stdout.length;
      }

      if (result.stderr) {
        content += `\nSTDERR:\n${result.stderr}`;
        originalSize += result.stderr.length;
      }

      // Truncate to 8000 characters if it's too large
      if (content.length > 8000) {
        return {
          content: content.substring(0, 8000),
          truncated: true,
          originalSize,
        };
      }

      return {
        content,
        truncated: false,
      };
    } catch (e: any) {
      throw e;
    }
  }
}
