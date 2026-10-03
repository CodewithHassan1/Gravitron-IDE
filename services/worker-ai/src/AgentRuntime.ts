import { AgentSession } from './AgentSession';
import { ProviderFactory, ProviderType, ProviderConfig } from '@ag/ai-providers';
import { AgentProtocol } from '@ag/protocol';
import { ToolRegistry } from './tools/ToolRegistry';

import { ReadFileTool } from './tools/builtin/ReadFileTool';
import { WriteFileTool } from './tools/builtin/WriteFileTool';
import { ExecuteCommandTool } from './tools/builtin/ExecuteCommandTool';
import { SearchWorkspaceTool } from './tools/builtin/SearchWorkspaceTool';
import { FindDefinitionTool } from './tools/builtin/FindDefinitionTool';
import { FindReferencesTool } from './tools/builtin/FindReferencesTool';
import { RepositoryMapTool } from './tools/builtin/RepositoryMapTool';
import { SemanticSearchTool } from './tools/builtin/SemanticSearchTool';

export class AgentRuntime {
  private sessions = new Map<string, AgentSession>();
  private toolRegistry = new ToolRegistry();
  private capabilityBridge: AgentProtocol.IAgentCapabilityBridge;

  constructor(options: { capabilityBridge: AgentProtocol.IAgentCapabilityBridge }) {
    this.capabilityBridge = options.capabilityBridge;
    
    // Register builtin tools
    this.toolRegistry.register(new ReadFileTool());
    this.toolRegistry.register(new WriteFileTool());
    this.toolRegistry.register(new ExecuteCommandTool());
    this.toolRegistry.register(new SearchWorkspaceTool());
    this.toolRegistry.register(new FindDefinitionTool());
    this.toolRegistry.register(new FindReferencesTool());
    this.toolRegistry.register(new RepositoryMapTool());
    this.toolRegistry.register(new SemanticSearchTool());
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
    agentId?: string
  ): string {
    const id = agentId || crypto.randomUUID();
    
    if (this.sessions.has(id)) {
      throw new Error(`Agent ${id} is already running`);
    }

    const provider = ProviderFactory.createProvider(providerType, providerConfig);
    
    const session = new AgentSession(id, workspaceId, provider, eventEmitter, this.toolRegistry, this.capabilityBridge);
    this.sessions.set(id, session);

    // Fire and forget (it handles its own async loop)
    session.start(prompt).catch(err => {
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

  public approveTool(agentId: string, approvalId: string, toolCallId: string, approved: boolean): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.handleApproval(approvalId, toolCallId, approved);
    }
  }

  private cleanupSession(agentId: string): void {
    this.sessions.delete(agentId);
  }
}
