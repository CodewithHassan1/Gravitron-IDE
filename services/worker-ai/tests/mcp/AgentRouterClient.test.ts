import { describe, it, expect, vi } from 'vitest';
import { AgentRouterClient } from '../../src/mcp/AgentRouterClient';

describe('AgentRouterClient — Anonymous MCP Connection', () => {
  it('establishes an anonymous MCP connection and initializes protocol', async () => {
    const client = new AgentRouterClient({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 15000,
    });

    const initResult = await client.initialize();

    expect(client.isInitialized).toBe(true);
    expect(initResult.protocolVersion).toBe('2024-11-05');
    expect(initResult.serverInfo).toBeDefined();
    expect(initResult.serverInfo.name).toContain('AgentToAgent MCP Backend');
    expect(initResult.capabilities).toBeDefined();
    expect(initResult.capabilities.tools).toBeDefined();
  }, 20000);

  it('discovers specialist agent tools and retrieves valid input schemas', async () => {
    const client = new AgentRouterClient({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 15000,
    });

    const tools = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);
    // At least 25 tools exist on the live network
    expect(tools.length).toBeGreaterThanOrEqual(20);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('discover_agents');
    expect(toolNames).toContain('a2a_call_agent');

    const discoverTool = tools.find((t) => t.name === 'discover_agents');
    expect(discoverTool).toBeDefined();
    expect(discoverTool?.description).toContain('Find agents to call');
    expect(discoverTool?.inputSchema).toBeDefined();
    expect(discoverTool?.inputSchema.type).toBe('object');
  }, 20000);

  it('performs one harmless live specialist invocation (discover_agents)', async () => {
    const client = new AgentRouterClient({
      endpoint: 'https://agent-router.org/mcp',
      timeoutMs: 25000,
    });

    const result = await client.callTool('discover_agents', {
      query: 'echo',
      limit: 2,
    });

    expect(result).toBeDefined();
    expect(result.isError).toBeFalsy();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain('agent');
  }, 30000);

  it('handles connection failures and unreachable endpoints cleanly', async () => {
    const client = new AgentRouterClient({
      endpoint: 'https://invalid-nonexistent-domain-xyz-123.org/mcp',
      timeoutMs: 3000,
    });

    await expect(client.initialize()).rejects.toThrow('MCP connection to');
  });

  it('handles simulated HTTP 401/403 authentication errors without crashing', async () => {
    const client = new AgentRouterClient({
      endpoint: 'https://example.com/mock-auth-fail',
      timeoutMs: 5000,
    });

    // Mock fetch to simulate an authentication failure response
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      statusText: 'Unauthorized',
      ok: false,
      headers: new Headers(),
      text: async () => '{"error":"Authentication required: Invalid or missing API key"}',
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await expect(client.initialize()).rejects.toThrow('MCP authentication error: HTTP 401');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('handles request timeout accurately', async () => {
    const client = new AgentRouterClient({
      endpoint: 'https://example.com/timeout',
      timeoutMs: 50,
    });

    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        }, 100);
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await expect(client.initialize()).rejects.toThrow('timed out after 50ms');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
