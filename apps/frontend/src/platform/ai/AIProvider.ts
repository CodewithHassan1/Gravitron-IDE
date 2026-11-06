export interface AIMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  name?: string;
}

export interface AIProviderConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  tools?: any[];
}

export interface IAIProvider {
  id: string;
  name: string;

  chat(messages: AIMessagePayload[], config?: AIProviderConfig): Promise<AIMessagePayload>;
  stream(
    messages: AIMessagePayload[],
    config?: AIProviderConfig
  ): AsyncGenerator<string, void, unknown>;
  embeddings(texts: string[]): Promise<number[][]>;
  cancel(): void;
  countTokens(text: string): Promise<number>;
  availableModels(): Promise<string[]>;
}
