import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  AIStreamEvent,
  AIStreamEventType,
  ProviderConfig,
  ChatMessage,
  ToolCall,
} from '../types';
import { ProviderError, ProviderErrorType } from '../errors';
import { AGLogger } from '@ag/logger';

const logger = new AGLogger('GeminiProvider', '1.0.0');

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;

  constructor(private config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ProviderError(
        'Gemini API key is missing',
        ProviderErrorType.Authentication,
        'gemini',
        false
      );
    }
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      // Note: @google/genai doesn't natively expose timeout directly in the constructor in the same way,
      // but we will enforce AbortSignal natively.
    });
  }

  private mapError(err: any): ProviderError {
    if (err instanceof ProviderError) return err;

    if (err.name === 'AbortError') {
      return new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'gemini', false);
    }

    // Google API errors typically have err.status
    if (err.status) {
      if (err.status === 401 || err.status === 403) {
        return new ProviderError(
          err.message,
          ProviderErrorType.Authentication,
          'gemini',
          false,
          err.status
        );
      }
      if (err.status === 429) {
        return new ProviderError(
          err.message,
          ProviderErrorType.RateLimit,
          'gemini',
          true,
          err.status
        );
      }
      if (err.status === 400) {
        return new ProviderError(
          err.message,
          ProviderErrorType.InvalidRequest,
          'gemini',
          false,
          err.status
        );
      }
      if (err.status >= 500) {
        return new ProviderError(
          err.message,
          ProviderErrorType.Unknown,
          'gemini',
          true,
          err.status
        );
      }
    }

    return new ProviderError(
      err.message || 'Unknown error',
      ProviderErrorType.Unknown,
      'gemini',
      false
    );
  }

  private mapMessages(messages: ChatMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Handled in systemInstruction
        continue;
      }

      let role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments as any,
            },
          });
        }
      }

      if (msg.role === 'tool') {
        role = 'user'; // Tool results are passed in user messages
        let responseParsed: any = msg.content;
        try {
          responseParsed = JSON.parse(msg.content);
        } catch (e) {
          responseParsed = { result: msg.content };
        }
        parts.push({
          functionResponse: {
            name: msg.toolCallId || 'unknown_tool',
            response: responseParsed,
          },
        });
      }

      contents.push({ role, parts });
    }

    return contents;
  }

  private mapTools(tools: CompletionRequest['tools']): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema, // @google/genai accepts JSON schema directly here
        })),
      },
    ];
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const maxRetries = this.config.maxRetries ?? 3;
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'gemini', false);
      }

      try {
        // Enforce timeout combined with signal manually if needed
        const abortController = new AbortController();
        const onAbort = () => abortController.abort();

        let timeoutId: any;
        if (this.config.timeoutMs) {
          timeoutId = setTimeout(
            () => abortController.abort(new Error('Timeout')),
            this.config.timeoutMs
          );
        }

        if (signal) {
          signal.addEventListener('abort', onAbort);
        }

        try {
          return await operation();
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          if (signal) signal.removeEventListener('abort', onAbort);
        }
      } catch (err: any) {
        const mappedError = this.mapError(err);

        if (!mappedError.isTransient || attempt >= maxRetries || signal?.aborted) {
          throw mappedError;
        }

        attempt++;
        const delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        logger.warn(
          { trace_id: 'provider', span_id: 'retry', request_id: 'provider' },
          'Transient error, retrying',
          { attempt, delayMs, error: mappedError.message }
        );

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, delayMs);
          if (signal) {
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timeout);
                reject(
                  new ProviderError(
                    'Request cancelled during retry delay',
                    ProviderErrorType.Cancelled,
                    'gemini',
                    false
                  )
                );
              },
              { once: true }
            );
          }
        });
      }
    }
  }

  async completeChat(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    return this.executeWithRetry(async () => {
      const systemMsg = req.messages.find((m) => m.role === 'system');
      const systemInstruction = systemMsg?.content;

      const contents = this.mapMessages(req.messages);
      const tools = this.mapTools(req.tools);

      const response = await this.client.models.generateContent({
        model: req.model,
        contents,
        config: {
          systemInstruction,
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          tools,
        },
      });

      let textContent = '';
      const toolCalls: ToolCall[] = [];

      if (response.candidates && response.candidates.length > 0) {
        const parts = response.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            textContent += part.text;
          }
          if (part.functionCall) {
            // Gemini doesn't always provide a stable tool call ID, so we generate one
            toolCalls.push({
              id: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: part.functionCall.name || 'unknown',
              arguments: part.functionCall.args,
            });
          }
        }
      }

      let finishReason: CompletionResponse['finishReason'] = 'stop';
      const gFinish = response.candidates?.[0]?.finishReason;
      if (gFinish === 'MAX_TOKENS') finishReason = 'length';
      else if (toolCalls.length > 0) finishReason = 'tool_calls';

      const usage = response.usageMetadata;

      return {
        content: textContent,
        model: req.model,
        usage: {
          promptTokens: usage?.promptTokenCount || 0,
          completionTokens: usage?.candidatesTokenCount || 0,
          totalTokens: usage?.totalTokenCount || 0,
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason,
      };
    }, signal);
  }

  async *streamChat(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<AIStreamEvent> {
    const streamPromise = this.executeWithRetry(async () => {
      const systemMsg = req.messages.find((m) => m.role === 'system');
      const systemInstruction = systemMsg?.content;

      const contents = this.mapMessages(req.messages);
      const tools = this.mapTools(req.tools);

      return await this.client.models.generateContentStream({
        model: req.model,
        contents,
        config: {
          systemInstruction,
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          tools,
        },
      });
    }, signal);

    const stream = await streamPromise;

    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new ProviderError('Stream cancelled', ProviderErrorType.Cancelled, 'gemini', false);
        }

        if (chunk.candidates && chunk.candidates.length > 0) {
          const parts = chunk.candidates[0].content?.parts || [];
          for (const part of parts) {
            if (part.text) {
              yield {
                type: AIStreamEventType.TextDelta,
                content: part.text,
              };
            }
            if (part.functionCall) {
              const id = `tc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
              yield {
                type: AIStreamEventType.ToolCallStart,
                toolCall: {
                  id,
                  name: part.functionCall.name || 'unknown',
                },
              };
              yield {
                type: AIStreamEventType.ToolCallDelta,
                toolCall: {
                  id,
                  rawArguments: JSON.stringify(part.functionCall.args),
                },
              };
            }
          }

          const gFinish = chunk.candidates[0].finishReason;
          if (gFinish) {
            let finishReason: CompletionResponse['finishReason'] = 'stop';
            if (gFinish === 'MAX_TOKENS') finishReason = 'length';

            yield {
              type: AIStreamEventType.Finish,
              finishReason,
            };
          }
        }

        if (chunk.usageMetadata) {
          yield {
            type: AIStreamEventType.Usage,
            usage: {
              promptTokens: chunk.usageMetadata.promptTokenCount || 0,
              completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
              totalTokens: chunk.usageMetadata.totalTokenCount || 0,
            },
          };
        }
      }
    } catch (err) {
      throw this.mapError(err);
    }
  }

  public async embed(text: string, signal?: AbortSignal): Promise<number[]> {
    // Note: Gemini provides `text-embedding-004` but we can configure this later.
    throw new ProviderError(
      'Embeddings are not yet supported by GeminiProvider in this implementation. Please configure an OpenAI provider for embeddings.',
      ProviderErrorType.InvalidRequest,
      'gemini',
      false
    );
  }

  public async embedBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    throw new ProviderError(
      'Embeddings are not yet supported by GeminiProvider in this implementation. Please configure an OpenAI provider for embeddings.',
      ProviderErrorType.InvalidRequest,
      'gemini',
      false
    );
  }
}
