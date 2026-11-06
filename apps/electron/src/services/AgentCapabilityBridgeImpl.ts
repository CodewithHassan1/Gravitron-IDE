import { AgentProtocol, Channels, IntelligenceProtocol } from '@ag/protocol';
import { IWorkspaceService } from './IWorkspaceService';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { IntelligenceManager } from './IntelligenceManager';

export class AgentCapabilityBridgeImpl implements AgentProtocol.IAgentCapabilityBridge {
  private readHandler: (payload: any, ctx?: any) => Promise<any>;
  private writeHandler: (payload: any, ctx?: any) => Promise<any>;

  constructor(
    private workspaceService: IWorkspaceService,
    private workspaceExecutionService: IWorkspaceExecutionService,
    private intelligenceManager: IntelligenceManager
  ) {
    const handlers = this.workspaceService.registerHandlers();
    this.readHandler = handlers.find((h) => h.channel === Channels.Workspace.ReadFile)!.handler;
    this.writeHandler = handlers.find((h) => h.channel === Channels.Workspace.WriteFile)!.handler;
  }

  public async searchWorkspace(
    context: AgentProtocol.AgentCapabilityContext,
    query: string,
    options?: { limit?: number }
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.DefinitionResult>> {
    return await this.intelligenceManager.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.SearchWorkspace,
      context.workspaceId,
      { query, options }
    );
  }

  public async findDefinition(
    context: AgentProtocol.AgentCapabilityContext,
    symbolName: string,
    options?: { limit?: number }
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.DefinitionResult>> {
    return await this.intelligenceManager.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.FindDefinition,
      context.workspaceId,
      { symbolName, options }
    );
  }

  public async findReferences(
    context: AgentProtocol.AgentCapabilityContext,
    symbolName: string,
    options?: { limit?: number }
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.ReferenceResult>> {
    return await this.intelligenceManager.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.FindReferences,
      context.workspaceId,
      { symbolName, options }
    );
  }

  public async getRepositoryMap(
    context: AgentProtocol.AgentCapabilityContext
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.RepositoryMapResult>> {
    return await this.intelligenceManager.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.GetRepositoryMap,
      context.workspaceId,
      {}
    );
  }

  public async semanticSearch(
    context: AgentProtocol.AgentCapabilityContext,
    query: string,
    options?: { limit?: number }
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.SemanticSearchResult>> {
    return await this.intelligenceManager.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.SemanticSearch,
      context.workspaceId,
      { query, options }
    );
  }

  public async readFile(
    context: AgentProtocol.AgentCapabilityContext,
    path: string
  ): Promise<string> {
    return await this.readHandler({ workspaceId: context.workspaceId, path });
  }

  public async writeFile(
    context: AgentProtocol.AgentCapabilityContext,
    path: string,
    content: string | Uint8Array
  ): Promise<void> {
    return await this.writeHandler({ workspaceId: context.workspaceId, path, content });
  }

  public async executeCommand(
    context: AgentProtocol.AgentCapabilityContext,
    command: string,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const session = await this.workspaceExecutionService.execute({
      workspaceId: context.workspaceId,
      target: {
        kind: 'local',
      },
      shellOverride: {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', command],
      },
      cwdOverride: cwd,
    });

    let stdout = '';
    const stderr = '';
    let exitCode = 1;

    try {
      const result = await new Promise<{ exitCode: number }>((resolve, reject) => {
        let finished = false;

        const finish = (code: number) => {
          if (finished) return;
          finished = true;
          resolve({ exitCode: code });
        };

        session.process.onData((data: Uint8Array) => {
          stdout += new TextDecoder().decode(data);
        });

        session.process.onExit((code: number) => {
          finish(code);
        });

        if (context.signal) {
          context.signal.addEventListener('abort', () => {
            if (!finished) {
              this.workspaceExecutionService.terminateSession(session.id).catch(console.error);
              reject(new Error('Aborted'));
            }
          });
        }
      });

      exitCode = result.exitCode;
    } finally {
      await this.workspaceExecutionService.terminateSession(session.id).catch(() => {});
    }

    return { stdout, stderr, exitCode };
  }

  // --- Memory Implementation (Satisfies IAgentCapabilityBridge interface) ---

  public async addEpisodicMemory(
    context: AgentProtocol.AgentCapabilityContext,
    memory: any
  ): Promise<void> {
    void context;
    void memory;
  }

  public async getEpisodicMemory(
    context: AgentProtocol.AgentCapabilityContext,
    query?: any
  ): Promise<any[]> {
    void context;
    void query;
    return [];
  }

  public async addLongTermMemory(
    context: AgentProtocol.AgentCapabilityContext,
    memory: any
  ): Promise<void> {
    void context;
    void memory;
  }

  public async getLongTermMemory(
    context: AgentProtocol.AgentCapabilityContext,
    limit?: number
  ): Promise<any[]> {
    void context;
    void limit;
    return [];
  }

  public async searchLongTermMemory(
    context: AgentProtocol.AgentCapabilityContext,
    queryEmbedding: number[],
    limit?: number
  ): Promise<any[]> {
    void context;
    void queryEmbedding;
    void limit;
    return [];
  }

  public async upsertDocuments(
    context: AgentProtocol.AgentCapabilityContext,
    documents: Array<{
      id: string;
      metadata?: Record<string, unknown>;
      pageContent: string;
    }>,
    upsertOptions: {
      deleteStrategy?:
        | {
            type: 'by_ids';
            ids: string[];
          }
        | {
            type: 'all';
          };
      batchSize?: number;
    }
  ): Promise<void> {
    void context;
    void documents;
    void upsertOptions;
  }
}
