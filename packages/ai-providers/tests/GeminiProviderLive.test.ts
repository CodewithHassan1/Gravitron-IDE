import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../src/providers/GeminiProvider';
import { ProviderError, ProviderErrorType } from '../src/errors';
import { AIStreamEventType, CompletionRequest } from '../src/types';

describe('GeminiProvider — Live API and Contract Verification', () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const liveModel = 'gemini-3.5-flash-lite';

  it('throws Authentication ProviderError when apiKey is missing', () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      expect(() => new GeminiProvider({})).toThrowError(ProviderError);
      try {
        new GeminiProvider({});
      } catch (err: any) {
        expect(err.errorType).toBe(ProviderErrorType.Authentication);
        expect(err.isTransient).toBe(false);
      }
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });

  it.skipIf(!apiKey)('authenticates and completes live single-turn chat with Google Gemini', async () => {
    const provider = new GeminiProvider({ apiKey });

    const req: CompletionRequest = {
      model: liveModel,
      messages: [{ role: 'user', content: 'Respond with exactly: HELLO_GRAVITRON' }],
      maxTokens: 50,
      temperature: 0,
    };

    const res = await provider.completeChat(req);

    expect(res).toBeDefined();
    expect(res.content).toContain('HELLO_GRAVITRON');
    expect(res.model).toBe(liveModel);
    expect(res.usage.totalTokens).toBeGreaterThan(0);
  }, 20000);

  it.skipIf(!apiKey)('streams text deltas live from Google Gemini', async () => {
    const provider = new GeminiProvider({ apiKey });

    const req: CompletionRequest = {
      model: liveModel,
      messages: [{ role: 'user', content: 'Count from 1 to 3.' }],
      maxTokens: 50,
      temperature: 0,
    };

    const stream = provider.streamChat(req);
    let fullText = '';
    let textDeltaCount = 0;

    for await (const event of stream) {
      if (event.type === AIStreamEventType.TextDelta && event.content) {
        fullText += event.content;
        textDeltaCount++;
      }
    }

    expect(textDeltaCount).toBeGreaterThan(0);
    expect(fullText.length).toBeGreaterThan(0);
  }, 20000);

  it.skipIf(!apiKey)('executes live tool calling with schema dereferencing ($defs/$ref inlining)', async () => {
    const provider = new GeminiProvider({ apiKey });

    // Schema with $defs and $ref, matching AgentRouter specialist structure
    const complexSchema = {
      $defs: {
        PathPayload: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Target file path' },
          },
          required: ['filePath'],
        },
      },
      type: 'object',
      properties: {
        payload: { $ref: '#/$defs/PathPayload' },
      },
      required: ['payload'],
    };

    const req: CompletionRequest = {
      model: liveModel,
      messages: [
        {
          role: 'user',
          content: 'Please inspect the repository file src/index.ts using the file_inspector tool.',
        },
      ],
      tools: [
        {
          name: 'file_inspector',
          description: 'Inspects a file at a specific path in the repository',
          inputSchema: complexSchema,
        },
      ],
      temperature: 0,
    };

    const stream = provider.streamChat(req);
    let toolCallReceived: any = null;

    for await (const event of stream) {
      if (event.type === AIStreamEventType.ToolCallComplete && event.toolCall) {
        toolCallReceived = event.toolCall;
      }
    }

    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived.name).toBe('file_inspector');
    expect(toolCallReceived.arguments).toBeDefined();
    // Validates that $defs/$ref inlining was accepted by Google API without a 400 error
    expect(toolCallReceived.arguments.payload).toBeDefined();
  }, 25000);

  it.skipIf(!apiKey)('preserves multi-turn roundtrip with thoughtSignature and functionResponse', async () => {
    const provider = new GeminiProvider({ apiKey });

    const tools = [
      {
        name: 'read_workspace_file',
        description: 'Reads contents of a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    ];

    // Turn 1: Model generates tool call
    const turn1Res = await provider.completeChat({
      model: liveModel,
      messages: [{ role: 'user', content: 'What is inside config.json? Use read_workspace_file.' }],
      tools,
      temperature: 0,
    });

    expect(turn1Res.toolCalls).toBeDefined();
    expect(turn1Res.toolCalls!.length).toBeGreaterThan(0);
    const tc = turn1Res.toolCalls![0];
    expect(tc.name).toBe('read_workspace_file');
    expect(tc.thoughtSignature).toBeDefined();

    // Turn 2: Return functionResponse with tool result, preserving thoughtSignature
    const turn2Res = await provider.completeChat({
      model: liveModel,
      messages: [
        { role: 'user', content: 'What is inside config.json? Use read_workspace_file.' },
        {
          role: 'assistant',
          content: turn1Res.content,
          toolCalls: [tc],
        },
        {
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: JSON.stringify({ version: '2.5.0-verified', environment: 'production' }),
        },
      ],
      tools,
      temperature: 0,
    });

    expect(turn2Res).toBeDefined();
    expect(turn2Res.content).toContain('2.5.0-verified');
  }, 30000);
});
