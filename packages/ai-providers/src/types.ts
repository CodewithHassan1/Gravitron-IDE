export type JSONSchema = Record<string, any>;

export type ToolRiskLevel = 'read' | 'write' | 'execute' | 'destructive';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  riskLevel?: ToolRiskLevel;
}

export interface ToolCall {
  id: string; // Stable, provider-independent ID
  name: string;
  arguments: unknown; // Parsed JSON arguments
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string; // For tool responses
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export enum AIStreamEventType {
  TextDelta = 'text-delta',
  ToolCallStart = 'tool-call-start',
  ToolCallDelta = 'tool-call-delta',
  ToolCallComplete = 'tool-call-complete',
  Reasoning = 'reasoning',
  Usage = 'usage',
  Finish = 'finish',
  Error = 'error'
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIStreamEvent {
  type: AIStreamEventType;
  content?: string; // For text-delta or reasoning
  toolCall?: Partial<ToolCall> & { rawArguments?: string }; // For tool-call-*
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error' | null;
  error?: any;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface AIProvider {
  /** Unified chat completion API */
  completeChat(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
  
  /** Unified streaming API */
  streamChat(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<AIStreamEvent>;

  /** Generate embeddings for text */
  embed?(text: string, signal?: AbortSignal): Promise<number[]>;
  embedBatch?(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  timeoutMs?: number;
  maxRetries?: number;
}
