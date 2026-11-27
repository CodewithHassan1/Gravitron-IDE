import { AgentProtocol, Channels, IntelligenceProtocol } from '@ag/protocol';
import { randomUUID } from 'crypto';
import { IWorkspaceService } from './IWorkspaceService';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { IntelligenceManager } from './IntelligenceManager';
import { AgentTimeoutSettingsStore } from './security/AgentTimeoutSettingsStore';

interface ActiveCommandController {
  commandId: string;
  agentId: string;
  workspaceId: string;
  command: string;
  description: string;
  sessionId?: string;
  startedAt: number;
  configuredTimeoutMs: number;
  deadlineAt: number;
  maxTimeoutMs: number;
  gracePeriodMs: number;
  warningRatio: number;
  criticalRatio: number;
  generation: number;
  settled: boolean;
  stdout: string;
  stderr: string;
  extensions: AgentProtocol.CommandTimeoutExtensionRecord[];
  status: AgentProtocol.ActiveCommandExecutionSnapshot['status'];
  warningLevel: 'none' | 'subtle' | 'critical';
  warningTimer: ReturnType<typeof setTimeout> | null;
  criticalTimer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  outputThrottleTimer: ReturnType<typeof setTimeout> | null;
  lastOutputBroadcastAt: number;
  onUpdate?: (execution: AgentProtocol.ActiveCommandExecutionSnapshot) => void;
  scheduleTimers: () => void;
  cleanupTimers: () => void;
  cancelCommand: () => Promise<boolean>;
}

function isPolicyOrLimitError(message: string): boolean {
  return /TERMINAL_RESOURCE_LIMIT_EXCEEDED|POLICY|UNAUTHORIZED|FORBIDDEN|DENIED|BLOCKED|OUTSIDE WORKSPACE/i.test(
    message
  );
}

export class AgentCapabilityBridgeImpl implements AgentProtocol.IAgentCapabilityBridge {
  private readHandler: (payload: any, ctx?: any) => Promise<any>;
  private writeHandler: (payload: any, ctx?: any) => Promise<any>;
  private timeoutSettingsStore: AgentTimeoutSettingsStore;
  private activeCommands = new Map<string, ActiveCommandController>();

  constructor(
    private workspaceService: IWorkspaceService,
    private workspaceExecutionService: IWorkspaceExecutionService,
    private intelligenceManager: IntelligenceManager,
    timeoutSettingsStore?: AgentTimeoutSettingsStore
  ) {
    const handlers = this.workspaceService.registerHandlers();
    this.readHandler = handlers.find((h) => h.channel === Channels.Workspace.ReadFile)!.handler;
    this.writeHandler = handlers.find((h) => h.channel === Channels.Workspace.WriteFile)!.handler;
    this.timeoutSettingsStore = timeoutSettingsStore || new AgentTimeoutSettingsStore();
  }

  public getTimeoutPolicy(): AgentProtocol.AgentTimeoutPolicy {
    return this.timeoutSettingsStore.getPolicy();
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

  private emitExecutionSnapshot(
    controller: ActiveCommandController,
    extra?: Partial<AgentProtocol.ActiveCommandExecutionSnapshot>
  ): void {
    if (!controller.onUpdate) return;
    const previewLimit = 1200;
    const rawPreview = controller.stdout.trimEnd();
    const outputPreview =
      rawPreview.length > previewLimit ? rawPreview.slice(-previewLimit) : rawPreview;

    controller.onUpdate({
      commandId: controller.commandId,
      agentId: controller.agentId,
      workspaceId: controller.workspaceId,
      command: controller.command,
      description: controller.description,
      status: controller.status,
      startedAt: controller.startedAt,
      deadlineAt: controller.deadlineAt,
      configuredTimeoutMs: controller.configuredTimeoutMs,
      maxTimeoutMs: controller.maxTimeoutMs,
      canExtend:
        !controller.settled &&
        controller.status !== 'terminating' &&
        controller.configuredTimeoutMs < controller.maxTimeoutMs,
      elapsedMs: Date.now() - controller.startedAt,
      warningLevel: controller.warningLevel,
      outputPreview: outputPreview || undefined,
      extensions: [...controller.extensions],
      ...extra,
    });
  }

  private async terminateExecutionSessionSafely(
    sessionId: string,
    gracePeriodMs: number
  ): Promise<{ exitedGracefully: boolean; pid?: number; terminationResult: string }> {
    if (typeof this.workspaceExecutionService.terminateSessionSafely === 'function') {
      return await this.workspaceExecutionService.terminateSessionSafely(sessionId, gracePeriodMs);
    }
    await this.workspaceExecutionService.terminateSession(sessionId);
    return {
      exitedGracefully: false,
      terminationResult: `Terminated session ${sessionId}`,
    };
  }

  public async extendCommandTimeout(
    context: AgentProtocol.AgentCapabilityContext,
    commandId: string,
    additionalMs: number,
    requestedBy: 'agent' | 'user',
    reason?: string
  ): Promise<{
    granted: boolean;
    newTimeoutMs: number;
    deadlineAt: number;
    addedMs: number;
    reason?: string;
  }> {
    const controller = this.activeCommands.get(commandId);
    if (!controller || controller.settled || controller.status === 'terminating') {
      return {
        granted: false,
        newTimeoutMs: controller?.configuredTimeoutMs ?? 0,
        deadlineAt: controller?.deadlineAt ?? 0,
        addedMs: 0,
        reason: 'No active command execution found for the specified commandId.',
      };
    }

    if (
      controller.agentId !== context.agentId ||
      controller.workspaceId !== context.workspaceId
    ) {
      return {
        granted: false,
        newTimeoutMs: controller.configuredTimeoutMs,
        deadlineAt: controller.deadlineAt,
        addedMs: 0,
        reason: 'Command execution does not belong to the requesting agent or workspace.',
      };
    }

    const policy = this.timeoutSettingsStore.getPolicy();
    if (requestedBy === 'agent' && !policy.allowAgentExtension) {
      return {
        granted: false,
        newTimeoutMs: controller.configuredTimeoutMs,
        deadlineAt: controller.deadlineAt,
        addedMs: 0,
        reason: 'Agent-initiated timeout extensions are disabled in Agent Settings.',
      };
    }

    const requestedAdd =
      typeof additionalMs === 'number' && Number.isFinite(additionalMs) && additionalMs > 0
        ? Math.round(additionalMs)
        : 0;
    if (requestedAdd <= 0) {
      return {
        granted: false,
        newTimeoutMs: controller.configuredTimeoutMs,
        deadlineAt: controller.deadlineAt,
        addedMs: 0,
        reason: 'Extension duration must be positive.',
      };
    }

    const maxPermitted = Math.min(controller.maxTimeoutMs, policy.maxPermittedTimeoutMs);
    const nextTimeoutMs = Math.min(maxPermitted, controller.configuredTimeoutMs + requestedAdd);
    const actualAddedMs = nextTimeoutMs - controller.configuredTimeoutMs;

    if (actualAddedMs <= 0) {
      return {
        granted: false,
        newTimeoutMs: controller.configuredTimeoutMs,
        deadlineAt: controller.deadlineAt,
        addedMs: 0,
        reason: `Maximum permitted command timeout (${Math.round(maxPermitted / 1000)}s) has already been reached.`,
      };
    }

    const previousTimeoutMs = controller.configuredTimeoutMs;
    controller.configuredTimeoutMs = nextTimeoutMs;
    controller.deadlineAt = controller.startedAt + nextTimeoutMs;
    controller.maxTimeoutMs = maxPermitted;
    controller.extensions.push({
      requestedBy,
      addedMs: actualAddedMs,
      previousTimeoutMs,
      newTimeoutMs: nextTimeoutMs,
      reason,
      timestamp: Date.now(),
    });

    // Reset warning level if newly computed deadline pushes elapsed ratio below thresholds
    const elapsedRatio = (Date.now() - controller.startedAt) / nextTimeoutMs;
    if (elapsedRatio < controller.warningRatio) {
      controller.warningLevel = 'none';
      controller.status = 'running';
    } else if (elapsedRatio < controller.criticalRatio) {
      controller.warningLevel = 'subtle';
      controller.status = 'warning';
    }

    controller.scheduleTimers();
    this.emitExecutionSnapshot(controller);

    return {
      granted: true,
      newTimeoutMs: nextTimeoutMs,
      deadlineAt: controller.deadlineAt,
      addedMs: actualAddedMs,
      reason,
    };
  }

  public async cancelCommand(
    context: AgentProtocol.AgentCapabilityContext,
    commandId: string
  ): Promise<boolean> {
    const controller = this.activeCommands.get(commandId);
    if (!controller || controller.settled) {
      return false;
    }
    if (
      controller.agentId !== context.agentId ||
      controller.workspaceId !== context.workspaceId
    ) {
      return false;
    }
    return await controller.cancelCommand();
  }

  public async dispose(): Promise<void> {
    const controllers = Array.from(this.activeCommands.values());
    for (const c of controllers) {
      c.cleanupTimers();
      if (c.sessionId) {
        await this.terminateExecutionSessionSafely(c.sessionId, 1_000).catch(() => {});
      }
      c.settled = true;
    }
    this.activeCommands.clear();
  }

  public async executeCommand(
    context: AgentProtocol.AgentCapabilityContext,
    command: string,
    cwd?: string,
    options?: AgentProtocol.CommandExecutionOptions
  ): Promise<AgentProtocol.CommandExecutionResult> {
    const commandId = options?.commandId || randomUUID();
    const description = options?.description?.trim() || command;

    if (context.signal?.aborted) {
      throw new Error('Aborted');
    }

    const policy = this.timeoutSettingsStore.getPolicy();
    const resolvedTimeout = this.timeoutSettingsStore.resolveEffectiveTimeout(
      options?.timeoutMs,
      options?.preset
    );

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

    const startedAt = Date.now();
    const controller: ActiveCommandController = {
      commandId,
      agentId: context.agentId,
      workspaceId: context.workspaceId,
      command,
      description,
      startedAt,
      configuredTimeoutMs: resolvedTimeout.effectiveTimeoutMs,
      deadlineAt: startedAt + resolvedTimeout.effectiveTimeoutMs,
      maxTimeoutMs: resolvedTimeout.maxTimeoutMs,
      gracePeriodMs: policy.terminationGracePeriodMs,
      warningRatio: policy.warningThresholdRatio,
      criticalRatio: policy.criticalThresholdRatio,
      generation: 0,
      settled: false,
      stdout: '',
      stderr: '',
      extensions: [],
      status: 'running',
      warningLevel: 'none',
      warningTimer: null,
      criticalTimer: null,
      timeoutTimer: null,
      outputThrottleTimer: null,
      lastOutputBroadcastAt: 0,
      onUpdate: context.onCommandExecutionUpdate,
      scheduleTimers: () => {},
      cleanupTimers: () => {
        if (controller.warningTimer) {
          clearTimeout(controller.warningTimer);
          controller.warningTimer = null;
        }
        if (controller.criticalTimer) {
          clearTimeout(controller.criticalTimer);
          controller.criticalTimer = null;
        }
        if (controller.timeoutTimer) {
          clearTimeout(controller.timeoutTimer);
          controller.timeoutTimer = null;
        }
        if (controller.outputThrottleTimer) {
          clearTimeout(controller.outputThrottleTimer);
          controller.outputThrottleTimer = null;
        }
      },
      cancelCommand: async () => false,
    };

    this.activeCommands.set(commandId, controller);
    this.emitExecutionSnapshot(controller);

    let session: Awaited<ReturnType<IWorkspaceExecutionService['execute']>>;
    try {
      session = await this.workspaceExecutionService.execute({
        workspaceId: context.workspaceId,
        target: {
          kind: 'local',
        },
        shellOverride,
        cwdOverride: cwd,
      });
    } catch (err: any) {
      controller.cleanupTimers();
      controller.settled = true;
      this.activeCommands.delete(commandId);
      const errMsg = err instanceof Error ? err.message : String(err);

      if (isPolicyOrLimitError(errMsg)) {
        controller.status = 'terminated_by_policy';
        this.emitExecutionSnapshot(controller, {
          status: 'terminated_by_policy',
          elapsedMs: Date.now() - startedAt,
          terminationResult: errMsg,
          exitCode: 1,
        });
        return {
          commandId,
          command,
          description,
          stdout: '',
          stderr: errMsg,
          exitCode: 1,
          outcome: 'terminated_by_policy',
          timedOut: false,
          cancelled: false,
          configuredTimeoutMs: controller.configuredTimeoutMs,
          elapsedMs: Date.now() - startedAt,
          terminationResult: errMsg,
          policyViolation: errMsg,
          extensions: [],
          canExtend: false,
        };
      }
      throw err;
    }

    controller.sessionId = session.id;
    let dataSub: { dispose?: () => void } | undefined;
    let exitSub: { dispose?: () => void } | undefined;
    let abortHandler: (() => void) | undefined;

    try {
      const outcomeResult = await new Promise<AgentProtocol.CommandExecutionResult>(
        (resolve, reject) => {
          const settleSuccess = (result: AgentProtocol.CommandExecutionResult) => {
            if (controller.settled) return;
            controller.settled = true;
            controller.cleanupTimers();
            this.activeCommands.delete(commandId);
            resolve(result);
          };

          const settleAbort = (err: Error) => {
            if (controller.settled) return;
            controller.settled = true;
            controller.cleanupTimers();
            this.activeCommands.delete(commandId);
            reject(err);
          };

          const triggerTimeout = async (capturedGen: number) => {
            // Stale-timer guard: never fire if superseded by extension or already settled
            if (controller.settled || controller.generation !== capturedGen) {
              return;
            }
            controller.settled = true;
            controller.cleanupTimers();
            controller.status = 'terminating';
            this.emitExecutionSnapshot(controller, { status: 'terminating' });

            let termResultStr = `Terminated after ${controller.configuredTimeoutMs}ms timeout`;
            try {
              const term = await this.terminateExecutionSessionSafely(
                session.id,
                controller.gracePeriodMs
              );
              termResultStr = term.terminationResult;
            } catch (e: any) {
              termResultStr = `Termination attempted (${e?.message || 'unknown error'})`;
            }

            const elapsedMs = Date.now() - controller.startedAt;
            controller.status = 'timed_out';
            this.activeCommands.delete(commandId);
            this.emitExecutionSnapshot(controller, {
              status: 'timed_out',
              elapsedMs,
              terminationResult: termResultStr,
              exitCode: -1,
            });

            resolve({
              commandId,
              command,
              description,
              stdout: controller.stdout,
              stderr: controller.stderr,
              exitCode: -1,
              outcome: 'timed_out',
              timedOut: true,
              cancelled: false,
              configuredTimeoutMs: controller.configuredTimeoutMs,
              elapsedMs,
              terminationResult: termResultStr,
              extensions: [...controller.extensions],
              canExtend: false,
            });
          };

          controller.cancelCommand = async () => {
            if (controller.settled) return false;
            controller.settled = true;
            controller.cleanupTimers();
            controller.status = 'terminating';
            this.emitExecutionSnapshot(controller, { status: 'terminating' });

            let termResultStr = 'Cancelled by user';
            try {
              const term = await this.terminateExecutionSessionSafely(
                session.id,
                Math.min(controller.gracePeriodMs, 2_000)
              );
              termResultStr = `Cancelled by user (${term.terminationResult})`;
            } catch {
              // Ignore
            }

            const elapsedMs = Date.now() - controller.startedAt;
            controller.status = 'cancelled_by_user';
            this.activeCommands.delete(commandId);
            this.emitExecutionSnapshot(controller, {
              status: 'cancelled_by_user',
              elapsedMs,
              terminationResult: termResultStr,
              exitCode: -1,
            });

            resolve({
              commandId,
              command,
              description,
              stdout: controller.stdout,
              stderr: controller.stderr,
              exitCode: -1,
              outcome: 'cancelled_by_user',
              timedOut: false,
              cancelled: true,
              configuredTimeoutMs: controller.configuredTimeoutMs,
              elapsedMs,
              terminationResult: termResultStr,
              extensions: [...controller.extensions],
              canExtend: false,
            });
            return true;
          };

          controller.scheduleTimers = () => {
            controller.cleanupTimers();
            controller.generation += 1;
            const gen = controller.generation;
            const now = Date.now();
            const totalDuration = controller.deadlineAt - controller.startedAt;

            const warningAt = controller.startedAt + Math.floor(totalDuration * controller.warningRatio);
            const criticalAt =
              controller.startedAt + Math.floor(totalDuration * controller.criticalRatio);

            const warningDelay = warningAt - now;
            if (warningDelay > 0) {
              controller.warningTimer = setTimeout(() => {
                if (controller.settled || controller.generation !== gen) return;
                if (controller.warningLevel === 'none') {
                  controller.warningLevel = 'subtle';
                  controller.status = 'warning';
                  this.emitExecutionSnapshot(controller);
                }
              }, warningDelay);
            } else if (controller.warningLevel === 'none' && now >= warningAt && now < criticalAt) {
              controller.warningLevel = 'subtle';
              controller.status = 'warning';
            }

            const criticalDelay = criticalAt - now;
            if (criticalDelay > 0) {
              controller.criticalTimer = setTimeout(() => {
                if (controller.settled || controller.generation !== gen) return;
                controller.warningLevel = 'critical';
                controller.status = 'critical';
                this.emitExecutionSnapshot(controller);
              }, criticalDelay);
            } else if (now >= criticalAt && now < controller.deadlineAt) {
              controller.warningLevel = 'critical';
              controller.status = 'critical';
            }

            const timeoutDelay = Math.max(1, controller.deadlineAt - now);
            controller.timeoutTimer = setTimeout(() => {
              void triggerTimeout(gen);
            }, timeoutDelay);
          };

          controller.scheduleTimers();

          dataSub = session.process.onData((data: Uint8Array) => {
            if (controller.settled) return;
            controller.stdout += new TextDecoder().decode(data);

            const now = Date.now();
            if (now - controller.lastOutputBroadcastAt >= 600) {
              controller.lastOutputBroadcastAt = now;
              this.emitExecutionSnapshot(controller);
            } else if (!controller.outputThrottleTimer) {
              controller.outputThrottleTimer = setTimeout(() => {
                controller.outputThrottleTimer = null;
                if (!controller.settled) {
                  controller.lastOutputBroadcastAt = Date.now();
                  this.emitExecutionSnapshot(controller);
                }
              }, 600);
            }
          }) as any;

          exitSub = session.process.onExit((code: number) => {
            if (controller.settled) return;
            const elapsedMs = Date.now() - controller.startedAt;
            const outcome: AgentProtocol.CommandExecutionOutcome =
              code === 0 ? 'completed' : 'failed';
            controller.status = outcome;
            this.emitExecutionSnapshot(controller, {
              status: outcome,
              elapsedMs,
              exitCode: code,
            });
            settleSuccess({
              commandId,
              command,
              description,
              stdout: controller.stdout,
              stderr: controller.stderr,
              exitCode: code,
              outcome,
              timedOut: false,
              cancelled: false,
              configuredTimeoutMs: controller.configuredTimeoutMs,
              elapsedMs,
              extensions: [...controller.extensions],
              canExtend: false,
            });
          }) as any;

          if (context.signal) {
            abortHandler = () => {
              if (controller.settled) return;
              controller.status = 'cancelled_by_user';
              this.emitExecutionSnapshot(controller, {
                status: 'cancelled_by_user',
                elapsedMs: Date.now() - controller.startedAt,
                terminationResult: 'Cancelled by user',
              });
              void this.terminateExecutionSessionSafely(
                session.id,
                Math.min(controller.gracePeriodMs, 2_000)
              ).catch(console.error);
              settleAbort(new Error('Aborted'));
            };
            if (context.signal.aborted) {
              abortHandler();
            } else {
              context.signal.addEventListener('abort', abortHandler, { once: true });
            }
          }
        }
      );

      return outcomeResult;
    } finally {
      controller.cleanupTimers();
      this.activeCommands.delete(commandId);
      try {
        dataSub?.dispose?.();
      } catch {
        // Ignore
      }
      try {
        exitSub?.dispose?.();
      } catch {
        // Ignore
      }
      if (context.signal && abortHandler) {
        try {
          context.signal.removeEventListener('abort', abortHandler);
        } catch {
          // Ignore
        }
      }
      await this.workspaceExecutionService.terminateSession(session.id).catch(() => {});
    }
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
