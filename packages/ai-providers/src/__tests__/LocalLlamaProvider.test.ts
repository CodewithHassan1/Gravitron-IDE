import http from 'http';
import { describe, expect, it, afterAll } from 'vitest';
import { LocalLlamaProvider } from '../providers/LocalLlamaProvider';
import { AIStreamEventType } from '../types';

describe('LocalLlamaProvider', () => {
  let server: http.Server | null = null;

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  });

  it('streams OpenAI SSE deltas and tool calls from local llama-server endpoint', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: 'Inspecting file...' } }],
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: 'read_file', arguments: '{"path":"package.json"}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };

    const provider = new LocalLlamaProvider({
      model: 'qwen3-4b-instruct-2507',
      baseURL: `http://127.0.0.1:${addr.port}`,
      apiKey: 'local-test-secret',
    });

    const events: any[] = [];
    for await (const ev of provider.streamChat({
      model: 'qwen3-4b-instruct-2507',
      messages: [{ role: 'user', content: 'Check package.json' }],
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ],
    })) {
      events.push(ev);
    }

    const deltas = events.filter((e) => e.type === AIStreamEventType.TextDelta).map((e) => e.content).join('');
    const toolEvents = events.filter((e) => e.type === AIStreamEventType.ToolCallComplete);

    expect(deltas).toBe('Inspecting file...');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].toolCall.name).toBe('read_file');
    expect(toolEvents[0].toolCall.arguments).toEqual({ path: 'package.json' });
  });
});
