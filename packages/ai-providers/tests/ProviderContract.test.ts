import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderFactory } from '../src/factory';
import { ProviderConfig, CompletionRequest, AIStreamEventType, ProviderErrorType } from '../src';
import { ProviderError } from '../src/errors';

// Mock the underlying SDKs
vi.mock('openai', () => {
  return {
    OpenAI: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4',
            choices: [{ message: { content: 'Mock response', finish_reason: 'stop' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
          })
        }
      };
    }
  };
});

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: vi.fn().mockResolvedValue({
          model: 'claude-3',
          content: [{ type: 'text', text: 'Mock response' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 }
        })
      };
    }
  };
});

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'Mock response' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 }
        })
      };
    }
  };
});

const req: CompletionRequest = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'Hello' }]
};

const config: ProviderConfig = { apiKey: 'test-key', maxRetries: 1 };

describe('Provider Contract', () => {
  const providers = ['openai', 'anthropic', 'gemini'] as const;

  providers.forEach(providerType => {
    describe(`${providerType} provider`, () => {
      let provider: any;
      
      beforeEach(() => {
        vi.clearAllMocks();
        provider = ProviderFactory.createProvider(providerType, config);
      });

      it('performs normal completion', async () => {
        const response = await provider.completeChat(req);
        expect(response.content).toBe('Mock response');
        expect(response.usage).toBeDefined();
        expect(response.usage.totalTokens).toBe(20);
      });

      it('aborts using AbortSignal', async () => {
        const controller = new AbortController();
        controller.abort(); // immediately abort
        
        await expect(provider.completeChat(req, controller.signal))
          .rejects.toThrowError(/cancelled/i);
      });
      
      it('throws Authentication error when key is missing', () => {
        expect(() => ProviderFactory.createProvider(providerType, {}))
          .toThrowError(/API key is missing/i);
      });
    });
  });
});
