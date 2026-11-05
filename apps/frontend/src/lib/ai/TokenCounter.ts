import { AIMessagePayload } from '../../platform/ai/AIProvider';

export class TokenCounter {
  static estimateTokens(text: string): number {
    // Rough estimation: 1 token ~= 4 chars in english
    return Math.ceil(text.length / 4);
  }
}

export class PromptCompressor {
  static compress(messages: AIMessagePayload[], maxTokens: number): AIMessagePayload[] {
    // Stub implementation: Just returns as is.
    // Real implementation would summarize or truncate oldest contextual messages.
    return messages;
  }
}
