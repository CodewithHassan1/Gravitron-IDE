import { AgentProtocol } from '@ag/protocol';
import { ToolImplementation, ToolResult } from '../AgentTool';

export class FindDefinitionTool implements ToolImplementation {
  public readonly definition = {
    name: 'find_definition',
    description: 'Find the indexed definition of a symbol within the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'The exact name of the symbol to find the definition for.',
          minLength: 1,
          maxLength: 100
        }
      },
      required: ['symbolName'],
      additionalProperties: false
    },
    riskLevel: 'read' as const
  };

  public async execute(args: { symbolName: string }, bridge: AgentProtocol.IAgentCapabilityBridge, context: AgentProtocol.AgentCapabilityContext): Promise<ToolResult> {
    try {
      const response = await bridge.findDefinition(context, args.symbolName);
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
            message: 'Repository intelligence unavailable.'
          }
        }, null, 2),
        truncated: false
      };
    }
  }
}
