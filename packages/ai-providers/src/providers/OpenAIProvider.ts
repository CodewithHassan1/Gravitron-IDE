import { OpenAI } from 'openai';
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

const logger = new AGLogger('OpenAIProvider', '1.0.0');

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(private config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ProviderError('OpenAI API key is missing', ProviderErrorType.Authentication, 'openai', false);
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
      timeout: config.timeoutMs,
      maxRetries: 0 // We handle retries ourselves
    });
  }

  private mapError(err: any): ProviderError {
    if (err instanceof ProviderError) return err;
    
    if (err.name === 'AbortError') {
      return new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'openai', false);
    }
    
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        return new ProviderError(err.message, ProviderErrorType.Authentication, 'openai', false, err.status);
      }
      if (err.status === 429) {
        return new ProviderError(err.message, ProviderErrorType.RateLimit, 'openai', true, err.status);
      }
      if (err.status === 408 || err.status === 504 || err.status === 524) {
        return new ProviderError(err.message, ProviderErrorType.Timeout, 'openai', true, err.status);
      }
      if (err.status === 400) {
        if (err.message.includes('context_length_exceeded')) {
          return new ProviderError(err.message, ProviderErrorType.ContextExhausted, 'openai', false, err.status);
        }
        return new ProviderError(err.message, ProviderErrorType.InvalidRequest, 'openai', false, err.status);
      }
      
      const isTransient = err.status ? err.status >= 500 : true;
      return new ProviderError(err.message, ProviderErrorType.Unknown, 'openai', isTransient, err.status);
    }

    return new ProviderError(err.message || 'Unknown error', ProviderErrorType.Unknown, 'openai', false);
  }

  private mapMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      const base: any = { role: msg.role, content: msg.content };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        base.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) }
        }));
      }
      if (msg.toolCallId) {
        base.tool_call_id = msg.toolCallId;
      }
      return base;
    });
  }

  private mapTools(tools: CompletionRequest['tools']): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>
      }
    }));
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const maxRetries = this.config.maxRetries ?? 3;
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'openai', false);
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
              reject(new ProviderError('Request cancelled during retry delay', ProviderErrorType.Cancelled, 'openai', false));
            }, { once: true });
          }
        });
      }
    }
  }

  async completeChat(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: req.model,
        messages: this.mapMessages(req.messages),
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        tools: this.mapTools(req.tools)
      }, { signal });

      const choice = response.choices[0];
      const message = choice.message;

      let parsedToolCalls: ToolCall[] | undefined;
      if (message.tool_calls) {
        parsedToolCalls = message.tool_calls.map(tc => {
          let parsedArgs: unknown = tc.function.arguments;
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch (e) {
            // Keep as string if parsing fails
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs
          };
        });
      }

      return {
        content: message.content || '',
        model: response.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        },
        toolCalls: parsedToolCalls,
        finishReason: choice.finish_reason as any
      };
    }, signal);
  }

  async *streamChat(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<AIStreamEvent> {
    const streamPromise = this.executeWithRetry(async () => {
      return await this.client.chat.completions.create({
        model: req.model,
        messages: this.mapMessages(req.messages),
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        tools: this.mapTools(req.tools),
        stream: true,
        stream_options: { include_usage: true }
      }, { signal });
    }, signal);

    const stream = await streamPromise;

    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new ProviderError('Stream cancelled', ProviderErrorType.Cancelled, 'openai', false);
        }

        if (chunk.usage) {
          yield {
            type: AIStreamEventType.Usage,
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens
            }
          };
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.delta.content) {
          yield {
            type: AIStreamEventType.TextDelta,
            content: choice.delta.content
          };
        }

        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            if (tc.function?.name) {
              yield {
                type: AIStreamEventType.ToolCallStart,
                toolCall: {
                  id: tc.id || `tc_${tc.index}`,
                  name: tc.function.name
                }
              };
            }
            if (tc.function?.arguments) {
              yield {
                type: AIStreamEventType.ToolCallDelta,
                toolCall: {
                  id: tc.id || `tc_${tc.index}`,
                  rawArguments: tc.function.arguments
                }
              };
            }
          }
        }

        if (choice.finish_reason) {
          yield {
            type: AIStreamEventType.Finish,
            finishReason: choice.finish_reason as any
          };
        }
      }
    } catch (err) {
      throw this.mapError(err);
    }
  }

  public async embed(text: string, signal?: AbortSignal): Promise<number[]> {
    const results = await this.embedBatch([text], signal);
    return results[0];
  }

  public async embedBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    return this.executeWithRetry(async () => {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      }, { signal });
      
      // OpenAI returns results in order, but we can verify via index
      const vectors = new Array<number[]>(texts.length);
      for (const d of response.data) {
        vectors[d.index] = d.embedding;
      }
      return vectors;
    }, signal);
  }
}
