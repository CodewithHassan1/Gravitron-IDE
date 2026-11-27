import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class ExtendCommandTimeoutTool implements ToolImplementation {
  public readonly definition = {
    name: 'extend_command_timeout',
    description:
      'Request additional execution time for an active running command, subject to user settings and maximum timeout limits.',
    inputSchema: {
      type: 'object',
      properties: {
        commandId: {
          type: 'string',
          description: 'The unique identifier of the active command execution.',
        },
        additionalSeconds: {
          type: 'number',
          description: 'Additional seconds to add to the command timeout.',
        },
        reason: {
          type: 'string',
          description: 'Clear justification for why more execution time is needed.',
        },
      },
      required: ['commandId', 'additionalSeconds'],
    },
    riskLevel: 'read' as const,
  };

  public async execute(
    args: { commandId: string; additionalSeconds: number; reason?: string },
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    if (typeof bridge.extendCommandTimeout !== 'function') {
      return {
        content: JSON.stringify({
          granted: false,
          reason: 'Execution backend does not support dynamic timeout extensions.',
        }),
        truncated: false,
      };
    }

    const additionalMs =
      typeof args.additionalSeconds === 'number' && Number.isFinite(args.additionalSeconds)
        ? Math.round(args.additionalSeconds * 1000)
        : 0;

    const result = await bridge.extendCommandTimeout(
      context,
      args.commandId,
      additionalMs,
      'agent',
      args.reason
    );

    return {
      content: JSON.stringify(result, null, 2),
      truncated: false,
    };
  }
}
