import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  AIStreamEvent,
  AIStreamEventType,
  ProviderConfig,
  ChatMessage,
  ToolCall
} from '../types';
import { ProviderError, ProviderErrorType } from '../errors';
import { AGLogger } from '@ag/logger';

const logger = new AGLogger('AnthropicProvider', '1.0.0');

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(private config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ProviderError('Anthropic API key is missing', ProviderErrorType.Authentication, 'anthropic', false);
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: 0, // We handle retries ourselves
      timeout: config.timeoutMs
    });
  }

  private mapError(err: any): ProviderError {
    if (err instanceof ProviderError) return err;

    if (err.name === 'AbortError') {
      return new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'anthropic', false);
    }

    if (err instanceof Anthropic.APIError) {
      if (err.status === 401 || err.status === 403) {
        return new ProviderError(err.message, ProviderErrorType.Authentication, 'anthropic', false, err.status);
      }
      if (err.status === 429) {
        return new ProviderError(err.message, ProviderErrorType.RateLimit, 'anthropic', true, err.status);
      }
      if (err.status === 408 || err.status === 504 || err.status === 524 || err.status === 529) {
        return new ProviderError(err.message, ProviderErrorType.Timeout, 'anthropic', true, err.status);
      }
      if (err.status === 400) {
        return new ProviderError(err.message, ProviderErrorType.InvalidRequest, 'anthropic', false, err.status);
      }

      const isTransient = err.status ? err.status >= 500 : true;
      return new ProviderError(err.message, ProviderErrorType.Unknown, 'anthropic', isTransient, err.status);
    }

    return new ProviderError(err.message || 'Unknown error', ProviderErrorType.Unknown, 'anthropic', false);
  }

  private extractSystemPrompt(messages: ChatMessage[]): string | undefined {
    const systemMsgs = messages.filter(m => m.role === 'system');
    if (systemMsgs.length === 0) return undefined;
    return systemMsgs.map(m => m.content).join('\n\n');
  }

  private mapMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    const nonSystem = messages.filter(m => m.role !== 'system');
    
    return nonSystem.map(msg => {
      let role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';
      let content: any[] = [];

      if (msg.role === 'user' || msg.role === 'assistant') {
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments as any
            });
          }
        }
      } else if (msg.role === 'tool') {
        role = 'user'; // Anthropic requires tool results from the 'user' role
        content.push({
          type: 'tool_result',
          tool_use_id: msg.toolCallId!,
          content: msg.content
        });
      }

      return { role, content };
    });
  }

  private mapTools(tools: CompletionRequest['tools']): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object',
        ...(t.inputSchema as any) // Directly passing the JSON Schema
      }
    }));
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const maxRetries = this.config.maxRetries ?? 3;
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'anthropic', false);
      }

      try {
        return await operation();
      } catch (err: any) {
        const mappedError = this.mapError(err);
        
        if (!mappedError.isTransient || attempt >= maxRetries || signal?.aborted) {
          throw mappedError;
        }

        attempt++;
        const delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        logger.warn({ trace_id: 'provider', span_id: 'retry', request_id: 'provider' }, 'Transient error, retrying', { attempt, delayMs, error: mappedError.message });
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, delayMs);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new ProviderError('Request cancelled during retry delay', ProviderErrorType.Cancelled, 'anthropic', false));
            }, { once: true });
          }
        });
      }
    }
  }

  async completeChat(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    return this.executeWithRetry(async () => {
      const system = this.extractSystemPrompt(req.messages);
      const messages = this.mapMessages(req.messages);
      const tools = this.mapTools(req.tools);

      const response: any = await this.client.messages.create({
        model: req.model,
        messages,
        system,
        temperature: req.temperature,
        max_tokens: req.maxTokens || 4096,
        tools
      } as any, { signal });

      let textContent = '';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content as any[]) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input
          });
        }
      }

      let finishReason: CompletionResponse['finishReason'] = 'stop';
      if ((response as any).stop_reason === 'max_tokens') finishReason = 'length';
      else if ((response as any).stop_reason === 'tool_use') finishReason = 'tool_calls';

      return {
        content: textContent,
        model: response.model,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason
      };
    }, signal);
  }

  async *streamChat(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<AIStreamEvent> {
    const streamPromise = this.executeWithRetry(async () => {
      const system = this.extractSystemPrompt(req.messages);
      const messages = this.mapMessages(req.messages);
      const tools = this.mapTools(req.tools);

      const result = await this.client.messages.create({
        model: req.model,
        messages,
        system,
        temperature: req.temperature,
        max_tokens: req.maxTokens || 4096,
        tools,
        stream: true
      } as any, { signal });
      return result as any;
    }, signal);

    const stream = await streamPromise;

    try {
      let currentToolCallId: string | undefined;

      for await (const event of stream) {
        if (signal?.aborted) {
          throw new ProviderError('Stream cancelled', ProviderErrorType.Cancelled, 'anthropic', false);
        }

        switch (event.type as string) {
          case 'message_start':
            yield {
              type: AIStreamEventType.Usage,
              usage: {
                promptTokens: (event as any).message.usage.input_tokens,
                completionTokens: (event as any).message.usage.output_tokens,
                totalTokens: (event as any).message.usage.input_tokens + (event as any).message.usage.output_tokens
              }
            };
            break;
            
          case 'content_block_start':
            if ((event as any).content_block.type === 'tool_use') {
              currentToolCallId = (event as any).content_block.id;
              yield {
                type: AIStreamEventType.ToolCallStart,
                toolCall: {
                  id: currentToolCallId,
                  name: (event as any).content_block.name
                }
              };
            }
            break;

          case 'content_block_delta':
            if ((event as any).delta.type === 'text_delta') {
              yield {
                type: AIStreamEventType.TextDelta,
                content: (event as any).delta.text
              };
            } else if ((event as any).delta.type === 'input_json_delta' && currentToolCallId) {
              yield {
                type: AIStreamEventType.ToolCallDelta,
                toolCall: {
                  id: currentToolCallId,
                  rawArguments: (event as any).delta.partial_json
                }
              };
            }
            break;

          case 'message_delta':
            if ((event as any).usage) {
              // Note: message_delta contains output token usage
              yield {
                type: AIStreamEventType.Usage,
                usage: {
                  promptTokens: 0,
                  completionTokens: (event as any).usage.output_tokens,
                  totalTokens: (event as any).usage.output_tokens
                }
              };
            }
            if ((event as any).delta.stop_reason) {
              let finishReason: CompletionResponse['finishReason'] = 'stop';
              if ((event as any).delta.stop_reason === 'max_tokens') finishReason = 'length';
              else if ((event as any).delta.stop_reason === 'tool_use') finishReason = 'tool_calls';
              
              yield {
                type: AIStreamEventType.Finish,
                finishReason
              };
            }
            break;
        }
      }
    } catch (err) {
      throw this.mapError(err);
    }
  }

  public async embed(text: string, signal?: AbortSignal): Promise<number[]> {
    throw new ProviderError('Embeddings are not supported by AnthropicProvider. Please configure an OpenAI provider for embeddings.', ProviderErrorType.InvalidRequest, 'anthropic', false);
  }

  public async embedBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    throw new ProviderError('Embeddings are not supported by AnthropicProvider. Please configure an OpenAI provider for embeddings.', ProviderErrorType.InvalidRequest, 'anthropic', false);
  }
}
