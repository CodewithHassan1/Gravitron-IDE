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

/**
 * Cleans and dereferences JSON schemas to conform to Google Gemini function declaration specifications.
 * Inlines $defs/$ref and removes unsupported OpenAPI schema keywords.
 */
function cleanSchemaForGemini(schema: Record<string, any>): Record<string, any> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }

  const cloned = JSON.parse(JSON.stringify(schema));
  const defs = cloned.$defs || cloned.definitions || {};

  function resolveRefs(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(resolveRefs);
    }

    if (obj.$ref && typeof obj.$ref === 'string') {
      const refKey = obj.$ref.replace(/^#\/(\$defs|definitions)\//, '');
      if (defs[refKey]) {
        const resolved = resolveRefs(JSON.parse(JSON.stringify(defs[refKey])));
        delete obj.$ref;
        Object.assign(obj, resolved);
      }
    }

    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === '$defs' || key === 'definitions' || key === '$schema') {
        continue;
      }
      clean[key] = resolveRefs(val);
    }

    return clean;
  }

  const result = resolveRefs(cloned);
  delete result.$defs;
  delete result.definitions;
  delete result.$schema;
  return result;
}

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;

  constructor(private config: ProviderConfig) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new ProviderError(
        'Gemini API key is missing',
        ProviderErrorType.Authentication,
        'gemini',
        false
      );
    }
    this.client = new GoogleGenAI({
      apiKey,
    });
  }

  private extractReadableMessage(raw: string): string {
    let text = raw || '';
    for (let i = 0; i < 2; i++) {
      const trimmed = text.trim();
      if (!trimmed.startsWith('{')) break;
      try {
        const parsed = JSON.parse(trimmed);
        const inner = parsed?.error?.message || parsed?.message;
        if (typeof inner === 'string' && inner.trim()) {
          text = inner;
          continue;
        }
      } catch {
        break;
      }
      break;
    }
    return text.trim();
  }

  private mapError(err: any): ProviderError {
    if (err instanceof ProviderError) return err;

    if (err.name === 'AbortError') {
      return new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'gemini', false);
    }

    const status = err.status || err.code;
    const readableMessage = this.extractReadableMessage(err.message || '');

    if (status) {
      if (status === 401 || status === 403) {
        return new ProviderError(
          readableMessage || 'Gemini authentication failed: invalid or unauthorized API key',
          ProviderErrorType.Authentication,
          'gemini',
          false,
          status
        );
      }
      if (status === 429) {
        return new ProviderError(
          readableMessage || 'Gemini rate limit or quota exceeded',
          ProviderErrorType.RateLimit,
          'gemini',
          true,
          status
        );
      }
      if (status === 503 || status === 500) {
        return new ProviderError(
          readableMessage || 'Gemini service temporarily unavailable (high demand)',
          ProviderErrorType.Unknown,
          'gemini',
          true,
          status
        );
      }
      if (status === 400) {
        return new ProviderError(
          readableMessage || 'Gemini bad request',
          ProviderErrorType.InvalidRequest,
          'gemini',
          false,
          status
        );
      }
    }

    return new ProviderError(
      readableMessage || 'Unknown Gemini error',
      ProviderErrorType.Unknown,
      'gemini',
      false
    );
  }

  private mapMessages(messages: ChatMessage[]): any[] {
    const rawTurns: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

    // Map toolCallId to toolName to ensure functionResponse.name matches functionCall.name
    const toolCallIdToName = new Map<string, string>();

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Handled in systemInstruction
        continue;
      }

      if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            toolCallIdToName.set(tc.id, tc.name);
            const callPart: any = {
              functionCall: {
                name: tc.name,
                args: (tc.arguments as any) || {},
              },
            };
            if (tc.thoughtSignature) {
              callPart.thoughtSignature = tc.thoughtSignature;
            }
            parts.push(callPart);
          }
        }
        if (parts.length > 0) {
          rawTurns.push({ role: 'model', parts });
        }
      } else if (msg.role === 'tool') {
        // In Gemini API, function responses belong to a user turn
        const toolName =
          (msg.toolCallId && toolCallIdToName.get(msg.toolCallId)) ||
          msg.toolName ||
          (msg.toolCallId && !msg.toolCallId.startsWith('tc_') && !msg.toolCallId.startsWith('call-')
            ? msg.toolCallId
            : 'unknown_tool');

        let responseParsed: any = msg.content;
        try {
          responseParsed = JSON.parse(msg.content);
          if (
            typeof responseParsed !== 'object' ||
            responseParsed === null ||
            Array.isArray(responseParsed)
          ) {
            responseParsed = { result: responseParsed };
          }
        } catch {
          responseParsed = { result: msg.content };
        }

        rawTurns.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: responseParsed,
              },
            },
          ],
        });
      } else {
        // User message
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (parts.length > 0) {
          rawTurns.push({ role: 'user', parts });
        }
      }
    }

    // Merge consecutive turns with the same role to strictly satisfy Gemini's alternating turn protocol
    const mergedContents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
    for (const turn of rawTurns) {
      const last = mergedContents[mergedContents.length - 1];
      if (last && last.role === turn.role) {
        last.parts.push(...turn.parts);
      } else {
        mergedContents.push({ role: turn.role, parts: [...turn.parts] });
      }
    }

    return mergedContents;
  }

  private mapTools(tools: CompletionRequest['tools']): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: cleanSchemaForGemini(t.inputSchema),
        })),
      },
    ];
  }

  private async executeWithRetry<T>(
    operation: (effectiveSignal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const maxRetries = this.config.maxRetries ?? 2;
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'gemini', false);
      }

      try {
        const abortController = new AbortController();
        const onAbort = () => abortController.abort(signal?.reason);

        let timeoutId: any;
        const timeoutMs = this.config.timeoutMs ?? 60_000;
        timeoutId = setTimeout(
          () => abortController.abort(new Error(`Gemini request timed out after ${timeoutMs}ms`)),
          timeoutMs
        );

        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }

        try {
          return await operation(abortController.signal);
        } finally {
          clearTimeout(timeoutId);
          if (signal) signal.removeEventListener('abort', onAbort);
        }
      } catch (err: any) {
        const mappedError = this.mapError(err);

        if (!mappedError.isTransient || attempt >= maxRetries || signal?.aborted) {
          throw mappedError;
        }

        attempt++;
        let delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);

        // If Google specifies an explicit retry delay in QuotaFailure / RetryInfo, honor it
        if (mappedError.message) {
          const match =
            mappedError.message.match(/retry in ([0-9.]+)s/i) ||
            mappedError.message.match(/"retryDelay":\s*"([0-9]+)s"/i);
          if (match && match[1]) {
            const parsedSeconds = parseFloat(match[1]);
            if (!isNaN(parsedSeconds) && parsedSeconds > 0 && parsedSeconds <= 65) {
              delayMs = Math.ceil(parsedSeconds * 1000) + Math.floor(Math.random() * 500);
            }
          }
        }
        logger.warn(
          { trace_id: 'provider', span_id: 'retry', request_id: 'provider' },
          'Gemini transient error, retrying',
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
    return this.executeWithRetry(async (effectiveSignal) => {
      const systemMsg = req.messages.find((m) => m.role === 'system');
      const systemInstruction = systemMsg?.content;

      const contents = this.mapMessages(req.messages);
      const tools = this.mapTools(req.tools);

      const targetModel = req.model || this.config.model || 'gemini-3.5-flash';
      const response = await this.client.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          tools,
          abortSignal: effectiveSignal,
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
            const rawId = (part.functionCall as any).id;
            const id = rawId || `tc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            toolCalls.push({
              id,
              name: part.functionCall.name || 'unknown',
              arguments: part.functionCall.args,
              thoughtSignature: (part as any).thoughtSignature,
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
    const streamPromise = this.executeWithRetry(async (effectiveSignal) => {
      const systemMsg = req.messages.find((m) => m.role === 'system');
      const systemInstruction = systemMsg?.content;

      const contents = this.mapMessages(req.messages);
      const tools = this.mapTools(req.tools);

      const targetModel = req.model || this.config.model || 'gemini-3.5-flash';
      return await this.client.models.generateContentStream({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          tools,
          abortSignal: effectiveSignal,
        },
      });
    }, signal);

    const stream = await streamPromise;

    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new ProviderError('Stream cancelled', ProviderErrorType.Cancelled, 'gemini', false);
        }

        let hasToolCall = false;

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
              hasToolCall = true;
              const rawId = (part.functionCall as any).id;
              const id = rawId || `tc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
              // Crucial for ReAct agent loop: Emit complete tool call with arguments and thoughtSignature
              yield {
                type: AIStreamEventType.ToolCallComplete,
                toolCall: {
                  id,
                  name: part.functionCall.name || 'unknown',
                  arguments: part.functionCall.args || {},
                  thoughtSignature: (part as any).thoughtSignature,
                },
              };
            }
          }

          const gFinish = chunk.candidates[0].finishReason;
          if (gFinish) {
            let finishReason: CompletionResponse['finishReason'] = 'stop';
            if (gFinish === 'MAX_TOKENS') finishReason = 'length';
            else if (hasToolCall) finishReason = 'tool_calls';

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
