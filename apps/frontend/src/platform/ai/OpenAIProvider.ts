import { IAIProvider, AIMessagePayload, AIProviderConfig } from './AIProvider';

export class OpenAIProvider implements IAIProvider {
  id = 'openai';
  name = 'OpenAI';
  private abortController: AbortController | null = null;

  async chat(messages: AIMessagePayload[], config?: AIProviderConfig): Promise<AIMessagePayload> {
    // Basic implementation outline
    this.abortController = new AbortController();
    return { role: 'assistant', content: 'Not implemented in stub.' };
  }

  async *stream(
    messages: AIMessagePayload[],
    config?: AIProviderConfig
  ): AsyncGenerator<string, void, unknown> {
    this.abortController = new AbortController();
    yield 'Streaming ';
    yield 'from ';
    yield 'OpenAI stub.';
  }

  async embeddings(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0, 0, 0]); // Stub
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4); // Rough approximation
  }

  async availableModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
  }
}
