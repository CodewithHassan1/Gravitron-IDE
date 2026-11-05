import { IAIProvider, AIMessagePayload, AIProviderConfig } from './AIProvider';

export class AnthropicProvider implements IAIProvider {
  id = 'anthropic';
  name = 'Anthropic';

  async chat(messages: AIMessagePayload[], config?: AIProviderConfig): Promise<AIMessagePayload> {
    return { role: 'assistant', content: 'Stub' };
  }

  async *stream(
    messages: AIMessagePayload[],
    config?: AIProviderConfig
  ): AsyncGenerator<string, void, unknown> {
    yield 'Stub';
  }

  async embeddings(texts: string[]): Promise<number[][]> {
    return [];
  }
  cancel(): void {}
  async countTokens(text: string): Promise<number> {
    return 0;
  }
  async availableModels(): Promise<string[]> {
    return ['claude-3-opus', 'claude-3-sonnet'];
  }
}

export class GeminiProvider implements IAIProvider {
  id = 'gemini';
  name = 'Google Gemini';

  async chat(messages: AIMessagePayload[], config?: AIProviderConfig): Promise<AIMessagePayload> {
    return { role: 'assistant', content: 'Stub' };
  }

  async *stream(
    messages: AIMessagePayload[],
    config?: AIProviderConfig
  ): AsyncGenerator<string, void, unknown> {
    yield 'Stub';
  }

  async embeddings(texts: string[]): Promise<number[][]> {
    return [];
  }
  cancel(): void {}
  async countTokens(text: string): Promise<number> {
    return 0;
  }
  async availableModels(): Promise<string[]> {
    return ['gemini-1.5-pro', 'gemini-1.5-flash'];
  }
}

export class OllamaProvider implements IAIProvider {
  id = 'ollama';
  name = 'Ollama (Local)';

  async chat(messages: AIMessagePayload[], config?: AIProviderConfig): Promise<AIMessagePayload> {
    return { role: 'assistant', content: 'Stub' };
  }

  async *stream(
    messages: AIMessagePayload[],
    config?: AIProviderConfig
  ): AsyncGenerator<string, void, unknown> {
    yield 'Stub';
  }

  async embeddings(texts: string[]): Promise<number[][]> {
    return [];
  }
  cancel(): void {}
  async countTokens(text: string): Promise<number> {
    return 0;
  }
  async availableModels(): Promise<string[]> {
    return ['llama3', 'mistral'];
  }
}

export class AzureOpenAIProvider implements IAIProvider {
  id = 'azure';
  name = 'Azure OpenAI';

  async chat(messages: AIMessagePayload[], config?: AIProviderConfig): Promise<AIMessagePayload> {
    return { role: 'assistant', content: 'Stub' };
  }

  async *stream(
    messages: AIMessagePayload[],
    config?: AIProviderConfig
  ): AsyncGenerator<string, void, unknown> {
    yield 'Stub';
  }

  async embeddings(texts: string[]): Promise<number[][]> {
    return [];
  }
  cancel(): void {}
  async countTokens(text: string): Promise<number> {
    return 0;
  }
  async availableModels(): Promise<string[]> {
    return ['gpt-4'];
  }
}
