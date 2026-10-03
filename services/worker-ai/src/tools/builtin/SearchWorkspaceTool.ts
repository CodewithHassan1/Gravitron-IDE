import { AgentProtocol, IntelligenceProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class SearchWorkspaceTool implements ToolImplementation {
  public readonly definition = {
    name: 'search_workspace',
    description: 'Search the workspace for a given query or symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query or symbol to search for.',
          minLength: 1,
          maxLength: 100,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    riskLevel: 'read' as const,
  };

  public async execute(
    args: { query: string },
    bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    try {
      const response = await bridge.searchWorkspace(context, args.query);
      const content = JSON.stringify(
        {
          success: true,
          snapshotSequence: response.snapshotSequence,
          results: response.results,
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
