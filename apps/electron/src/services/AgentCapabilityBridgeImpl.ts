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
    const isWin = process.platform === 'win32';
    const shellOverride = isWin
      ? {
          executable: 'powershell.exe',
          args: ['-NoProfile', '-NonInteractive', '-Command', command],
        }
      : {
          executable: '/bin/sh',
          args: ['-c', command],
        };

    const session = await this.workspaceExecutionService.execute({
      workspaceId: context.workspaceId,
      target: {
        kind: 'local',
      },
      shellOverride,
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

  // Volatile, in-memory memory cache scoped by workspace and session.
  // Note: Provides ephemeral session caching only; durable persistent memory delegates to worker-intelligence when active.
  private episodicMemoryStore = new Map<string, any[]>();
  private longTermMemoryStore = new Map<string, any[]>();
  private readonly MAX_EPISODIC_PER_SESSION = 100;
  private readonly MAX_SESSIONS = 50;
  private readonly MAX_LONG_TERM_PER_WORKSPACE = 500;

  // --- Memory Implementation (Satisfies IAgentCapabilityBridge interface) ---

  public async addEpisodicMemory(
    context: AgentProtocol.AgentCapabilityContext,
    sessionId: string,
    memory: any
  ): Promise<void> {
    const key = `${context.workspaceId}:${sessionId}`;
    const list = this.episodicMemoryStore.get(key) || [];
    list.push(memory);
    if (list.length > this.MAX_EPISODIC_PER_SESSION) {
      list.splice(0, list.length - this.MAX_EPISODIC_PER_SESSION);
    }
    this.episodicMemoryStore.set(key, list);

    if (this.episodicMemoryStore.size > this.MAX_SESSIONS) {
      const oldestKey = this.episodicMemoryStore.keys().next().value;
      if (oldestKey) {
        this.episodicMemoryStore.delete(oldestKey);
      }
    }
  }

  public async getEpisodicMemory(
    context: AgentProtocol.AgentCapabilityContext,
    sessionId: string,
    limit?: number
  ): Promise<any[]> {
    const key = `${context.workspaceId}:${sessionId}`;
    const list = this.episodicMemoryStore.get(key) || [];
    if (limit && limit > 0) {
      return list.slice(-limit);
    }
    return list;
  }

  public async addLongTermMemory(
    context: AgentProtocol.AgentCapabilityContext,
    memory: any
  ): Promise<void> {
    const list = this.longTermMemoryStore.get(context.workspaceId) || [];
    list.push(memory);
    if (list.length > this.MAX_LONG_TERM_PER_WORKSPACE) {
      list.splice(0, list.length - this.MAX_LONG_TERM_PER_WORKSPACE);
    }
    this.longTermMemoryStore.set(context.workspaceId, list);
  }

  public async getLongTermMemory(
    context: AgentProtocol.AgentCapabilityContext,
    limit?: number
  ): Promise<any[]> {
    const list = this.longTermMemoryStore.get(context.workspaceId) || [];
    if (limit && limit > 0) {
      return list.slice(-limit);
    }
    return list;
  }

  public async searchLongTermMemory(
    context: AgentProtocol.AgentCapabilityContext,
    queryEmbedding: number[],
    limit?: number
  ): Promise<any[]> {
    const list = this.longTermMemoryStore.get(context.workspaceId) || [];
    if (!queryEmbedding || queryEmbedding.length === 0 || list.length === 0) {
      return [];
    }

    const scored = list
      .filter((m) => Array.isArray(m.embedding) && m.embedding.length === queryEmbedding.length)
      .map((m) => ({
        memory: m,
        score: this.cosineSimilarity(queryEmbedding, m.embedding),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const maxResults = limit && limit > 0 ? limit : 5;
    return scored.slice(0, maxResults).map((s) => s.memory);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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
