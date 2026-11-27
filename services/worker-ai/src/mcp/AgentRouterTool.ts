import { ToolImplementation, ToolResult } from '../tools/AgentTool';
import { ToolDefinition } from '@ag/ai-providers';
import { AgentProtocol } from '@ag/protocol';
import { AgentRouterClient, McpToolDefinition } from './AgentRouterClient';
import { SpecialistRegistry } from './SpecialistRegistry';
import { SpecialistLifecycleManager } from './SpecialistLifecycleManager';

export class AgentRouterTool implements ToolImplementation {
  public readonly definition: ToolDefinition;
  private client: AgentRouterClient;
  private registry?: SpecialistRegistry;
  private lifecycleManager: SpecialistLifecycleManager;

  constructor(
    toolDef: McpToolDefinition,
    client: AgentRouterClient,
    registry?: SpecialistRegistry,
    lifecycleManager?: SpecialistLifecycleManager
  ) {
    this.client = client;
    this.registry = registry;
    this.lifecycleManager = lifecycleManager || new SpecialistLifecycleManager(client);

    // Dynamic riskLevel assignment: remote sandbox code execution is 'execute',
    // browser navigation is 'write', research/critic/engineering is 'read'
    const riskLevel = registry
      ? registry.getToolRiskLevel(toolDef.name)
      : SpecialistRegistry.RISK_LEVEL_MAP[toolDef.name] || 'read';

    this.definition = {
      name: toolDef.name,
      description: toolDef.description || `AgentRouter specialist agent: ${toolDef.name}`,
      inputSchema: toolDef.inputSchema || { type: 'object', properties: {} },
      riskLevel,
    };
  }

  public async execute(
    args: any,
    _bridge: AgentProtocol.IAgentCapabilityBridge,
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<ToolResult> {
    try {
      // 1. Availability check: User or policy may have disabled this specialist
      if (this.registry && !this.registry.isAvailable(this.definition.name)) {
        return {
          content: `Specialist Error: Specialist agent '${this.definition.name}' is currently disabled in Gravitron settings.`,
          truncated: false,
        };
      }

      // 2. Strict Security Boundary: Arguments are sanitized, bounded, and passed to remote MCP.
      // Remote specialist receives ZERO access to local filesystem, bridge, or host shell.
      const outputText = await this.lifecycleManager.executeTool(this.definition.name, args || {}, {
        signal: context?.signal,
        timeoutMs: 60000,
        maxWaitSeconds: 50,
      });

      return {
        content: outputText || `(Specialist agent ${this.definition.name} returned empty output)`,
        truncated: false,
      };
    } catch (err: any) {
      return {
        content: `AgentRouter specialist invocation failed (${this.definition.name}): ${err.message}`,
        truncated: false,
      };
    }
  }
}
