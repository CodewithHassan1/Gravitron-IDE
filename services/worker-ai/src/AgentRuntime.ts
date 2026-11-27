import { AgentSession, AgentSessionOptions } from './AgentSession';
import { ProviderFactory, ProviderType, ProviderConfig } from '@ag/ai-providers';
import { AgentProtocol } from '@ag/protocol';
import { AGENT_EXECUTE_SCOPE } from '@ag/auth';
import { ToolRegistry } from './tools/ToolRegistry';
import { DelegationContext, isDelegationContext } from './DelegationContext';

import { ReadFileTool } from './tools/builtin/ReadFileTool';
import { WriteFileTool } from './tools/builtin/WriteFileTool';
import { ExecuteCommandTool } from './tools/builtin/ExecuteCommandTool';
import { ExtendCommandTimeoutTool } from './tools/builtin/ExtendCommandTimeoutTool';
import { SearchWorkspaceTool } from './tools/builtin/SearchWorkspaceTool';
import { FindDefinitionTool } from './tools/builtin/FindDefinitionTool';
import { FindReferencesTool } from './tools/builtin/FindReferencesTool';
import { RepositoryMapTool } from './tools/builtin/RepositoryMapTool';
import { SemanticSearchTool } from './tools/builtin/SemanticSearchTool';
import { AgentRouterClient, AgentRouterClientOptions } from './mcp/AgentRouterClient';
import { AgentRouterTool } from './mcp/AgentRouterTool';
import { SpecialistRegistry } from './mcp/SpecialistRegistry';
import { SpecialistLifecycleManager } from './mcp/SpecialistLifecycleManager';

export class AgentRuntime {
  private sessions = new Map<string, AgentSession>();
  private toolRegistry = new ToolRegistry();
  private capabilityBridge: AgentProtocol.IAgentCapabilityBridge;
  private specialistRegistry = new SpecialistRegistry();
  private specialistClient?: AgentRouterClient;
  private specialistLifecycle?: SpecialistLifecycleManager;

  constructor(options: { capabilityBridge: AgentProtocol.IAgentCapabilityBridge }) {
    this.capabilityBridge = options.capabilityBridge;

    // Register builtin tools
    this.toolRegistry.register(new ReadFileTool());
    this.toolRegistry.register(new WriteFileTool());
    this.toolRegistry.register(new ExecuteCommandTool());
    this.toolRegistry.register(new ExtendCommandTimeoutTool());
    this.toolRegistry.register(new SearchWorkspaceTool());
    this.toolRegistry.register(new FindDefinitionTool());
    this.toolRegistry.register(new FindReferencesTool());
    this.toolRegistry.register(new RepositoryMapTool());
    this.toolRegistry.register(new SemanticSearchTool());
  }

  public async connectAgentRouter(options?: AgentRouterClientOptions): Promise<{
    connected: boolean;
    toolsDiscovered: number;
    tools: string[];
    approvedTools: string[];
    registeredTools: string[];
    error?: string;
  }> {
    try {
      this.specialistClient = new AgentRouterClient(options);
      await this.specialistClient.initialize();
      const mcpTools = await this.specialistClient.listTools();

      // Ingest dynamically discovered tools into the specialist registry
      this.specialistRegistry.registerDiscoveredTools(mcpTools);
      this.specialistLifecycle = new SpecialistLifecycleManager(this.specialistClient);

      const registeredNames: string[] = [];

      // Strict allowlist: Only approved and available tools are registered as executable
      for (const mcpTool of mcpTools) {
        if (
          this.specialistRegistry.isApproved(mcpTool.name) &&
          this.specialistRegistry.isAvailable(mcpTool.name)
        ) {
          const toolImpl = new AgentRouterTool(
            mcpTool,
            this.specialistClient,
            this.specialistRegistry,
            this.specialistLifecycle
          );
          this.toolRegistry.register(toolImpl);
          this.specialistRegistry.markRegistered(mcpTool.name);
          registeredNames.push(mcpTool.name);
        }
      }

      return {
        connected: true,
        toolsDiscovered: mcpTools.length,
        tools: mcpTools.map((t) => t.name),
        approvedTools: this.specialistRegistry.getApprovedToolNames(),
        registeredTools: registeredNames,
      };
    } catch (err: any) {
      return {
        connected: false,
        toolsDiscovered: 0,
        tools: [],
        approvedTools: [],
        registeredTools: [],
        error: err.message,
      };
    }
  }

  public getSpecialistRegistry(): SpecialistRegistry {
    return this.specialistRegistry;
  }

  public getSpecialistLifecycleManager(): SpecialistLifecycleManager | undefined {
    return this.specialistLifecycle;
  }

  /**
   * Enables an approved specialist tool dynamically at runtime.
   */
  public enableSpecialist(name: string): boolean {
    const success = this.specialistRegistry.enableSpecialist(name);
    if (success && this.specialistClient) {
      const toolDef = this.specialistRegistry.getToolDefinition(name);
      if (toolDef && !this.toolRegistry.has(name)) {
        const toolImpl = new AgentRouterTool(
          toolDef,
          this.specialistClient,
          this.specialistRegistry,
          this.specialistLifecycle
        );
        this.toolRegistry.register(toolImpl);
        this.specialistRegistry.markRegistered(name);
      }
    }
    return success;
  }

  /**
   * Disables an approved specialist tool dynamically at runtime.
   */
  public disableSpecialist(name: string): boolean {
    const success = this.specialistRegistry.disableSpecialist(name);
    if (success) {
      this.toolRegistry.unregister(name);
    }
    return success;
  }

  public getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  public getSnapshot(agentId: string): AgentProtocol.AgentSnapshot | null {
    const session = this.sessions.get(agentId);
    if (!session) return null;
    return session.getSnapshot();
  }

  public startAgent(
    workspaceId: string,
    conversationId: string,
    prompt: string,
    providerType: ProviderType,
    providerConfig: ProviderConfig,
    eventEmitter: (event: AgentProtocol.AgentEventEnvelope) => void,
    delegation: DelegationContext,
    agentId?: string,
    options?: AgentSessionOptions
  ): string {
    const id = agentId || crypto.randomUUID();

    // PHASE 8.3 ENFORCEMENT: a runtime can only start an agent under a
    // verified execution binding. The delegation is metadata-only (no raw
    // token) and must carry the agent-execute scope.
    if (!isDelegationContext(delegation)) {
      throw new Error('startAgent requires a DelegationContext. No execution may run unbound.');
    }
    if (delegation.scope !== AGENT_EXECUTE_SCOPE) {
      throw new Error(
        `startAgent requires scope ${AGENT_EXECUTE_SCOPE}, received ${delegation.scope}`
      );
    }

    if (this.sessions.has(id)) {
      throw new Error(`Agent ${id} is already running`);
    }

    const provider = ProviderFactory.createProvider(providerType, providerConfig);

    const session = new AgentSession(
      id,
      workspaceId,
      delegation,
      provider,
      eventEmitter,
      this.toolRegistry,
      this.capabilityBridge,
      options
    );
    this.sessions.set(id, session);

    // Fire and forget (it handles its own async loop)
    session.start(prompt).catch((err) => {
      console.error(`AgentSession ${id} crashed unexpectedly:`, err);
    });

    return id;
  }

  public cancelAgent(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.cancel();
    }
  }

  public cancelAll(): void {
    for (const session of this.sessions.values()) {
      session.cancel();
    }
  }

  public approveTool(
    agentId: string,
    approvalId: string,
    toolCallId: string,
    approved: boolean
  ): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.handleApproval(approvalId, toolCallId, approved);
    }
  }

  private cleanupSession(agentId: string): void {
    this.sessions.delete(agentId);
  }
}
