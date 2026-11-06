import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class RepositoryMapTool implements ToolImplementation {
  public readonly definition = {
    name: 'get_repository_map',
    description:
      'Get a structural map of the current workspace repository, including files and important symbols.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    riskLevel: 'read' as const,
  };

  public async execute(
    args: {},
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    try {
      const response = await bridge.getRepositoryMap(context);

      const content = JSON.stringify(
        {
          success: true,
          snapshotSequence: response.snapshotSequence,
          map: response.results.length > 0 ? response.results[0].content : 'Empty repository',
          truncated: false,
        },
        null,
        2
      );

      return {
        content,
        truncated: false,
      };
    } catch (e: any) {
      return {
        content: JSON.stringify(
          {
            success: false,
            error: {
              code: 'INTELLIGENCE_QUERY_FAILED',
              message: e.message || 'Repository intelligence unavailable.',
            },
          },
          null,
          2
        ),
        truncated: false,
      };
    }
  }
}
