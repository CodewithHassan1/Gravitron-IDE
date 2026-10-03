import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class SemanticSearchTool implements ToolImplementation {
  public readonly definition = {
    name: 'semantic_search',
    description: 'Perform a semantic vector search across the repository to find conceptually related code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The conceptual query to search for (e.g., "how are errors logged?").',
          minLength: 1,
          maxLength: 500
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    riskLevel: 'read' as const
  };

  public async execute(args: { query: string }, bridge: AgentProtocol.IAgentCapabilityBridge, context: AgentProtocol.AgentCapabilityContext): Promise<ToolResult> {
    try {
      const response = await bridge.semanticSearch(context, args.query, { limit: 10 });
      
      const content = JSON.stringify({
        success: true,
        snapshotSequence: response.snapshotSequence,
        results: response.results,
        truncated: false
      }, null, 2);

      return {
        content,
        truncated: false
      };
    } catch (e: any) {
      return {
        content: JSON.stringify({
          success: false,
          error: {
            code: 'INTELLIGENCE_QUERY_FAILED',
            message: e.message || 'Repository intelligence unavailable.'
          }
        }, null, 2),
        truncated: false
      };
    }
  }
}
