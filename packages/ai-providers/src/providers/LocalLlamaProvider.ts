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

function parseInlineToolCalls(text: string): { cleanText: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let idx = 0;
  const cleanText = text
    .replace(regex, (_full, inner: string) => {
      try {
        const parsed = JSON.parse(inner.trim());
        const name = typeof parsed?.name === 'string' ? parsed.name : '';
        if (name) {
          toolCalls.push({
            id: `local_call_${Date.now()}_${idx++}`,
            name,
            arguments: parsed.arguments ?? {},
          });
        }
        return '';
      } catch {
        return _full;
      }
    })
    .trim();

  return { cleanText, toolCalls };
}

function mapMessagesToOpenAI(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId || `call_${m.toolName || 'tool'}`,
        content: m.content,
      };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments ?? {}),
          },
        })),
      };
    }
    return {
      role: m.role,
      content: m.content,
    };
  });
}

export class LocalLlamaProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private config: ProviderConfig) {
    if (!config.baseURL || !config.baseURL.trim()) {
      throw new ProviderError(
        'Local inference runtime endpoint (baseURL) is not configured. Load a local model first.',
        ProviderErrorType.InvalidRequest,
        'local',
        false
      );
    }
    this.baseUrl = config.baseURL.replace(/\/+$/, '');
    this.apiKey = config.apiKey || 'local-runtime';
    this.timeoutMs = config.timeoutMs || 600000;
  }

  private buildPayload(req: CompletionRequest, stream: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: req.model || this.config.model || 'local-model',
      messages: mapMessagesToOpenAI(req.messages),
      temperature: req.temperature ?? 0.2,
      stream,
    };

    if (typeof req.maxTokens === 'number' && req.maxTokens > 0) {
      payload.max_tokens = req.maxTokens;
    }

    if (req.tools && req.tools.length > 0) {
      payload.tools = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
      payload.tool_choice = 'auto';
    }

    return payload;
  }

  private mapFetchError(err: any): ProviderError {
    if (err instanceof ProviderError) return err;
    if (err?.name === 'AbortError') {
      return new ProviderError('Request cancelled', ProviderErrorType.Cancelled, 'local', false);
    }
    return new ProviderError(
      err?.message || 'Local inference request failed',
      ProviderErrorType.Unknown,
      'local',
      true
    );
  }

  public async completeChat(
    req: CompletionRequest,
    signal?: AbortSignal
  ): Promise<CompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildPayload(req, false)),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderError(
          `Local llama-server error (${res.status}): ${errText.slice(0, 300)}`,
          /context|n_ctx|exceeds/i.test(errText)
            ? ProviderErrorType.ContextExhausted
            : ProviderErrorType.Unknown,
          'local',
          res.status >= 500,
          res.status
        );
      }

      const data = (await res.json()) as any;
      const choice = data?.choices?.[0];
      const msg = choice?.message || {};
      let content: string = msg.content || '';
      const rawToolCalls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      let toolCalls: ToolCall[] = rawToolCalls.map((tc, i) => {
        let parsedArgs: unknown = {};
        try {
          parsedArgs =
            typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : tc.function?.arguments ?? {};
        } catch {
          parsedArgs = {};
        }
        return {
          id: tc.id || `local_call_${Date.now()}_${i}`,
          name: tc.function?.name || '',
          arguments: parsedArgs,
        };
      });

      if (toolCalls.length === 0 && content.includes('<tool_call>')) {
        const inline = parseInlineToolCalls(content);
        if (inline.toolCalls.length > 0) {
          content = inline.cleanText;
          toolCalls = inline.toolCalls;
        }
      }

      return {
        content,
        model: data?.model || req.model,
        usage: {
          promptTokens: data?.usage?.prompt_tokens ?? 0,
          completionTokens: data?.usage?.completion_tokens ?? 0,
          totalTokens: data?.usage?.total_tokens ?? 0,
        },
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      };
    } catch (err: any) {
      throw this.mapFetchError(err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  public async *streamChat(
    req: CompletionRequest,
    signal?: AbortSignal
  ): AsyncIterable<AIStreamEvent> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildPayload(req, true)),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new ProviderError(
          `Local llama-server stream error (${res.status}): ${errText.slice(0, 300)}`,
          /context|n_ctx|exceeds/i.test(errText)
            ? ProviderErrorType.ContextExhausted
            : ProviderErrorType.Unknown,
          'local',
          res.status >= 500,
          res.status
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const activeToolCalls = new Map<number, { id: string; name: string; rawArgs: string }>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;

          let chunk: any;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }

          const delta = chunk?.choices?.[0]?.delta;
          if (delta?.reasoning_content) {
            yield { type: AIStreamEventType.Reasoning, content: delta.reasoning_content };
          }
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            fullText += delta.content;
            yield { type: AIStreamEventType.TextDelta, content: delta.content };
          }
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const index: number = typeof tc.index === 'number' ? tc.index : 0;
              let entry = activeToolCalls.get(index);
              if (!entry) {
                entry = {
                  id: tc.id || `local_call_${Date.now()}_${index}`,
                  name: tc.function?.name || '',
                  rawArgs: '',
                };
                activeToolCalls.set(index, entry);
                yield {
                  type: AIStreamEventType.ToolCallStart,
                  toolCall: { id: entry.id, name: entry.name },
                };
              } else {
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
              }
              if (typeof tc.function?.arguments === 'string' && tc.function.arguments.length > 0) {
                entry.rawArgs += tc.function.arguments;
                yield {
                  type: AIStreamEventType.ToolCallDelta,
                  toolCall: { id: entry.id, name: entry.name, rawArguments: tc.function.arguments },
                };
              }
            }
          }
          if (chunk?.usage) {
            yield {
              type: AIStreamEventType.Usage,
              usage: {
                promptTokens: chunk.usage.prompt_tokens ?? 0,
                completionTokens: chunk.usage.completion_tokens ?? 0,
                totalTokens: chunk.usage.total_tokens ?? 0,
              },
            };
          }
        }
      }

      if (activeToolCalls.size > 0) {
        for (const entry of activeToolCalls.values()) {
          let parsedArgs: unknown = {};
          try {
            parsedArgs = entry.rawArgs ? JSON.parse(entry.rawArgs) : {};
          } catch {
            parsedArgs = {};
          }
          yield {
            type: AIStreamEventType.ToolCallComplete,
            toolCall: { id: entry.id, name: entry.name, arguments: parsedArgs },
          };
        }
        yield { type: AIStreamEventType.Finish, finishReason: 'tool_calls' };
      } else if (fullText.includes('<tool_call>')) {
        const inline = parseInlineToolCalls(fullText);
        if (inline.toolCalls.length > 0) {
          for (const tc of inline.toolCalls) {
            yield {
              type: AIStreamEventType.ToolCallComplete,
              toolCall: tc,
            };
          }
          yield { type: AIStreamEventType.Finish, finishReason: 'tool_calls' };
          return;
        }
        yield { type: AIStreamEventType.Finish, finishReason: 'stop' };
      } else {
        yield { type: AIStreamEventType.Finish, finishReason: 'stop' };
      }
    } catch (err: any) {
      throw this.mapFetchError(err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
