import { AIProvider, ProviderConfig } from './types';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { ProviderError, ProviderErrorType } from './errors';

export type ProviderType = 'openai' | 'anthropic' | 'gemini';

export class ProviderFactory {
  static createProvider(type: ProviderType, config: ProviderConfig): AIProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'gemini':
        return new GeminiProvider(config);
      default:
        throw new ProviderError(`Unsupported provider type: ${type}`, ProviderErrorType.InvalidRequest, 'factory', false);
    }
  }
}
