import { AIStreamEvent } from '@ag/ai-providers';

export namespace AgentProtocol {
  export interface StartRequest {
    workspaceId: string;
    conversationId: string;
    agentId?: string;
  }

  export interface CancelRequest {
    agentId: string;
  }

  export interface StartResponse {
    agentId: string;
  }

  export enum AgentState {
    Idle = 'Idle',
    Planning = 'Planning',
    CallingProvider = 'CallingProvider',
    Streaming = 'Streaming',
    ToolCallPending = 'ToolCallPending',
    AwaitingApproval = 'AwaitingApproval',
    ExecutingTool = 'ExecutingTool',
    Completed = 'Completed',
    Cancelled = 'Cancelled',
    Failed = 'Failed'
  }

  export interface ApproveToolRequest {
    agentId: string;
    approvalId: string;
    toolCallId: string;
    approved: boolean;
  }

  export enum AgentEventType {
    StateChanged = 'StateChanged',
    StreamEvent = 'StreamEvent',
    ToolApprovalRequested = 'ToolApprovalRequested',
    PlanUpdated = 'PlanUpdated',
  }

  export interface AgentPlanStep {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  }

  export interface AgentPlan {
    steps: AgentPlanStep[];
  }

  export interface StateChangedEvent {
    type: AgentEventType.StateChanged;
    agentId: string;
    state: AgentState;
    reason?: string;
  }

  export interface StreamEventPayload {
    type: AgentEventType.StreamEvent;
    agentId: string;
    event: AIStreamEvent;
  }

  export interface ToolApprovalRequestedEvent {
    type: AgentEventType.ToolApprovalRequested;
    agentId: string;
    approvalId: string;
    toolCallId: string;
    toolName: string;
    arguments: unknown;
  }

  export interface PlanUpdatedEvent {
    type: AgentEventType.PlanUpdated;
    agentId: string;
    plan: AgentPlan;
  }

  export interface SnapshotRequest {
    agentId: string;
  }

  export interface DisplayMessage {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    timestamp: number;
    toolCalls?: {
      id: string;
      name: string;
      arguments: unknown;
    }[];
    toolCallId?: string;
  }

  export interface AgentSnapshot {
    agentId: string;
    workspaceId: string;
    state: AgentState;
    displayMessages: DisplayMessage[];
    pendingApproval?: {
      approvalId: string;
      toolCallId: string;
      toolName: string;
      arguments: unknown;
    };
    plan?: AgentPlan;
    sequence: number;
  }

  export type AgentEventPayload =
    | StateChangedEvent
    | StreamEventPayload
    | ToolApprovalRequestedEvent
    | PlanUpdatedEvent;

  export interface AgentEventEnvelope {
    eventId: string;
    agentId: string;
    workspaceId: string;
    sequence: number;
    timestamp: number;
    type: AgentEventType;
    payload: AgentEventPayload;
  }

  export interface AgentCapabilityContext {
    agentId: string;
    workspaceId: string;
    signal: AbortSignal;
  }

  export interface IntelligenceQueryResult<T> {
    workspaceId: string;
    snapshotSequence: number;
    results: T[];
  }

  export interface DefinitionResult {
    symbolName: string;
    kind: string;
    filePath: string;
    line: number;
    column: number;
    startOffset?: number;
    endOffset?: number;
    snippet?: string;
  }

  export interface ReferenceResult {
    symbolName: string;
    filePath: string;
    line: number;
    column: number;
    startOffset?: number;
    endOffset?: number;
  }

  export interface RepositoryMapResult {
    content: string;
  }

  export interface SemanticSearchResult {
    filePath: string;
    chunkId: string;
    score: number;
    content: string;
    symbolName?: string;
  }

  export interface IAgentCapabilityBridge {
    readFile(
      context: AgentCapabilityContext,
      path: string
    ): Promise<string>;

    writeFile(
      context: AgentCapabilityContext,
      path: string,
      content: string | Uint8Array
    ): Promise<void>;

    executeCommand(
      context: AgentCapabilityContext,
      command: string,
      cwd?: string
    ): Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;

    searchWorkspace(
      context: AgentCapabilityContext,
      query: string,
      options?: { limit?: number }
    ): Promise<IntelligenceQueryResult<DefinitionResult>>;

    findDefinition(
      context: AgentCapabilityContext,
      symbolName: string,
      options?: { limit?: number }
    ): Promise<IntelligenceQueryResult<DefinitionResult>>;

    findReferences(
      context: AgentCapabilityContext,
      symbolName: string,
      options?: { limit?: number }
    ): Promise<IntelligenceQueryResult<ReferenceResult>>;

    getRepositoryMap(
      context: AgentCapabilityContext
    ): Promise<IntelligenceQueryResult<RepositoryMapResult>>;

    semanticSearch(
      context: AgentCapabilityContext,
      query: string,
      options?: { limit?: number }
    ): Promise<IntelligenceQueryResult<SemanticSearchResult>>;

    addEpisodicMemory(
      context: AgentCapabilityContext,
      sessionId: string,
      memory: any
    ): Promise<void>;

    getEpisodicMemory(
      context: AgentCapabilityContext,
      sessionId: string,
      limit?: number
    ): Promise<any[]>;

    addLongTermMemory(
      context: AgentCapabilityContext,
      memory: any
    ): Promise<void>;

    getLongTermMemory(
      context: AgentCapabilityContext,
      limit?: number
    ): Promise<any[]>;

    searchLongTermMemory(
      context: AgentCapabilityContext,
      queryEmbedding: number[],
      limit?: number
    ): Promise<any[]>;
  }
}